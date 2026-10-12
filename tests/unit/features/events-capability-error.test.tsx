import { EventCapabilityError } from '@/components/events/event-capability-error'
import { capabilityErrorKind, httpStatusOf } from '@/features/events/capability-error'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('capabilityErrorKind', () => {
  it('separates a denial from a failure to load', () => {
    expect(capabilityErrorKind({ response: { status: 403 } })).toBe('forbidden')
    expect(capabilityErrorKind({ status: 404, payload: {} })).toBe('not_found')
    expect(capabilityErrorKind({ response: { status: 500 } })).toBe('unavailable')
    expect(capabilityErrorKind({ response: { status: 503 } })).toBe('unavailable')
    expect(capabilityErrorKind(new Error('Network Error'))).toBe('unavailable')
    expect(capabilityErrorKind(undefined)).toBe('unavailable')
  })

  it('reads the status from axios and apiFetch errors', () => {
    expect(httpStatusOf({ response: { status: 409 } })).toBe(409)
    expect(httpStatusOf({ status: 422 })).toBe(422)
    expect(httpStatusOf({ status: 'x' })).toBeUndefined()
  })
})

describe('EventCapabilityError', () => {
  it('offers Reintentar that calls the retry handler', () => {
    const onRetry = vi.fn()
    render(
      <EventCapabilityError
        title="No pudimos verificar tu acceso a Studio"
        description="Revisa tu conexión e inténtalo de nuevo."
        onRetry={onRetry}
        backHref="/events/evt-1"
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('No pudimos verificar tu acceso a Studio')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows Reintentando… while retrying', () => {
    render(<EventCapabilityError title="t" description="d" onRetry={vi.fn()} retrying />)
    const button = screen.getByRole('button', { name: /Reintentando/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
