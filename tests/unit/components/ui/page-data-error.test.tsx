import { PageDataError } from '@/components/ui/page-data-error'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

describe('PageDataError', () => {
  it('provides an accessible retry action', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<PageDataError title="No pudimos cargar" description="La información sigue intacta." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('communicates and locks an active retry', () => {
    render(
      <PageDataError
        title="No pudimos cargar"
        description="La información sigue intacta."
        onRetry={() => undefined}
        retrying
      />
    )

    expect(screen.getByRole('button', { name: 'Reintentando…' })).toBeDisabled()
  })
})
