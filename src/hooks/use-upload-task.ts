'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getUploadErrorMessage,
  isUploadCanceled,
  uploadRequestConfig,
  type UploadRequestConfig,
} from '@/lib/upload-transport'

export type UploadTaskStatus = 'idle' | 'uploading' | 'success' | 'error' | 'canceled'

type UploadOperation<T> = (requestConfig: UploadRequestConfig) => Promise<T>

export type UploadTaskResult<T> = { ok: true; value: T } | { ok: false; canceled: boolean; error: string }

export function useUploadTask(fallbackError: string) {
  const [status, setStatus] = useState<UploadTaskStatus>('idle')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const lastOperationRef = useRef<UploadOperation<unknown> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const execute = useCallback(
    async <T>(operation: UploadOperation<T>): Promise<UploadTaskResult<T>> => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setStatus('uploading')
      setProgress(0)
      setError(null)

      try {
        const value = await operation(
          uploadRequestConfig(controller.signal, (nextProgress) => {
            if (mountedRef.current && !controller.signal.aborted) setProgress(nextProgress)
          })
        )
        if (controller.signal.aborted) throw new DOMException('Upload canceled', 'AbortError')
        if (mountedRef.current && !controller.signal.aborted) {
          setProgress(100)
          setStatus('success')
        }
        return { ok: true, value }
      } catch (cause: unknown) {
        const canceled = isUploadCanceled(cause) || controller.signal.aborted
        const message = getUploadErrorMessage(cause, fallbackError)
        if (mountedRef.current && controllerRef.current === controller) {
          setStatus(canceled ? 'canceled' : 'error')
          setError(message)
        }
        return { ok: false, canceled, error: message }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    [fallbackError]
  )

  const start = useCallback(
    <T>(operation: UploadOperation<T>) => {
      lastOperationRef.current = operation as UploadOperation<unknown>
      return execute(operation)
    },
    [execute]
  )

  const retry = useCallback(() => {
    const operation = lastOperationRef.current
    if (!operation)
      return Promise.resolve<UploadTaskResult<unknown>>({
        ok: false,
        canceled: false,
        error: fallbackError,
      })
    return execute(operation)
  }, [execute, fallbackError])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])
  const reset = useCallback(() => {
    const controller = controllerRef.current
    // Detach before aborting so the rejected request cannot overwrite the
    // freshly reset idle state with a stale "canceled" result.
    controllerRef.current = null
    controller?.abort()
    lastOperationRef.current = null
    setStatus('idle')
    setProgress(null)
    setError(null)
  }, [])

  return {
    status,
    progress,
    error,
    isUploading: status === 'uploading',
    canRetry: Boolean(lastOperationRef.current) && (status === 'error' || status === 'canceled'),
    start,
    retry,
    cancel,
    reset,
  }
}
