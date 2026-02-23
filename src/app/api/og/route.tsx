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

    // Format date if provided
    let formattedDate = ''
    if (date) {
        try {
            formattedDate = new Intl.DateTimeFormat('es', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
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
                {/* Background cover image with overlay */}
                {cover && (
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
                            opacity: 0.3,
                        }}
                    />
                )}

                {/* Gradient overlay */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(to top, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.6) 50%, rgba(9,9,11,0.8) 100%)',
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
                    {/* Event type badge */}
                    {type && (
                        <div
                            style={{
                                display: 'flex',
                                marginBottom: '16px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '18px',
                                    fontWeight: 600,
                                    color: '#818cf8',
                                    textTransform: 'uppercase',
                                    letterSpacing: '2px',
                                }}
                            >
                                {type}
                            </span>
                        </div>
                    )}

                    {/* Title */}
                    <div
                        style={{
                            fontSize: title.length > 30 ? '52px' : '64px',
                            fontWeight: 700,
                            color: '#ffffff',
                            lineHeight: 1.1,
                            marginBottom: '24px',
                            display: 'flex',
                        }}
                    >
                        {title}
                    </div>

                    {/* Date & Address row */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '32px',
                            alignItems: 'center',
                        }}
                    >
                        {formattedDate && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <span style={{ fontSize: '22px' }}>📅</span>
                                <span
                                    style={{
                                        fontSize: '22px',
                                        color: '#a1a1aa',
                                        fontWeight: 500,
                                    }}
                                >
                                    {formattedDate}
                                </span>
                            </div>
                        )}
                        {address && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                <span style={{ fontSize: '22px' }}>📍</span>
                                <span
                                    style={{
                                        fontSize: '22px',
                                        color: '#a1a1aa',
                                        fontWeight: 500,
                                    }}
                                >
                                    {address.length > 40 ? address.slice(0, 40) + '...' : address}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Branding */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '40px',
                            right: '60px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '24px',
                                fontWeight: 700,
                                color: '#818cf8',
                            }}
                        >
                            EventiApp
                        </span>
                    </div>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        },
    )
}
