'use client'

import UserAvatar from '@/components/ui/UserAvatar'

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
} from '@heroicons/react/20/solid'

import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useStore } from '@/store/useStore'
import { useEffect } from 'react'
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

  const currentClient = useStore((s) => s.currentClient)
  const setCurrentClient = useStore((s) => s.setCurrentClient)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)

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
      <SidebarLayout
          navbar={
            <Navbar>
              <NavbarSpacer />
              <NavbarSection>
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

                    {(Array.isArray(clients) ? (clients as ClientRaw[]) : []).map((client) => (
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

                  <SidebarItem href="/orders" current={pathname.startsWith('/orders')}>
                    <ShoppingCartIcon />
                    <SidebarLabel>Órdenes</SidebarLabel>
                  </SidebarItem>

                  <SidebarItem href="/users" current={pathname.startsWith('/users')}>
                    <UsersIcon />
                    <SidebarLabel>Usuarios</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>

                <SidebarSpacer />

                <SidebarSection>
                  <SidebarItem href="/clients" current={pathname.startsWith('/clients')}>
                    <BuildingOfficeIcon />
                    <SidebarLabel>Clientes</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
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
  )
}
