'use client'

import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'

interface ProgressRingProps {
  value: number       // 0-100
  size?: number       // px (default 80)
  strokeWidth?: number
  color?: string      // Tailwind color class or CSS color
  label?: string
  sublabel?: string
  className?: string
}

export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 7,
  color = '#6366f1',
  label,
  sublabel,
  className = '',
}: ProgressRingProps) {
  const clampedValue = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const progress = useMotionValue(0)
  const strokeDashoffset = useTransform(
    progress,
    (v) => circumference - (v / 100) * circumference
  )

  const displayValue = useMotionValue(0)
  const displayText = useTransform(displayValue, (v) => `${Math.round(v)}%`)

  useEffect(() => {
    const controls1 = animate(progress, clampedValue, {
      duration: 1,
      ease: 'easeOut',
    })
    const controls2 = animate(displayValue, clampedValue, {
      duration: 1,
      ease: 'easeOut',
    })
    return () => {
      controls1.stop()
      controls2.stop()
    }
  }, [clampedValue, progress, displayValue])

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-zinc-800"
          />
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
            }}
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className="text-base font-bold text-zinc-100 tabular-nums">
            {displayText}
          </motion.span>
        </div>
      </div>

      {label && (
        <div className="text-center">
          <p className="text-xs font-medium text-zinc-300">{label}</p>
          {sublabel && <p className="text-xs text-zinc-600 mt-0.5">{sublabel}</p>}
        </div>
      )}
    </div>
  )
}
