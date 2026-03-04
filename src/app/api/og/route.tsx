import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const title = searchParams.get('title') || 'Evento'
    const date = searchParams.get('date') || ''
    const address = searchParams.get('address') || ''
    const cover = searchParams.get('cover') || ''
    const type = searchParams.get('type') || ''

    // Logo URL — served from same deployment (edge runtime compatible)
    const logoUrl = new URL('/eventiapp-icon.svg', req.url).toString()

    // ── Mode A: cover photo full + logo corner ─────────────────────────────
    if (cover) {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        position: 'relative',
                    }}
                >
                    {/* Cover photo — full, no overlay */}
                    <img
                        src={cover}
                        alt=""
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />

                    {/* Subtle vignette so logo is readable on any photo */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: '200px',
                            height: '100px',
                            background: 'radial-gradient(ellipse at bottom right, rgba(0,0,0,0.5) 0%, transparent 70%)',
                            display: 'flex',
                        }}
                    />

                    {/* Logo + wordmark — bottom-right corner */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '24px',
                            right: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <img
                            src={logoUrl}
                            width={36}
                            height={36}
                            style={{ borderRadius: '50%' }}
                            alt="eventiapp"
                        />
                        <span
                            style={{
                                fontSize: '18px',
                                fontWeight: 700,
                                color: '#ffffff',
                                fontFamily: 'Inter, sans-serif',
                                letterSpacing: '-0.3px',
                            }}
                        >
                            eventiapp
                        </span>
                    </div>
                </div>
            ),
            { width: 1200, height: 630 },
        )
    }

    // ── Mode B: no cover — dark branded fallback ───────────────────────────
    let formattedDate = ''
    if (date) {
        try {
            formattedDate = new Intl.DateTimeFormat('es', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            }).format(new Date(date))
        } catch {
            formattedDate = date
        }
    }

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    position: 'relative',
                    backgroundColor: '#09090b',
                    fontFamily: 'Inter, sans-serif',
                }}
            >
                {/* Gradient background */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        background: 'linear-gradient(135deg, #1a0a2e 0%, #09090b 60%, #0d1a2e 100%)',
                        display: 'flex',
                    }}
                />

                {/* Content */}
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '60px',
                    }}
                >
                    {type && (
                        <div style={{ display: 'flex', marginBottom: '16px' }}>
                            <span style={{ fontSize: '18px', fontWeight: 600, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '2px' }}>
                                {type}
                            </span>
                        </div>
                    )}

                    <div style={{ fontSize: title.length > 30 ? '52px' : '64px', fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: '24px', display: 'flex' }}>
                        {title}
                    </div>

                    <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                        {formattedDate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '22px' }}>📅</span>
                                <span style={{ fontSize: '22px', color: '#a1a1aa', fontWeight: 500 }}>{formattedDate}</span>
                            </div>
                        )}
                        {address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '22px' }}>📍</span>
                                <span style={{ fontSize: '22px', color: '#a1a1aa', fontWeight: 500 }}>
                                    {address.length > 40 ? address.slice(0, 40) + '...' : address}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Branding — bottom-right */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '24px',
                            right: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <img src={logoUrl} width={36} height={36} style={{ borderRadius: '50%' }} alt="eventiapp" />
                        <span style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
                            eventiapp
                        </span>
                    </div>
                </div>
            </div>
        ),
        { width: 1200, height: 630 },
    )
}
