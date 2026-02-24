'use client'

import { useRef, useCallback } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { ArrowDownTrayIcon } from '@heroicons/react/20/solid'

/* ── EventiApp logomark (icon only, no wordmark) ────────────────────── */
function EventiAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 22" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.99906 0.5L6.57031 0.742752L0.570312 10.7428V11.2572L6.57031 21.2572L6.99906 21.5H18.9991L19.3526 20.6464L16.8526 18.1464L16.4991 18H9.27424L4.8409 11L9.27424 4H16.4991L16.8526 3.85355L19.3526 1.35355L18.9991 0.5H6.99906Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.7927 4.21875L18.3657 6.64575L18.2969 7.2668L20.6605 10.9993L18.2969 14.7318L18.3657 15.3529L20.7927 17.7799L21.5751 17.6835L25.4311 11.2565V10.7421L21.5751 4.31507L20.7927 4.21875Z"
      />
    </svg>
  )
}

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
  downloadSize = 1200,
  showDownload = true,
  dark = false,
}: BrandedQRProps) {
  const canvasId = useRef(`branded-qr-${Math.random().toString(36).slice(2, 8)}`).current

  const handleDownload = useCallback(() => {
    // We'll paint a branded card around the QR onto an offscreen canvas
    const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement | null
    if (!qrCanvas) return

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

    // Logo icon + text
    const textColor = dark ? '#e4e4e7' : '#18181b'
    const mutedColor = dark ? '#71717a' : '#a1a1aa'

    // Draw "eventiapp" text as brand
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
      // Truncate if too long
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

    // QR code with rounded container
    const qrPadding = 32
    const containerSize = downloadSize + qrPadding * 2
    const containerX = (totalWidth - containerSize) / 2
    const containerY = y - qrPadding

    // QR background
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(containerX, containerY, containerSize, containerSize, 20)
    ctx.fill()

    // QR border
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(containerX, containerY, containerSize, containerSize, 20)
    ctx.stroke()

    // Draw QR
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

    // Download
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${downloadName}.png`
    a.click()
  }, [canvasId, downloadSize, title, subtitle, caption, downloadName, dark])

  return (
    <div className="flex flex-col items-center gap-4">
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
          <EventiAppIcon className={`h-4 w-auto ${dark ? 'text-pink-400' : 'text-pink-500'}`} />
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
        <div className={[
          'rounded-xl p-4',
          dark ? 'bg-white' : 'bg-zinc-50 border border-zinc-100',
        ].join(' ')}>
          <QRCodeSVG
            value={value}
            size={size}
            bgColor={dark ? '#ffffff' : '#fafafa'}
            fgColor="#18181b"
            level="M"
            imageSettings={{
              src: 'data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 22" fill="%23ec4899"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.999.5L6.57.743.57 10.743v.514l6 10 .429.243H19l.353-.854L16.853 18.146 16.499 18H9.274L4.841 11l4.433-7H16.499l.354-.146 2.5-2.5L19 .5H6.999Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M20.793 4.219l-2.427 2.427-.069.621 2.364 3.732-2.364 3.733.069.621 2.427 2.427.783-.096 3.856-6.427v-.514l-3.856-6.427-.783-.097Z"/></svg>'
              ),
              height: Math.round(size * 0.15),
              width: Math.round(size * 0.18),
              excavate: true,
            }}
          />
        </div>

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
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 rounded-xl bg-pink-500 hover:bg-pink-400 px-5 py-2.5 text-sm font-medium text-white transition-colors shadow-sm shadow-pink-500/20"
        >
          <ArrowDownTrayIcon className="size-4" />
          Descargar QR
        </button>
      )}

      {/* Hidden hi-res canvas for download */}
      <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
        <QRCodeCanvas
          id={canvasId}
          value={value}
          size={downloadSize}
          bgColor="#ffffff"
          fgColor="#18181b"
          level="M"
          imageSettings={{
            src: '/eventiapp-icon.svg',
            height: Math.round(downloadSize * 0.15),
            width: Math.round(downloadSize * 0.18),
            excavate: true,
          }}
        />
      </div>
    </div>
  )
}
