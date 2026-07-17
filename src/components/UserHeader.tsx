'use client'

import Image from 'next/image'
import { useStore } from "@/store/useStore";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"; // Asumiendo que usas shadcn/ui

export function UserHeader() {
    const { user } = useStore();

    if (!user) return null;

    // Generar iniciales si no hay imagen (ej: "Juan Perez" -> "JP")
    const initials = `${user.first_name?.charAt(0) || ''}${user.last_name?.charAt(0) || ''}`.toUpperCase();

    return (
        <div className="flex items-center gap-4">
            <div className="flex flex-col items-end hidden md:flex">
        <span className="text-sm font-semibold text-ink">
          {user.first_name} {user.last_name}
        </span>
                <span className="text-xs text-ink-muted">{user.email}</span>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger className="outline-none">
                    <div className="relative h-10 w-10 rounded-full bg-surface-raised border border-border-subtle flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-border-subtle transition-all">
                        {user.profile_image ? (
                            <Image
                                src={user.profile_image}
                                alt={`${user.first_name} ${user.last_name}`}
                                fill
                                className="object-cover"
                                sizes="40px"
                            />
                        ) : (
                            <span className="text-sm font-medium text-ink-muted">{initials}</span>
                        )}
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.location.href = "/profile"}>
                        Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => window.location.href = "/auth/logout"}>
                        Cerrar Sesión
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}