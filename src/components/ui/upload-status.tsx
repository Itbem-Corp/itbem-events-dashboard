import type { UploadTaskStatus } from '@/hooks/use-upload-task'

interface UploadStatusProps {
  status: UploadTaskStatus
  progress: number | null
  error?: string | null
  onCancel: () => void
  onRetry: () => void
  label?: string
  preparingLabel?: string
  compact?: boolean
}

export function UploadStatus({
  status,
  progress,
  error,
  onCancel,
  onRetry,
  label = 'Subiendo archivo',
  preparingLabel = 'Preparando archivo…',
  compact = false,
}: UploadStatusProps) {
  if (status === 'idle' || status === 'success') return null

  if (status === 'error' || status === 'canceled') {
    const canceled = status === 'canceled'
    return (
      <div
        role={canceled ? 'status' : 'alert'}
        className={[
          'flex gap-3 rounded-xl border',
          canceled
            ? 'border-white/10 bg-white/[0.035] text-ink-secondary'
            : 'border-red-400/20 bg-red-400/[0.07] text-red-100',
          compact ? 'items-center px-3 py-2' : 'flex-col p-3 sm:flex-row sm:items-center sm:justify-between',
        ].join(' ')}
      >
        <p className="min-w-0 text-xs leading-5">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className={[
            'min-h-11 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors',
            canceled
              ? 'border-white/10 text-ink hover:bg-white/5'
              : 'border-red-300/20 text-red-100 hover:bg-red-300/10',
          ].join(' ')}
        >
          Reintentar
        </button>
      </div>
    )
  }

  const determinate = progress !== null
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2 rounded-xl border border-white/10 bg-white/[0.035] p-3'}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span role="status" aria-live="polite" className="font-medium text-ink-secondary">
          {progress === 0 ? preparingLabel : label}
          {determinate && progress > 0 ? ` · ${progress}%` : ''}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 shrink-0 px-2 font-semibold text-ink-secondary transition-colors hover:text-white"
        >
          Cancelar
        </button>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? progress : undefined}
        className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={[
            'h-full rounded-full bg-indigo-400 transition-[width] duration-200',
            determinate ? '' : 'w-1/3 animate-pulse',
          ].join(' ')}
          style={determinate ? { width: `${progress}%` } : undefined}
        />
      </div>
    </div>
  )
}
