'use client'

import UserAvatar from '@/components/ui/UserAvatar'
import { NotificationBell } from '@/components/ui/notification-bell'
import { CommandPalette } from '@/components/ui/command-palette'

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownHeader,
} from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import {
  ArrowRightStartOnRectangleIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserCircleIcon,
  UsersIcon,
  ShoppingCartIcon,
} from '@heroicons/react/16/solid'
import {
  HomeIcon,
  Square2StackIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid'

import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useStore } from '@/store/useStore'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/avatar'
interface ClientRaw {
  id: string
  name: string
  code: string
  logo?: string
  client_type?: { code: string }
}

// API keys are normalized to snake_case by the Axios interceptor in api.ts
function normalizeClient(raw: ClientRaw) {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    logo: raw.logo,
    client_type: raw.client_type ?? { code: '' },
  }
}

/* =========================
 * ACCOUNT MENU
 * ========================= */

function AccountDropdownMenu({
                               anchor,
                               clearSession,
                             }: {
  anchor: 'top start' | 'bottom end'
  clearSession: () => void
}) {
  return (
      <DropdownMenu className="min-w-64" anchor={anchor}>
        <DropdownItem href="/settings/profile">
          <UserCircleIcon />
          <DropdownLabel>Mi Perfil</DropdownLabel>
        </DropdownItem>

        <DropdownDivider />

        <DropdownItem
            onClick={() => {
              clearSession()
              window.location.href = '/logout'
            }}
        >
          <ArrowRightStartOnRectangleIcon />
          <DropdownLabel>Cerrar sesión</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
  )
}

/* =========================
 * LAYOUT
 * ========================= */

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [cmdOpen, setCmdOpen] = useState(false)

  const currentClient = useStore((s) => s.currentClient)
  const setCurrentClient = useStore((s) => s.setCurrentClient)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])

  const { data: clients, error: clientsError } = useSWR('/clients', fetcher)
  const isRoot = Boolean(user?.is_root)
  /* Auto-select client */
  useEffect(() => {
    if (!clients || clientsError) return

    const list: ClientRaw[] = Array.isArray(clients) ? clients : []

    // ✅ Si hay clientes y no hay currentClient → seleccionar
    if (list.length > 0 && !currentClient) {
      setCurrentClient(normalizeClient(list[0]))
      return
    }

    // 🚫 SOLO usuarios NO ROOT van a onboarding
    if (list.length === 0 && !isRoot) {
      router.push('/')
    }

    // ✅ ROOT con 0 clientes → NO REDIRECT
  }, [clients, currentClient, isRoot, setCurrentClient, router, clientsError])

  return (
    <>
      <SidebarLayout
          navbar={
            <Navbar>
              <NavbarSpacer />
              <NavbarSection>
                {/* ⌘K quick search */}
                <button
                  onClick={() => setCmdOpen(true)}
                  className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-500 hover:border-white/20 hover:text-zinc-300 transition-colors"
                >
                  <MagnifyingGlassIcon className="size-3.5" />
                  Buscar…
                  <kbd className="rounded border border-zinc-800 bg-zinc-800 px-1 py-0.5 font-mono text-[9px] text-zinc-700">⌘K</kbd>
                </button>

                <NotificationBell />
                <Dropdown>
                  <DropdownButton as={NavbarItem}>
                    <UserAvatar user={user} size="sm" />
                  </DropdownButton>

                  <AccountDropdownMenu
                      anchor="bottom end"
                      clearSession={clearSession}
                  />
                </Dropdown>
              </NavbarSection>
            </Navbar>
          }

          sidebar={
            <Sidebar>
              {/* HEADER CLIENT */}
              <SidebarHeader>
                <Dropdown>
                  <DropdownButton as={SidebarItem}>
                    <Avatar
                        src={currentClient?.logo}
                        initials={currentClient?.name?.substring(0, 2).toUpperCase() || '??'}
                        className="bg-indigo-600 text-white"
                    />
                    <SidebarLabel className="font-semibold">
                      {currentClient?.name || 'Cargando…'}
                    </SidebarLabel>
                    <ChevronDownIcon />
                  </DropdownButton>

                  <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                    <DropdownHeader>Mis organizaciones</DropdownHeader>

                    {(['PLATFORM', 'AGENCY', 'CUSTOMER'] as const).map((typeCode) => {
                      const group = (Array.isArray(clients) ? (clients as ClientRaw[]) : []).filter(
                        (c) => (c.client_type?.code ?? '').toUpperCase() === typeCode
                      )
                      if (group.length === 0) return null
                      const typeLabel = typeCode === 'PLATFORM' ? 'Plataformas' : typeCode === 'AGENCY' ? 'Agencias' : 'Clientes'
                      return (
                        <div key={typeCode}>
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                              {typeLabel}
                            </span>
                          </div>
                          {group.map((client) => (
                            <DropdownItem
                              key={client.id}
                              onClick={() => setCurrentClient(normalizeClient(client))}
                            >
                              <Avatar
                                slot="icon"
                                src={client.logo}
                                initials={(client.name ?? '??').substring(0, 2).toUpperCase()}
                              />
                              <DropdownLabel>{client.name}</DropdownLabel>
                            </DropdownItem>
                          ))}
                        </div>
                      )
                    })}
                  </DropdownMenu>
                </Dropdown>
              </SidebarHeader>

              {/* NAV */}
              <SidebarBody>
                <SidebarSection>
                  <SidebarItem href="/" current={pathname === '/'}>
                    <HomeIcon />
                    <SidebarLabel>Inicio</SidebarLabel>
                  </SidebarItem>

                  <SidebarItem href="/events" current={pathname.startsWith('/events')}>
                    <Square2StackIcon />
                    <SidebarLabel>Eventos</SidebarLabel>
                  </SidebarItem>

                  {!isRoot && (
                    <SidebarItem href="/orders" current={pathname.startsWith('/orders')}>
                      <ShoppingCartIcon />
                      <SidebarLabel>Órdenes</SidebarLabel>
                    </SidebarItem>
                  )}

                  {isRoot && (
                    <SidebarItem href="/users" current={pathname.startsWith('/users')}>
                      <UsersIcon />
                      <SidebarLabel>Usuarios</SidebarLabel>
                    </SidebarItem>
                  )}
                </SidebarSection>

                <SidebarSpacer />

                {isRoot && (
                  <SidebarSection>
                    <SidebarItem href="/clients" current={pathname.startsWith('/clients')}>
                      <BuildingOfficeIcon />
                      <SidebarLabel>Clientes</SidebarLabel>
                    </SidebarItem>
                  </SidebarSection>
                )}
              </SidebarBody>

              {/* FOOTER USER */}
              <SidebarFooter className="max-lg:hidden border-t border-white/10 pt-4">
                <Dropdown>
                  <DropdownButton as={SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <UserAvatar user={user} size="md" />

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {user?.first_name} {user?.last_name}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {user?.email}
                    </span>
                  </span>
                </span>
                    <ChevronUpIcon />
                  </DropdownButton>

                  <AccountDropdownMenu
                      anchor="top start"
                      clearSession={clearSession}
                  />
                </Dropdown>
              </SidebarFooter>
            </Sidebar>
          }
      >
        {children}
      </SidebarLayout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  )
}
