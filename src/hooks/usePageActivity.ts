'use client'

import { useEffect, useState } from 'react'

export function getPageActivity(): boolean {
  if (typeof document === 'undefined') return true

  const isVisible = document.visibilityState === 'visible'
  const hasFocus = typeof document.hasFocus !== 'function' || document.hasFocus()
  return isVisible && hasFocus
}

export function usePageActivity(): boolean {
  const [isActive, setIsActive] = useState(getPageActivity)

  useEffect(() => {
    const syncActivity = () => setIsActive(getPageActivity())

    syncActivity()
    document.addEventListener('visibilitychange', syncActivity)
    window.addEventListener('focus', syncActivity)
    window.addEventListener('blur', syncActivity)

    return () => {
      document.removeEventListener('visibilitychange', syncActivity)
      window.removeEventListener('focus', syncActivity)
      window.removeEventListener('blur', syncActivity)
    }
  }, [])

  return isActive
}
