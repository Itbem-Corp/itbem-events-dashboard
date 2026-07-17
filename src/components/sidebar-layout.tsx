'use client'

import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { NavbarItem } from './navbar'

export function SidebarLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode }>) {
  const [showSidebar, setShowSidebar] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const pathname = usePathname()
  const openButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const previousPathnameRef = useRef(pathname)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname
    setShowSidebar(false)
  }, [pathname])

  useEffect(() => {
    if (isDesktop || !showSidebar) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSidebar(false)
        window.requestAnimationFrame(() => openButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return

      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDesktop, showSidebar])

  const closeSidebar = () => {
    setShowSidebar(false)
    window.requestAnimationFrame(() => openButtonRef.current?.focus())
  }

  return (
    <>
      <a
        href="#dashboard-main"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-raised)]/95 px-4 py-2.5 text-sm font-semibold text-[var(--app-text-primary)] shadow-[0_18px_54px_var(--app-shadow-strong)] backdrop-blur-xl transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) motion-reduce:transition-none"
      >
        Saltar al contenido principal
      </a>

      <div className="relative isolate flex min-h-svh w-full min-w-0 overflow-x-clip bg-transparent max-lg:flex-col">
        <button
          type="button"
          aria-label="Cerrar menú lateral"
          tabIndex={-1}
          onClick={closeSidebar}
          className={`fixed inset-0 z-40 bg-black/65 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
            showSidebar ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        <aside
          ref={sidebarRef}
          aria-label="Navegación principal"
          role={!isDesktop && showSidebar ? 'dialog' : undefined}
          aria-modal={!isDesktop && showSidebar ? true : undefined}
          aria-hidden={!isDesktop && !showSidebar}
          inert={!isDesktop && !showSidebar ? true : undefined}
          className={`fixed inset-y-0 left-0 z-50 w-full max-w-80 p-2 transition-transform duration-300 ease-out motion-reduce:transition-none lg:z-auto lg:w-68 ${
            showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="app-shell-panel flex h-full flex-col overflow-hidden rounded-2xl border">
            <div className="-mb-3 px-4 pt-3 lg:hidden">
              <NavbarItem ref={closeButtonRef} onClick={closeSidebar} aria-label="Cerrar navegación">
                <XMarkIcon />
              </NavbarItem>
            </div>
            {sidebar}
          </div>
        </aside>

        <header
          aria-hidden={!isDesktop && showSidebar ? true : undefined}
          inert={!isDesktop && showSidebar ? true : undefined}
          className="sticky top-0 z-30 flex min-w-0 items-center border-b border-[var(--app-border-subtle)] bg-[var(--app-surface)] px-4 shadow-sm lg:hidden"
        >
          <div className="py-2.5">
            <NavbarItem ref={openButtonRef} onClick={() => setShowSidebar(true)} aria-label="Abrir navegación">
              <Bars3Icon />
            </NavbarItem>
          </div>
          <div className="min-w-0 flex-1">{navbar}</div>
        </header>

        <main
          id="dashboard-main"
          tabIndex={-1}
          aria-hidden={!isDesktop && showSidebar ? true : undefined}
          inert={!isDesktop && showSidebar ? true : undefined}
          className="flex min-w-0 flex-1 flex-col pb-24 outline-none lg:pt-2 lg:pr-2 lg:pb-2 lg:pl-68"
        >
          <div className="app-shell-panel grow px-4 py-6 sm:px-6 lg:rounded-2xl lg:border lg:p-10 xl:p-12">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
    </>
  )
}
