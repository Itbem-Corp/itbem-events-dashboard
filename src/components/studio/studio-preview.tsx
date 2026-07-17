'use client'

import type { DeviceMode } from '@/components/studio/studio-constants'
import { DEVICE_DIMENSIONS } from '@/components/studio/studio-constants'
import { sanitizePublicAccessDisplayUrl } from '@/lib/public-urls'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  Squares2X2Icon,
} from '@heroicons/react/20/solid'

interface StudioPreviewProps {
  previewUrl: string
  device: DeviceMode
  setDevice: (d: DeviceMode) => void
  refreshPreview: () => void
  iframeKey: number
  eventName?: string
  showPreview: boolean
  setShowPreview: (v: boolean) => void
  publicUrl?: string
  previewError?: string
}

export function StudioPreview({
  previewUrl,
  device,
  setDevice,
  refreshPreview,
  iframeKey,
  eventName,
  showPreview,
  setShowPreview,
  publicUrl,
  previewError,
}: StudioPreviewProps) {
  const displayPreviewUrl = (() => {
    if (publicUrl) return sanitizePublicAccessDisplayUrl(publicUrl)
    if (!previewUrl) return ''
    return sanitizePublicAccessDisplayUrl(previewUrl)
  })()

  return (
    <div className={['flex min-w-0 flex-1 flex-col bg-surface', showPreview ? 'flex' : 'hidden lg:flex'].join(' ')}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-canvas px-4 py-2.5">
        {/* Mobile: back to editor button */}
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
        >
          <ChevronLeftIcon className="size-3.5" />
          <span className="sr-only">Volver al editor</span>
        </button>

        {/* Device toggles */}
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {[
            { mode: 'desktop' as DeviceMode, icon: ComputerDesktopIcon, label: 'Desktop' },
            { mode: 'tablet' as DeviceMode, icon: Squares2X2Icon, label: 'Tablet' },
            { mode: 'mobile' as DeviceMode, icon: DevicePhoneMobileIcon, label: 'Movil' },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              type="button"
              key={mode}
              onClick={() => setDevice(mode)}
              title={label}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                device === mode ? 'bg-indigo-600 text-white' : 'text-ink-muted hover:bg-white/5 hover:text-ink-secondary',
              ].join(' ')}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* URL bar -- hidden on mobile to save space */}
        <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-surface px-3 py-1.5 sm:flex">
          <GlobeAltIcon className="size-3.5 shrink-0 text-ink-muted" />
          <span className="truncate font-mono text-xs text-ink-muted">{displayPreviewUrl}</span>
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={refreshPreview}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
          title="Refrescar vista previa"
        >
          <ArrowPathIcon className="size-4" />
        </button>

        {/* Open in new tab */}
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!previewUrl}
          className={[
            'flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs transition-colors',
            previewUrl ? 'text-ink-secondary hover:bg-white/5 hover:text-ink' : 'pointer-events-none text-ink-muted',
          ].join(' ')}
          title="Abrir en nueva pestana"
        >
          <ArrowTopRightOnSquareIcon className="size-4" />
        </a>
      </div>

      {/* IFrame container */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-surface p-2 sm:p-4">
        <div
          key={device}
          className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"
          style={{
            maxWidth: DEVICE_DIMENSIONS[device].maxW,
            minHeight: device === 'desktop' ? 'calc(100vh - 120px)' : '600px',
            height: device === 'desktop' ? 'calc(100vh - 120px)' : 'auto',
          }}
        >
          {/* Browser chrome for non-desktop */}
          {device !== 'desktop' && (
            <div className="flex items-center gap-1.5 border-b border-border-subtle bg-surface-raised px-3 py-2">
              <div className="size-2.5 rounded-full bg-red-400" />
              <div className="size-2.5 rounded-full bg-amber-400" />
              <div className="size-2.5 rounded-full bg-lime-400" />
              <div className="mx-2 flex h-4 flex-1 items-center rounded-md border border-border-subtle bg-white px-2">
                <span className="truncate font-mono text-[9px] text-ink-secondary">{displayPreviewUrl}</span>
              </div>
            </div>
          )}

          {previewError ? (
            <div role="alert" className="flex h-96 flex-col items-center justify-center gap-3 px-6 text-center">
              <ExclamationTriangleIcon className="size-8 text-amber-500" />
              <p className="max-w-sm text-sm font-medium text-ink-muted">{previewError}</p>
              <button
                type="button"
                onClick={refreshPreview}
                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <ArrowPathIcon className="size-4" />
                Reintentar
              </button>
            </div>
          ) : eventName && previewUrl ? (
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="w-full border-0"
              style={{
                height: device === 'desktop' ? '100%' : '812px',
                minHeight: '500px',
              }}
              title={`Vista previa - ${eventName}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex h-96 items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
