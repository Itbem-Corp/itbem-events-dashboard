'use client'

import { NAVIGATION_PROGRESS_START } from '@/lib/navigation-progress'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const SHOW_DELAY_MS = 120
const COMPLETE_DELAY_MS = 180
const MAX_PENDING_MS = 8000

type ProgressPhase = 'idle' | 'waiting' | 'loading' | 'finishing'

export function NavigationProgress() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<ProgressPhase>('idle')
  const [progress, setProgress] = useState(0)
  const phaseRef = useRef<ProgressPhase>('idle')
  const previousPathnameRef = useRef(pathname)
  const initialHrefRef = useRef<string | null>(null)
  const timeoutIdsRef = useRef<number[]>([])
  const locationPollRef = useRef<number | null>(null)

  const clearPendingWork = useCallback(() => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id))
    timeoutIdsRef.current = []

    if (locationPollRef.current !== null) {
      window.clearInterval(locationPollRef.current)
      locationPollRef.current = null
    }
  }, [])

  const schedule = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(callback, delay)
    timeoutIdsRef.current.push(id)
  }, [])

  const reset = useCallback(() => {
    clearPendingWork()
    phaseRef.current = 'idle'
    initialHrefRef.current = null
    setPhase('idle')
    setProgress(0)
  }, [clearPendingWork])

  const finish = useCallback(() => {
    if (phaseRef.current === 'idle') return

    if (phaseRef.current === 'waiting') {
      reset()
      return
    }

    clearPendingWork()
    phaseRef.current = 'finishing'
    setPhase('finishing')
    setProgress(100)
    schedule(reset, COMPLETE_DELAY_MS)
  }, [clearPendingWork, reset, schedule])

  const start = useCallback(() => {
    clearPendingWork()
    phaseRef.current = 'waiting'
    initialHrefRef.current = window.location.href
    setPhase('waiting')
    setProgress(0)

    schedule(() => {
      if (phaseRef.current !== 'waiting') return
      phaseRef.current = 'loading'
      setPhase('loading')
      setProgress(18)

      schedule(() => setProgress(68), 40)
      schedule(() => setProgress(86), 900)
    }, SHOW_DELAY_MS)

    locationPollRef.current = window.setInterval(() => {
      if (initialHrefRef.current && window.location.href !== initialHrefRef.current) {
        finish()
      }
    }, 50)

    schedule(finish, MAX_PENDING_MS)
  }, [clearPendingWork, finish, schedule])

  useEffect(() => {
    window.addEventListener(NAVIGATION_PROGRESS_START, start)
    return () => window.removeEventListener(NAVIGATION_PROGRESS_START, start)
  }, [start])

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname
    finish()
    const focusFrame = window.requestAnimationFrame(() => {
      document.getElementById('dashboard-main')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(focusFrame)
  }, [finish, pathname])

  useEffect(() => {
    return () => clearPendingWork()
  }, [clearPendingWork])

  const isVisible = phase === 'loading' || phase === 'finishing'

  return (
    <>
      <div
        aria-hidden="true"
        data-navigation-progress=""
        data-state={phase}
        className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="h-full origin-left bg-gradient-to-r from-indigo-500 via-violet-400 to-sky-300 shadow-[0_0_12px_rgba(129,140,248,0.75)] transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>

      {isVisible && (
        <span className="sr-only" role="status">
          Cargando nueva vista
        </span>
      )}
    </>
  )
}
