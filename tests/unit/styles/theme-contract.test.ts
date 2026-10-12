import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('swr', () => ({
  default: () => ({ data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: () => undefined }),
  preload: () => Promise.resolve(undefined),
  useSWRConfig: () => ({ cache: new Map() }),
  unstable_serialize: (key: unknown) => JSON.stringify(key),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/ui/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/theme/theme-provider', () => ({ useColorTheme: () => ({ theme: 'light', toggleTheme: () => undefined }) }))
vi.mock('@/features/workspace/issue-organization-context', () => ({
  issueOrganizationContext: (organizationId: string) =>
    Promise.resolve({ token: 'context-token', organizationId, expiresAt: '2099-01-01T00:00:00.000Z' }),
}))

import { ApplicationLayout } from '@/components/application-layout'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import type { TenantCode } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('global theme contract', () => {
  const roots = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')]
  const files = roots.flatMap(sourceFiles)

  it('keeps application neutrals on semantic theme tokens', () => {
    const forbidden = /(?:(?:bg|from|via|to)-zinc-(?:950|900|800|700)|text-zinc-(?:950|900|800|700|600|500|400|300|200|100|50)|(?:border(?:-l)?|outline|ring-offset)-zinc-(?:950|900|800|700|600|500|400|300|200|100)|(?:placeholder|fill|stroke|decoration)-zinc-(?:950|900|800|700|600|500|400|300))/
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return forbidden.test(source) ? [file.replace(process.cwd(), '')] : []
    })

    expect(violations).toEqual([])
  })

  it('does not force a native control into one color scheme', () => {
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('[color-scheme:dark]') || source.includes('[color-scheme:light]')
        ? [file.replace(process.cwd(), '')]
        : []
    })

    expect(violations).toEqual([])
  })

  it('defines every semantic utility consumed by the component system', () => {
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'styles', 'tailwind.css'), 'utf8')

    for (const token of [
      '--color-canvas',
      '--color-surface',
      '--color-surface-raised',
      '--color-surface-soft',
      '--color-ink',
      '--color-ink-secondary',
      '--color-ink-muted',
      '--color-border-subtle',
      '--color-border-strong',
    ]) {
      expect(stylesheet).toContain(token)
    }
  })

  it('keeps the authenticated shell aligned with the product brand language', () => {
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'styles', 'tailwind.css'), 'utf8')

    for (const primitive of [
      '--app-brand-gradient',
      '.app-brand-cta',
      '.app-hero-surface',
      '.app-shell-panel',
      '.premium-surface',
    ]) {
      expect(stylesheet).toContain(primitive)
    }
  })
})

describe('accessible shell contract per product', () => {
  const SMALL_TEXT = /(^|\s)text-\[(9|10)px\]/

  function ownerSession(code: TenantCode): ApplicationSession {
    return {
      application: {
        id: `application-${code}`,
        code,
        name: code,
        product_label: 'Operations',
        modules: [...getProductManifest(code).backendModules],
        allows_platform_admin: code !== 'cafettonhouse',
        is_active: true,
      },
      user: { id: 'owner', email: 'owner@example.test', first_name: 'Ana', last_name: 'Propietaria', is_root: false, root_level: 0 },
      organizations: [
        { id: 'org-a', name: 'Organización A', code: 'org-a', access_role: 'OWNER', capabilities: ['events:view', 'members:manage', 'metrics:view'] },
        { id: 'org-b', name: 'Organización B', code: 'org-b', access_role: 'OWNER', capabilities: ['events:view', 'members:manage', 'metrics:view'] },
      ],
      capabilities: ['events:view', 'members:manage', 'metrics:view'],
    } as unknown as ApplicationSession
  }

  function renderShell(code: TenantCode, hostname: string) {
    const session = ownerSession(code)
    useStore.getState().clearSession()
    useStore.setState({
      applicationSession: session,
      user: session.user,
      profileLoaded: true,
      workspaceContexts: {
        [code]: { mode: 'organization', organization: { id: 'org-a', name: 'Organización A', code: 'org-a', client_type: { code: 'CUSTOMER' } } },
      },
    })
    return render(
      createElement(ProductProvider, {
        product: getProductManifest(code),
        children: createElement(ApplicationLayout, { tenant: tenantPresentationForHostname(hostname), children: 'Contenido' }),
      })
    )
  }

  function smallTextElements(root: HTMLElement) {
    return Array.from(root.querySelectorAll<HTMLElement>('[class]')).filter((element) =>
      SMALL_TEXT.test(element.getAttribute('class') ?? '')
    )
  }

  afterEach(() => {
    cleanup()
    useStore.getState().clearSession()
  })

  it('renders no 9px or 10px text in the EventiApp shell', () => {
    const { container } = renderShell('eventiapp', 'dashboard.eventiapp.com.mx')

    expect(screen.getByText('Espacio de trabajo')).toBeInTheDocument()
    expect(smallTextElements(container).map((element) => element.textContent)).toEqual([])
  })

  it('renders the Cafetton House shell with its existing small text', () => {
    const { container } = renderShell('cafettonhouse', 'dashboard.cafettonhouse.com')

    const texts = smallTextElements(container).map((element) => element.textContent)
    expect(texts).toContain('Dashboard')
    expect(texts).toContain('Espacio de trabajo')
    expect(texts).toContain('Client operations')
  })
})
