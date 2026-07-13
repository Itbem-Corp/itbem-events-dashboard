'use client'

import { parseCheckinQrPayload } from '@/lib/checkin-qr'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const loadQrEngine = () => import('@zxing/browser')

export function preloadQRScannerEngine(): Promise<unknown> {
  return loadQrEngine()
}

interface Props {
  onScan: (token: string) => void
  onClose: () => void
}

export function QRScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    let completed = false
    let controls: import('@zxing/browser').IScannerControls | null = null
    const videoElement = videoRef.current

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await loadQrEngine()
        if (!active || !videoElement) return

        const codeReader = new BrowserMultiFormatReader()
        controls = await codeReader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoElement,
          (result, decodeError) => {
            if (!active) return
            if (result && !completed) {
              completed = true
              const { token } = parseCheckinQrPayload(result.getText())
              setScanning(false)
              controls?.stop()
              onScan(token)
            }
            if (decodeError && decodeError.name !== 'NotFoundException') {
              console.warn('[QRScanner]', decodeError)
            }
          }
        )
      } catch {
        if (active) {
          setScanning(false)
          setError('No se pudo acceder a la cámara. Verifica los permisos.')
        }
      }
    }

    void startScanner()

    return () => {
      active = false
      controls?.stop()
      const stream = videoElement?.srcObject
      if (stream && typeof (stream as MediaStream).getTracks === 'function') {
        const mediaStream = stream as MediaStream
        mediaStream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [onScan, retryKey])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 rounded-full bg-zinc-800 p-2 text-white"
          aria-label="Cerrar escáner"
        >
          <XMarkIcon className="size-6" />
        </button>

        <p
          id="qr-scanner-title"
          className="pointer-events-none absolute top-6 right-0 left-0 text-center text-lg font-medium text-white"
        >
          Escanear QR del invitado
        </p>

        <div className="relative h-72 w-72 sm:h-80 sm:w-80">
          <video ref={videoRef} className="h-full w-full rounded-2xl object-cover" playsInline muted />

          {scanning && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-0 left-0 h-8 w-8 rounded-tl-lg border-4 border-r-0 border-b-0 border-white" />
              <div className="absolute top-0 right-0 h-8 w-8 rounded-tr-lg border-4 border-b-0 border-l-0 border-white" />
              <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-4 border-t-0 border-r-0 border-white" />
              <div className="absolute right-0 bottom-0 h-8 w-8 rounded-br-lg border-4 border-t-0 border-l-0 border-white" />
              <motion.div
                className="absolute right-2 left-2 h-0.5 bg-emerald-400 opacity-80"
                animate={{ top: ['8px', 'calc(100% - 8px)', '8px'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          )}
        </div>

        {error ? (
          <div role="alert" className="mt-6 space-y-3 px-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setScanning(true)
                setRetryKey((key) => key + 1)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <ArrowPathIcon className="size-4" />
              Reintentar cámara
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-400">Apunta la cámara al código QR de la invitación</p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
