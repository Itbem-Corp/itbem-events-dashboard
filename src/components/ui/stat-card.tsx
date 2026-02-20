'use client'

import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { Divider } from '@/components/divider'
import { Badge } from '@/components/badge'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
}

export function StatCard({ title, value, change }: StatCardProps) {
  const count = useMotionValue(0)
  const numericValue = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString('es-MX'))

  useEffect(() => {
    const controls = animate(count, numericValue, {
      duration: 1.2,
      ease: 'easeOut',
    })
    return controls.stop
  }, [numericValue])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Divider />
      <div className="mt-6 text-lg/6 font-medium sm:text-sm/6">{title}</div>
      <motion.div className="mt-3 text-3xl/8 font-semibold sm:text-2xl/8">
        {rounded}
      </motion.div>
      {change && (
        <div className="mt-3 text-sm/6 sm:text-xs/6">
          <Badge color={change.startsWith('+') ? 'lime' : 'pink'}>{change}</Badge>{' '}
          <span className="text-zinc-500">vs semana anterior</span>
        </div>
      )}
    </motion.div>
  )
}
