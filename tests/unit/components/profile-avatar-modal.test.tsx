import { ProfileAvatarModal } from '@/components/profile/profile-avatar-modal'
import { api } from '@/lib/api'
import { userAvatarPath } from '@/lib/api-paths'
import { UPLOAD_TIMEOUT_MS } from '@/lib/upload-transport'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const profile = {
  id: 'user-1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'López',
  is_root: false,
}

vi.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ onChange }: { onChange: (file: File | null) => void }) => (
    <button type="button" onClick={() => onChange(new File(['avatar'], 'avatar.webp', { type: 'image/webp' }))}>
      Seleccionar avatar
    </button>
  ),
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('ProfileAvatarModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.post).mockResolvedValue({
      data: { status: 200, data: { path: 'avatars/user-1.webp', url: 'https://signed.example.com/avatar.webp' } },
    })
  })

  it('uploads the selected image, refreshes the profile, and closes', async () => {
    const onClose = vi.fn()
    const onAvatarChange = vi.fn()

    render(<ProfileAvatarModal open onClose={onClose} onAvatarChange={onAvatarChange} value={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar avatar' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        userAvatarPath(),
        expect.any(FormData),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          timeout: UPLOAD_TIMEOUT_MS,
          onUploadProgress: expect.any(Function),
        })
      )
    )
    expect(onAvatarChange).toHaveBeenCalledWith('https://signed.example.com/avatar.webp')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the modal recoverable when the server does not confirm an avatar URL', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { status: 200, data: { path: 'avatars/user-1.webp' } } })
    const onClose = vi.fn()
    const onAvatarChange = vi.fn()

    render(<ProfileAvatarModal open onClose={onClose} onAvatarChange={onAvatarChange} value={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar avatar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no confirmó la nueva foto')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(onAvatarChange).not.toHaveBeenCalled()
    expect(onClose.mock.calls).not.toContainEqual([])
  })
})
