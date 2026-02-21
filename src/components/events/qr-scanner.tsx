'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface Props {
  onScan: (token: string) => void
  onClose: () => void
}

export function QRScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    let active = true
    let codeReader: any = null

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        codeReader = new BrowserMultiFormatReader()

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (devices.length === 0) {
          setError('No se encontró cámara en este dispositivo')
          return
        }

        // Prefer back camera on mobile
        const back = devices.find((d: MediaDeviceInfo) => /back|rear|environment/i.test(d.label))
        const deviceId = back?.deviceId ?? devices[0].deviceId

        await codeReader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
            (result: any, err: any) => {
            if (!active) return
            if (result) {
              const text: string = result.getText()
              // Extract token from URL if full URL, else use raw text
              const match = text.match(/[?&]token=([^&]+)/)
              const token = match ? match[1] : text
              setScanning(false)
              onScan(token)
            }
            if (err && err.name !== 'NotFoundException') {
              console.warn('[QRScanner]', err)
            }
          },
        )
      } catch (e) {
        if (active) setError('No se pudo acceder a la cámara. Verifica los permisos.')
        console.error('[QRScanner] init error', e)
      }
    }

    startScanner()

    return () => {
      active = false
      codeReader?.reset()
    }
  }, [onScan])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 text-white z-10"
          aria-label="Cerrar scanner"
        >
          <XMarkIcon className="size-6" />
        </button>

        {/* Title */}
        <p className="absolute top-6 left-0 right-0 text-center text-white text-lg font-medium pointer-events-none">
          Escanear QR del invitado
        </p>

        {/* Camera viewport */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80">
          <video
            ref={videoRef}
            className="w-full h-full object-cover rounded-2xl"
            playsInline
            muted
          />

          {/* Scan frame */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-white border-4 border-r-0 border-b-0 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-white border-4 border-l-0 border-b-0 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-white border-4 border-r-0 border-t-0 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-white border-4 border-l-0 border-t-0 rounded-br-lg" />
              {/* Scanning line */}
              <motion.div
                className="absolute left-2 right-2 h-0.5 bg-emerald-400 opacity-80"
                animate={{ top: ['8px', 'calc(100% - 8px)', '8px'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          )}
        </div>

        {error ? (
          <p className="mt-6 text-red-400 text-sm text-center px-8">{error}</p>
        ) : (
          <p className="mt-6 text-zinc-400 text-sm">
            Apunta la cámara al código QR de la invitación
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
