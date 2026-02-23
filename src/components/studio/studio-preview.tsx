'use client'

import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeftIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  Squares2X2Icon,
} from '@heroicons/react/20/solid'
import type { DeviceMode } from '@/components/studio/studio-constants'
import { DEVICE_DIMENSIONS } from '@/components/studio/studio-constants'

interface StudioPreviewProps {
  previewUrl: string
  device: DeviceMode
  setDevice: (d: DeviceMode) => void
  refreshPreview: () => void
  iframeKey: number
  eventName?: string
  eventIdentifier?: string
  showPreview: boolean
  setShowPreview: (v: boolean) => void
  publicFrontendUrl: string
}

export function StudioPreview({
  previewUrl,
  device,
  setDevice,
  refreshPreview,
  iframeKey,
  eventName,
  eventIdentifier,
  showPreview,
  setShowPreview,
  publicFrontendUrl,
}: StudioPreviewProps) {
  return (
    <div
      className={[
        'flex flex-col flex-1 min-w-0 bg-zinc-900',
        showPreview ? 'flex' : 'hidden lg:flex',
      ].join(' ')}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-zinc-950">
        {/* Mobile: back to editor button */}
        <button
          onClick={() => setShowPreview(false)}
          className="lg:hidden shrink-0 flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
        >
          <ChevronLeftIcon className="size-3.5" />
          <span className="sr-only">Volver al editor</span>
        </button>

        {/* Device toggles */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {([
            { mode: 'desktop' as DeviceMode, icon: ComputerDesktopIcon, label: 'Desktop' },
            { mode: 'tablet' as DeviceMode, icon: Squares2X2Icon, label: 'Tablet' },
            { mode: 'mobile' as DeviceMode, icon: DevicePhoneMobileIcon, label: 'Movil' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setDevice(mode)}
              title={label}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                device === mode
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5',
              ].join(' ')}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* URL bar -- hidden on mobile to save space */}
        <div className="hidden sm:flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 min-w-0">
          <GlobeAltIcon className="size-3.5 text-zinc-600 shrink-0" />
          <span className="text-xs text-zinc-500 font-mono truncate">
            {previewUrl.replace(`?preview=1&t=${iframeKey}`, '?preview=1')}
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={refreshPreview}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title="Refrescar vista previa"
        >
          <ArrowPathIcon className="size-4" />
        </button>

        {/* Open in new tab */}
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title="Abrir en nueva pestana"
        >
          ↗
        </a>
      </div>

      {/* IFrame container */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-2 sm:p-4 bg-zinc-900">
        <AnimatePresence mode="wait">
          <motion.div
            key={device}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-white w-full"
            style={{
              maxWidth: DEVICE_DIMENSIONS[device].maxW,
              minHeight: device === 'desktop' ? 'calc(100vh - 120px)' : '600px',
              height: device === 'desktop' ? 'calc(100vh - 120px)' : 'auto',
            }}
          >
            {/* Browser chrome for non-desktop */}
            {device !== 'desktop' && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 border-b border-zinc-200">
                <div className="size-2.5 rounded-full bg-red-400" />
                <div className="size-2.5 rounded-full bg-amber-400" />
                <div className="size-2.5 rounded-full bg-lime-400" />
                <div className="flex-1 rounded-md bg-white border border-zinc-200 h-4 mx-2 flex items-center px-2">
                  <span className="text-[9px] text-zinc-400 font-mono truncate">
                    {publicFrontendUrl}/e/{eventIdentifier}
                  </span>
                </div>
              </div>
            )}

            {eventName ? (
              <iframe
                key={iframeKey}
                src={previewUrl}
                className="w-full border-0"
                style={{
                  height: device === 'desktop' ? '100%' : '812px',
                  minHeight: '500px',
                }}
                title={`Vista previa — ${eventName}`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="size-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
