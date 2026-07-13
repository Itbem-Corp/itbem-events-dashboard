import { getPageActivity, usePageActivity } from '@/hooks/usePageActivity'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility)
})

describe('page activity', () => {
  it('requires the document to be both visible and focused', () => {
    setVisibility('visible')
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    expect(getPageActivity()).toBe(true)

    vi.mocked(document.hasFocus).mockReturnValue(false)
    expect(getPageActivity()).toBe(false)

    setVisibility('hidden')
    vi.mocked(document.hasFocus).mockReturnValue(true)
    expect(getPageActivity()).toBe(false)
  })

  it('reacts to window focus changes without polling', () => {
    let focused = true
    setVisibility('visible')
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
    const { result } = renderHook(() => usePageActivity())

    expect(result.current).toBe(true)

    focused = false
    act(() => window.dispatchEvent(new Event('blur')))
    expect(result.current).toBe(false)

    focused = true
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current).toBe(true)
  })
})
