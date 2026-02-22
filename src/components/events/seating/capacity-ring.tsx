'use client'

import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { useEffect } from 'react'

interface CapacityRingProps {
  current: number
  capacity: number
  size?: number
}

export function CapacityRing({ current, capacity, size = 44 }: CapacityRingProps) {
  const pct = capacity > 0 ? Math.min(100, (current / capacity) * 100) : 0
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const progress = useMotionValue(0)
  const strokeDashoffset = useTransform(
    progress,
    (v) => circumference - (v / 100) * circumference,
  )

  useEffect(() => {
    const ctrl = animate(progress, pct, { duration: 0.6, ease: 'easeOut' })
    return () => ctrl.stop()
  }, [pct, progress])

  const color =
    pct >= 100 ? '#ef4444'
    : pct >= 75 ? '#f59e0b'
    : '#6366f1'

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-zinc-800"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ strokeDasharray: circumference, strokeDashoffset }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-zinc-300 tabular-nums">
          {current}/{capacity}
        </span>
      </div>
    </div>
  )
}
