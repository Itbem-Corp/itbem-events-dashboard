'use client'

import { useRef, useCallback, useState } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/20/solid'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { injectPngDpi } from '@/lib/png-dpi'

/* ── Real eventiapp logo as inline data URI (never taints canvas) ────── */
const LOGO_DATA_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150.16 160.61">' +
    '<path fill="#dd2284" d="M84.04,51.16c-4.5-2.04-9.42-2.92-14.76-2.64-4.36.28-8.44,1.27-12.23,2.95-3.79,1.69-7.14,3.98-10.02,6.85-2.88,2.88-5.24,6.22-7.07,10.02-1.83,3.79-2.95,7.94-3.37,12.44-.42,5.35.28,10.27,2.11,14.76,1.83,4.5,4.43,8.02,7.8,10.55l48.3-47.03c-2.67-3.23-6.26-5.87-10.76-7.91Z"/>' +
    '<path fill="#dd2284" d="M71.7,21.16c-33.92,0-61.42,27.5-61.42,61.42s27.5,61.42,61.42,61.42,61.42-27.5,61.42-61.42-27.5-61.42-61.42-61.42ZM97.01,129.51c-7.8,3.94-16.28,5.91-25.41,5.91-7.17,0-13.92-1.37-20.25-4.11-6.33-2.74-11.81-6.43-16.45-11.07-4.64-4.64-8.33-10.12-11.07-16.45-2.74-6.33-4.11-13.08-4.11-20.25s1.37-14.13,4.11-20.46,6.43-11.84,11.07-16.56c4.64-4.71,10.12-8.44,16.45-11.18s13.08-4.11,20.25-4.11c9.14,0,17.75,2.11,25.84,6.33,8.08,4.22,15.08,10.76,20.98,19.61l-61.16,56.94c2.25,1.55,5.06,2.64,8.44,3.27,3.38.63,6.75.74,10.12.32,5.91-.7,11.42-2.71,16.56-6.01,5.13-3.3,9.45-7.49,12.97-12.55l12.02,11.6c-5.77,8.58-12.55,14.84-20.35,18.77Z"/>' +
    '<polygon fill="#ffffff" points="119.78 77.03 129.47 76.89 121.71 82.7 124.84 91.87 116.92 86.29 109.16 92.09 112.03 82.83 104.11 77.25 113.8 77.11 116.66 67.86 119.78 77.03"/>' +
    '</svg>'
  )

/** Brand pink used for the eventiapp icon */
const BRAND_PINK = '#ec4899'
const BRAND_PINK_DARK = '#f472b6'

/* ── Branded QR Card ─────────────────────────────────────────────────── */

interface BrandedQRProps {
  /** URL the QR code encodes */
  value: string
  /** Title shown above the QR code */
  title?: string
  /** Subtitle / description shown below the title */
  subtitle?: string
  /** Optional extra line below QR (e.g. guest name) */
  caption?: string
  /** Filename stem for the PNG download (without extension) */
  downloadName?: string
  /** Visible QR size in px (default 180) */
  size?: number
  /** Hi‑res canvas size for download (default 1200) */
  downloadSize?: number
  /** Show the download button (default true) */
  showDownload?: boolean
  /** Dark mode variant — dark card background (default false = white card) */
  dark?: boolean
}

