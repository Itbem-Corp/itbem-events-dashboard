import { useEffect, useRef, useState } from 'react'

/**
 * Returns a ref and a `visible` boolean.
 * `visible` becomes true once the element enters the viewport and stays true (one-shot).
 * Falls back to true immediately if IntersectionObserver is not supported.
 */
export function useLazyVisible(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    const el = ref.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, visible }
}
