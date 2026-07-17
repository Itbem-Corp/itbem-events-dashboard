'use client'

import { useColorTheme } from '@/components/theme/theme-provider'
import { Toaster } from 'sonner'

export function ThemedToaster() {
  const { theme } = useColorTheme()
  return <Toaster closeButton richColors theme={theme} position="top-right" />
}
