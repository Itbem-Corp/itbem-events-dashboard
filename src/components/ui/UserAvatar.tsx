'use client'

import { Avatar } from '@/components/avatar'
import clsx from 'clsx'

type User = {
    first_name?: string
    last_name?: string
    email?: string
    profile_image?: string | null
}

type Props = {
    user?: User | null
    size?: 'sm' | 'md' | 'lg' | 'xl'
    className?: string
}

const sizes = {
    sm: 'size-8',
    md: 'size-10',
    lg: 'size-14',
    xl: 'size-24',
}

export default function UserAvatar({
                                       user,
                                       size = 'md',
                                       className,
                                   }: Props) {
    const initials =
        user?.first_name?.charAt(0) ||
        user?.email?.charAt(0) ||
        '?'

    return (
        <div
            className={clsx(
                'relative shrink-0 overflow-hidden rounded-full bg-zinc-800',
                sizes[size],
                className
            )}
        >
            <Avatar
                src={user?.profile_image ?? null}
                initials={initials}
                className="h-full w-full object-cover"
            />
        </div>
    )
}
