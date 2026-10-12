'use client'

import { useEffect } from 'react'

// Replaces the root layout when it fails, so it ships its own <html> and
// inline styles: the app stylesheet and theme may not have loaded.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          boxSizing: 'border-box',
          background: '#0b0d12',
          color: '#f4f5f7',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main role="alert" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#c9ccd3', margin: 0 }}>
            No pudimos cargar el dashboard. Tu información está segura; intenta de nuevo o vuelve al inicio.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: '8px 16px',
                borderRadius: 12,
                border: 0,
                background: '#4f46e5',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
            {/* A plain anchor: the router may be the thing that failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: 44,
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: 12,
                border: '1px solid #3a3f4b',
                color: '#f4f5f7',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Ir al inicio
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 24, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#9ea3ad' }}>
              Referencia {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
