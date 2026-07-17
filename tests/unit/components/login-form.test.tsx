import { LoginForm } from '@/components/auth/login-form'
import type { TenantConfig } from '@/lib/tenant-config'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigationMocks = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }) => <div {...props}>{children}</div>,
    section: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLElement> & { initial?: unknown; animate?: unknown; transition?: unknown }) => (
      <section {...props}>{children}</section>
    ),
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      transition: _transition,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      whileHover?: unknown
      whileTap?: unknown
      transition?: unknown
    }) => <button {...props}>{children}</button>,
  },
}))
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => <button aria-label="Cambiar tema" /> }))

vi.mock('next/image', () => ({
  default: ({ src, alt, priority: _priority, unoptimized: _unoptimized, ...props }: any) => (
    <img src={typeof src === 'string' ? src : (src?.src ?? '')} alt={alt ?? ''} {...props} />
  ),
}))

const tenant: Omit<TenantConfig, 'clientId'> = {
  code: 'eventiapp',
  organizationCode: 'eventiapp',
  name: 'EventiApp',
  productLabel: 'Event operations',
  hostname: 'dashboard.eventiapp.com.mx',
  hostnames: ['dashboard.eventiapp.com.mx'],
  localHostnames: ['localhost'],
  apiHostname: 'api.eventiapp.com.mx',
  modules: ['home', 'events'],
  accent: '#818cf8',
}

async function fillCredentials() {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Correo de trabajo' }), 'owner@eventiapp.com')
  await user.type(screen.getByLabelText('Contraseña'), 'Secret123!')
  await user.click(screen.getByRole('button', { name: 'Entrar al dashboard' }))
  return user
}

describe('LoginForm', () => {
  afterEach(() => {
    navigationMocks.replace.mockReset()
    vi.unstubAllGlobals()
  })

  it('reuses the verified session and enters the dashboard without a document reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          session: {
            application: {
              id: 'app-1',
              code: 'eventiapp',
              name: 'EventiApp',
              product_label: 'Event operations',
              modules: ['home', 'events'],
              allows_platform_admin: true,
              is_active: true,
            },
            user: { id: 'user-1', email: 'owner@eventiapp.com', is_root: true },
            organizations: [],
            capabilities: ['metrics:view'],
          },
        }),
      })
    )
    render(<LoginForm tenant={tenant} />)

    await fillCredentials()

    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith('/'))
  })

  it('renders the tenant identity and exposes the password safely', async () => {
    const user = userEvent.setup()
    render(<LoginForm tenant={tenant} />)

    expect(screen.getByRole('heading', { name: 'Tu operación empieza aquí.' })).toBeInTheDocument()
    const password = screen.getByLabelText('Contraseña')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves smoothly into the required-password challenge and lets the user change account', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ challenge: 'NEW_PASSWORD_REQUIRED' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginForm tenant={tenant} />)

    const user = await fillCredentials()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sign-in',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'owner@eventiapp.com', password: 'Secret123!' }),
      })
    )
    expect(await screen.findByRole('heading', { name: 'Crea una contraseña nueva' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('minlength', '8')
    expect(screen.queryByRole('textbox', { name: 'Correo de trabajo' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cambiar cuenta' }))
    expect(screen.getByRole('textbox', { name: 'Correo de trabajo' })).toHaveValue('owner@eventiapp.com')
  })

  it('renders the MFA step returned by Cognito', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ challenge: 'SOFTWARE_TOKEN_MFA' }),
      })
    )
    render(<LoginForm tenant={tenant} />)

    await fillCredentials()

    expect(await screen.findByRole('heading', { name: 'Confirma que eres tú' })).toBeInTheDocument()
    expect(screen.getByLabelText('Código de tu aplicación autenticadora')).toHaveAttribute(
      'autocomplete',
      'one-time-code'
    )
    expect(screen.getByRole('button', { name: 'Verificar identidad' })).toBeInTheDocument()
  })

  it('shows a clear server error without losing the entered account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Correo o contraseña incorrectos.' }),
      })
    )
    render(<LoginForm tenant={tenant} />)

    await fillCredentials()

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Correo de trabajo' })).toHaveValue('owner@eventiapp.com')
    )
  })
})
