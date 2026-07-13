import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProfilePage from '@/app/(app)/settings/profile/page'
import { ACCEPT_PRESETS, FileUpload } from '@/components/ui/file-upload'
import { SECTION_IMAGE_UPLOAD_HELP_TEXT } from '@/lib/resource-upload-policy'

const storeMocks = vi.hoisted(() => {
  const defaultUser = {
    id: 'user-001',
    email: 'ana@example.com',
    first_name: 'Ana',
    last_name: 'Lopez',
    is_active: true,
    is_root: false,
    profile_image: 'https://signed.example.com/avatar.webp',
  }

  return {
    defaultUser,
    setProfile: vi.fn(),
    user: { ...defaultUser } as typeof defaultUser | null,
  }
})

const swrMocks = vi.hoisted(() => ({
  data: undefined as typeof storeMocks.defaultUser | undefined,
  error: undefined as Error | undefined,
  mutate: vi.fn(),
  isValidating: false,
  calls: [] as unknown[][],
}))

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiMocks }))
vi.mock('swr', () => ({
  default: (...args: unknown[]) => {
    swrMocks.calls.push(args)
    return {
      data: swrMocks.data,
      error: swrMocks.error,
      isValidating: swrMocks.isValidating,
      mutate: swrMocks.mutate,
    }
  },
}))

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: storeMocks.user,
      setProfile: storeMocks.setProfile,
    }),
}))

vi.mock('@/components/ui/file-upload', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/file-upload')>('@/components/ui/file-upload')
  return {
    ...actual,
    FileUpload: vi.fn(() => <div data-testid="file-upload" />),
  }
})

describe('ProfilePage avatar upload', () => {
  beforeEach(() => {
    apiMocks.get.mockReset()
    apiMocks.put.mockReset()
    storeMocks.user = { ...storeMocks.defaultUser }
    storeMocks.setProfile.mockClear()
    swrMocks.data = undefined
    swrMocks.error = undefined
    swrMocks.mutate.mockClear()
    swrMocks.calls = []
  })

  it('uses the backend-aligned image upload policy for avatars', async () => {
    const user = userEvent.setup()
    render(<ProfilePage />)

    expect(FileUpload).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cambiar foto' }))

    await waitFor(() => expect(FileUpload).toHaveBeenCalled())
    const props = vi.mocked(FileUpload).mock.calls[0][0]

    expect(props.previewType).toBe('user-avatar')
    expect(props.accept).toEqual(ACCEPT_PRESETS.IMAGES)
    expect(props.maxSize).toBe(10 * 1024 * 1024)
    expect(props.description).toBe(`${SECTION_IMAGE_UPLOAD_HELP_TEXT} · Hasta 10 MB`)
  })

  it('uses the update response without a second profile request', async () => {
    const user = userEvent.setup()
    apiMocks.put.mockResolvedValueOnce({
      data: {
        status: 200,
        data: {
          ...storeMocks.user,
          first_name: 'Andrea',
        },
      },
    })

    render(<ProfilePage />)
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Andrea')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(apiMocks.put).toHaveBeenCalledTimes(1))
    expect(apiMocks.get).not.toHaveBeenCalled()
    expect(storeMocks.setProfile).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Andrea' }))
    expect(swrMocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Andrea' }), {
      revalidate: false,
    })
  })

  it('updates immediately and rolls back the shared profile when saving fails', async () => {
    const user = userEvent.setup()
    apiMocks.put.mockRejectedValueOnce(new Error('offline'))

    render(<ProfilePage />)
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Andrea')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(apiMocks.put).toHaveBeenCalledTimes(1))
    expect(storeMocks.setProfile).toHaveBeenNthCalledWith(1, expect.objectContaining({ first_name: 'Andrea' }))
    expect(storeMocks.setProfile).toHaveBeenLastCalledWith(expect.objectContaining({ first_name: 'Ana' }))
    expect(swrMocks.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ first_name: 'Ana' }), {
      revalidate: false,
    })
    expect(screen.getByDisplayValue('Andrea')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('prevents empty profile names before calling the API', async () => {
    const user = userEvent.setup()
    render(<ProfilePage />)

    await user.clear(screen.getByLabelText('Nombre'))

    expect(screen.getByRole('alert')).toHaveTextContent('Nombre y apellidos son obligatorios')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })

  it('shows a stable profile skeleton instead of a blank page during bootstrap', () => {
    storeMocks.user = null

    render(<ProfilePage />)

    expect(screen.getByRole('status', { name: 'Cargando perfil' })).toBeInTheDocument()
  })

  it('renders the persisted profile immediately while revalidating the shared resource', () => {
    render(<ProfilePage />)

    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(swrMocks.calls[0]?.[0]).toBe('/users')
    expect(swrMocks.calls[0]?.[2]).toEqual(expect.objectContaining({ fallbackData: storeMocks.defaultUser }))
  })

  it('offers a retry when the profile bootstrap fails', async () => {
    const user = userEvent.setup()
    storeMocks.user = null
    swrMocks.error = new Error('offline')

    render(<ProfilePage />)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tu perfil')
    expect(swrMocks.mutate).toHaveBeenCalledOnce()
  })
})
