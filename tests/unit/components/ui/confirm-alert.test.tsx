import { CONFIRM_ALERT_OPEN_GUARD_MS, ConfirmAlert } from '@/components/ui/confirm-alert'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const waitForConfirmGuard = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, CONFIRM_ALERT_OPEN_GUARD_MS + 20)))

// The grid around the panel (title → panel → grid): where the second click of a double click on the trigger lands.
const outsidePanel = () => screen.getByText('¿Aprobar 12 momentos?').parentElement?.parentElement as HTMLElement

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

    await waitForConfirmGuard()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores the trailing click of a double click right after opening', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmAlert open title="¿Aprobar 12 momentos?" description="" onClose={onClose} onConfirm={onConfirm} />
    )

    await user.click(outsidePanel())
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()

    await waitForConfirmGuard()
    await user.click(outsidePanel())
    expect(onClose).toHaveBeenCalledTimes(1)
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
