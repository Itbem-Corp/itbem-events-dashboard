import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { fetchOgCover } from '@/lib/og-cover'
import {
    formatOgDate,
    formatOgEventType,
    ogLabelsForLanguage,
    readOgRouteParams,
    truncateOgAddress,
} from '@/lib/og-route-params'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const { title, date, timezone, language, address, cover, type } = readOgRouteParams(
        searchParams,
        process.env.NEXT_PUBLIC_BACKEND_URL,
    )
    const safeCover = cover
        ? await fetchOgCover(cover, {
              backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
              configuredHosts: process.env.OG_IMAGE_ALLOWED_HOSTS,
          })
        : null

    const logoUrl = new URL('/eventiapp-icon.svg', req.url).toString()

    if (safeCover) {
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
                    <img
                        src={safeCover.bytes as unknown as string}
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
                                letterSpacing: '0',
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

    const formattedDate = formatOgDate(date, timezone, language)
    const eventType = formatOgEventType(type)
    const labels = ogLabelsForLanguage(language)

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
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1a0a2e 0%, #09090b 60%, #0d1a2e 100%)',
                        display: 'flex',
                    }}
                />

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
                    {eventType && (
                        <div style={{ display: 'flex', marginBottom: '16px' }}>
                            <span style={{ fontSize: '18px', fontWeight: 600, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0' }}>
                                {eventType}
                            </span>
                        </div>
                    )}

                    <div style={{ fontSize: title.length > 30 ? '52px' : '64px', fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: '24px', display: 'flex' }}>
                        {title}
                    </div>

                    <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                        {formattedDate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#818cf8', fontWeight: 700, letterSpacing: '0', textTransform: 'uppercase' }}>
                                    {labels.date}
                                </span>
                                <span style={{ fontSize: '22px', color: '#a1a1aa', fontWeight: 500 }}>{formattedDate}</span>
                            </div>
                        )}
                        {address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#818cf8', fontWeight: 700, letterSpacing: '0', textTransform: 'uppercase' }}>
                                    {labels.place}
                                </span>
                                <span style={{ fontSize: '22px', color: '#a1a1aa', fontWeight: 500 }}>
                                    {truncateOgAddress(address)}
                                </span>
                            </div>
                        )}
                    </div>

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
                        <span style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', letterSpacing: '0' }}>
                            eventiapp
                        </span>
                    </div>
                </div>
            </div>
        ),
        { width: 1200, height: 630 },
    )
}
