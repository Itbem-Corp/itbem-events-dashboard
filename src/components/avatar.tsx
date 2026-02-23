import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React, { forwardRef, useState } from 'react'
import Image from 'next/image'
import { TouchTarget } from './button'
import { Link } from './link'

type AvatarProps = {
    src?: string | null
    square?: boolean
    initials?: string
    alt?: string
    className?: string
}

export function Avatar({
                           src = null,
                           square = false,
                           initials,
                           alt = '',
                           className,
                           ...props
                       }: AvatarProps & React.ComponentPropsWithoutRef<'span'>) {
    const [imageError, setImageError] = useState(false)

    const hasValidSrc =
        typeof src === 'string' &&
        src.trim() !== '' &&
        !imageError

    return (
        <span
            data-slot="avatar"
            {...props}
            className={clsx(
                className,
                'relative inline-grid shrink-0 align-middle [--avatar-radius:20%] *:col-start-1 *:row-start-1',
                'outline -outline-offset-1 outline-black/10 dark:outline-white/10',
                square
                    ? 'rounded-(--avatar-radius) *:rounded-(--avatar-radius)'
                    : 'rounded-full *:rounded-full'
            )}
        >
      {/* Fallback → SOLO si NO hay imagen válida */}
            {!hasValidSrc && initials && (
                <svg
                    className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none"
                    viewBox="0 0 100 100"
                    aria-hidden={alt ? undefined : 'true'}
                >
                    {alt && <title>{alt}</title>}
                    <text
                        x="50%"
                        y="50%"
                        alignmentBaseline="middle"
                        dominantBaseline="middle"
                        textAnchor="middle"
                        dy=".125em"
                    >
                        {initials}
                    </text>
                </svg>
            )}

            {/* Imagen SOLO si es válida */}
            {hasValidSrc && (
                <Image
                    className="size-full object-cover"
                    src={src}
                    alt={alt}
                    fill
                    sizes="64px"
                    onError={() => setImageError(true)}
                />
            )}
    </span>
    )
}
