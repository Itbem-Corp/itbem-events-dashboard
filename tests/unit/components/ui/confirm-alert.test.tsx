import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

describe('ConfirmAlert', () => {
  it('requires an explicit confirmation before running a destructive action', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmAlert
        open
        title="¿Eliminar registro?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cannot be dismissed while the confirmed action is running', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmAlert
        open
        busy
        title="Procesando"
        description="Espera un momento."
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
    expect(cancelButton).toBeDisabled()
    await user.click(cancelButton)
    expect(onClose).not.toHaveBeenCalled()
  })
})