export function BrandedQR({
  value,
  title,
  subtitle,
  caption,
  downloadName = 'qr-eventiapp',
  size = 180,
  downloadSize = 2400,
  showDownload = true,
  dark = false,
}: BrandedQRProps) {
  const canvasId = useRef(`branded-qr-${Math.random().toString(36).slice(2, 8)}`).current
  const [downloading, setDownloading] = useState(false)
  const [done, setDone] = useState(false)

  const handleDownload = useCallback(async () => {
    const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement | null
    if (!qrCanvas || downloading) return

    setDownloading(true)

    // Small delay so canvas finishes rendering logo
    await new Promise((r) => setTimeout(r, 80))

    const padding = 80
    const logoHeight = 36
    const titleHeight = title ? 48 : 0
    const subtitleHeight = subtitle ? 28 : 0
    const captionHeight = caption ? 32 : 0
    const gap = 24
    const footerHeight = 28
    const totalHeight =
      padding + logoHeight + gap + titleHeight + subtitleHeight + (titleHeight || subtitleHeight ? gap : 0) +
      downloadSize + gap + captionHeight + (captionHeight ? gap / 2 : 0) + footerHeight + padding

    const totalWidth = downloadSize + padding * 2

    const canvas = document.createElement('canvas')
    canvas.width = totalWidth
    canvas.height = totalHeight
    const ctx = canvas.getContext('2d')!

    // Background
    ctx.fillStyle = dark ? '#18181b' : '#ffffff'
    ctx.roundRect(0, 0, totalWidth, totalHeight, 32)
    ctx.fill()

    // Border
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 2
    ctx.roundRect(0, 0, totalWidth, totalHeight, 32)
    ctx.stroke()

    let y = padding

    const textColor = dark ? '#e4e4e7' : '#18181b'
    const mutedColor = dark ? '#71717a' : '#a1a1aa'

    // Brand name
    ctx.fillStyle = dark ? BRAND_PINK_DARK : BRAND_PINK
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('eventiapp', totalWidth / 2, y + 28)
    y += logoHeight + gap

    // Title
    if (title) {
      ctx.fillStyle = textColor
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      let displayTitle = title
      while (ctx.measureText(displayTitle).width > totalWidth - padding * 2 && displayTitle.length > 3) {
        displayTitle = displayTitle.slice(0, -4) + '...'
      }
      ctx.fillText(displayTitle, totalWidth / 2, y + 32)
      y += titleHeight
    }

    // Subtitle
    if (subtitle) {
      ctx.fillStyle = mutedColor
      ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(subtitle, totalWidth / 2, y + 20)
      y += subtitleHeight
    }

    if (titleHeight || subtitleHeight) y += gap

    // QR container
    const qrPadding = 32
    const containerSize = downloadSize + qrPadding * 2
    const containerX = (totalWidth - containerSize) / 2
    const containerY = y - qrPadding

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(containerX, containerY, containerSize, containerSize, 20)
    ctx.fill()

    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(containerX, containerY, containerSize, containerSize, 20)
    ctx.stroke()

    ctx.drawImage(qrCanvas, (totalWidth - downloadSize) / 2, y)
    y += downloadSize + gap

    // Caption
    if (caption) {
      ctx.fillStyle = textColor
      ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(caption, totalWidth / 2, y + 20)
      y += captionHeight + gap / 2
    }

    // Footer
    ctx.fillStyle = mutedColor
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Escanea con tu camara', totalWidth / 2, y + 18)

    try {
      const rawDataUrl = canvas.toDataURL('image/png')
      const dataUrl = injectPngDpi(rawDataUrl, 300)
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${downloadName}.png`
      a.click()
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      toast.error('Error al descargar el QR')
    } finally {
      setDownloading(false)
    }
  }, [canvasId, downloadSize, title, subtitle, caption, downloadName, dark, downloading])

  return (
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Branded card */}
      <div
        className={[
          'rounded-2xl border p-6 flex flex-col items-center gap-4 w-full max-w-[280px]',
          dark
            ? 'bg-zinc-900/80 border-white/10'
            : 'bg-white border-zinc-200 shadow-sm',
        ].join(' ')}
      >
        {/* Logo + brand */}
        <div className="flex items-center gap-2">
          {/* Real eventiapp icon */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/eventiapp-icon.svg"
            alt=""
            aria-hidden="true"
            className={`h-4 w-auto ${dark ? 'opacity-90' : ''}`}
          />
          <span className={`text-xs font-semibold tracking-wide ${dark ? 'text-pink-400' : 'text-pink-500'}`}>
            eventiapp
          </span>
        </div>

        {/* Title */}
        {title && (
          <p className={`text-sm font-semibold text-center leading-snug ${dark ? 'text-zinc-100' : 'text-zinc-900'}`}>
            {title}
          </p>
        )}

        {/* Subtitle */}
        {subtitle && (
          <p className={`text-xs text-center -mt-2 ${dark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {subtitle}
          </p>
        )}

        {/* QR Code */}
        <motion.div
          className={[
            'rounded-xl p-4',
            dark ? 'bg-white' : 'bg-zinc-50 border border-zinc-100',
          ].join(' ')}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <QRCodeSVG
            value={value}
            size={size}
            bgColor={dark ? '#ffffff' : '#fafafa'}
            fgColor="#18181b"
            level="M"
            imageSettings={{
              src: LOGO_DATA_URI,
              height: Math.round(size * 0.16),
              width: Math.round(size * 0.15),
              excavate: true,
            }}
          />
        </motion.div>

        {/* Caption */}
        {caption && (
          <p className={`text-xs font-medium text-center ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            {caption}
          </p>
        )}

        {/* Scan hint */}
        <p className={`text-[10px] tracking-wide uppercase ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Escanea con tu camara
        </p>
      </div>

      {/* Download button */}
      {showDownload && (
        <motion.button
          onClick={handleDownload}
          disabled={downloading}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className={[
            'relative flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors shadow-sm overflow-hidden',
            done
              ? 'bg-emerald-500 shadow-emerald-500/20'
              : downloading
              ? 'bg-pink-400 cursor-not-allowed shadow-pink-500/20'
              : 'bg-pink-500 hover:bg-pink-400 shadow-pink-500/20',
          ].join(' ')}
        >
          {/* Shimmer overlay while downloading */}
          <AnimatePresence>
            {downloading && (
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {done ? (
              <motion.span
                key="done"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <CheckIcon className="size-4" />
                Descargado
              </motion.span>
            ) : (
              <motion.span
                key="download"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <motion.span
                  animate={downloading ? { rotate: 360 } : { rotate: 0 }}
                  transition={downloading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
                >
                  <ArrowDownTrayIcon className="size-4" />
                </motion.span>
                {downloading ? 'Generando…' : 'Descargar QR'}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}

      {/* Hidden hi-res canvas for download */}
      <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
        <QRCodeCanvas
          id={canvasId}
          value={value}
          size={downloadSize}
          bgColor="#ffffff"
          fgColor="#18181b"
          level="H"
          imageSettings={{
            src: LOGO_DATA_URI,
            height: Math.round(downloadSize * 0.16),
            width: Math.round(downloadSize * 0.15),
            excavate: true,
          }}
        />
      </div>
    </motion.div>
  )
}
