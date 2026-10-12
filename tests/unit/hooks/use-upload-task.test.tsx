import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useUploadTask } from '@/hooks/use-upload-task'

describe('useUploadTask', () => {
  it('cancels an in-flight request and keeps it available for retry', async () => {
    const { result } = renderHook(() => useUploadTask('No pudimos subir'))

    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.start(
        (config) =>
          new Promise((_resolve, reject) => {
            config.signal?.addEventListener?.('abort', () => reject(new DOMException('Canceled', 'AbortError')))
          })
      )
    })
    act(() => result.current.cancel())
    await act(async () => pending)

    expect(result.current.status).toBe('canceled')
    expect(result.current.error).toBe('Carga cancelada. El archivo no se guardó.')
    expect(result.current.canRetry).toBe(true)
  })

  it('does not let a canceled older request overwrite a newer upload state', async () => {
    const { result } = renderHook(() => useUploadTask('No pudimos subir'))
    let resolveSecond!: (value: string) => void

    act(() => {
      void result.current.start(
        (config) =>
          new Promise((_resolve, reject) => {
            config.signal?.addEventListener?.('abort', () => {
              setTimeout(() => reject(new DOMException('Canceled', 'AbortError')), 0)
            })
          })
      )
    })

    act(() => {
      void result.current.start(() => new Promise<string>((resolve) => (resolveSecond = resolve)))
    })

    await waitFor(() => expect(result.current.status).toBe('uploading'))
    act(() => resolveSecond('ok'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(result.current.error).toBeNull()
  })

  it('keeps the task idle when reset aborts an in-flight upload', async () => {
    const { result } = renderHook(() => useUploadTask('No pudimos subir'))
    let pending!: Promise<unknown>

    act(() => {
      pending = result.current.start(
        (config) =>
          new Promise((_resolve, reject) => {
            config.signal?.addEventListener?.('abort', () =>
              reject(new DOMException('Canceled', 'AbortError'))
            )
          })
      )
    })

    act(() => result.current.reset())
    await act(async () => pending)

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.progress).toBeNull()
    expect(result.current.canRetry).toBe(false)
  })
})

describe('useUploadTask after the server answered', () => {
  it('reports success when the cancel arrives after the response', async () => {
    const { result } = renderHook(() => useUploadTask('No pudimos subir'))
    let resolveUpload!: (value: string) => void
    let pending!: Promise<{ ok: boolean }>

    act(() => {
      pending = result.current.start(() => new Promise<string>((resolve) => (resolveUpload = resolve)))
    })
    // The response is already on its way when the user presses cancel.
    act(() => {
      resolveUpload('saved')
      result.current.cancel()
    })
    const outcome = await act(async () => pending)

    expect(outcome).toEqual({ ok: true, value: 'saved' })
    expect(result.current.status).toBe('success')
    expect(result.current.error).toBeNull()
  })
})
