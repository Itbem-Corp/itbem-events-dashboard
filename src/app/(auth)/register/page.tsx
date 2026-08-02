'use client'

import { BrandMark } from '@/components/product/brand-mark'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { ArrowLeftIcon, ArrowRightIcon, InformationCircleIcon, LockClosedIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Register() {
  const [tenant, setTenant] = useState(() => tenantPresentationForHostname('dashboard.eventiapp.com.mx'))

  useEffect(() => {
    setTenant(tenantPresentationForHostname(window.location.hostname))
  }, [])

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center px-5 py-7 sm:px-8"
      style={{ '--tenant-accent': tenant.accent } as React.CSSProperties}
    >
      <section className="premium-surface w-full max-w-[540px] rounded-[1.6rem] px-6 py-7 text-ink sm:px-12 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="sm" priority />
            <div>
              <p className="text-sm font-semibold">{tenant.name}</p>
              <p className="mt-0.5 text-[9px] tracking-[0.14em] text-ink-muted uppercase">Acceso de equipo</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="mt-14">
          <span
            className="flex size-11 items-center justify-center rounded-xl border"
            style={{ borderColor: `${tenant.accent}35`, backgroundColor: `${tenant.accent}12`, color: tenant.accent }}
          >
            <LockClosedIcon className="size-5" />
          </span>
          <p className="mt-8 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: tenant.accent }}>
            Acceso controlado
          </p>
          <h1 className="mt-4 max-w-md text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.055em] sm:text-[2.8rem]">
            El acceso se activa por invitación.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-ink-secondary">
            Tu administrador te enviará un acceso seguro cuando tu cuenta esté lista. No necesitas crear una cuenta desde esta pantalla.
          </p>
        </div>

        <div className="mt-9 rounded-xl border border-border-subtle bg-surface-interactive px-4 py-4">
          <div className="flex gap-3">
            <InformationCircleIcon className="mt-0.5 size-5 shrink-0 text-(--tenant-accent)" />
            <div>
              <p className="text-sm font-semibold text-ink">¿Esperabas una invitación?</p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                Revisa el correo con el que tu organización te registró o solicita apoyo a tu administrador.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/login"
          className="auth-cta group mt-7 flex h-13 w-full items-center justify-between rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-[filter,box-shadow,opacity] outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-(--tenant-accent)/30"
        >
          <span>Ya tengo acceso</span>
          <span className="flex size-7 items-center justify-center rounded-lg bg-white/12 text-white transition-transform group-hover:translate-x-0.5">
            <ArrowRightIcon className="size-3.5" />
          </span>
        </Link>

        <Link
          href="/login"
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
        >
          <ArrowLeftIcon className="size-4" />
          Volver al acceso
        </Link>
      </section>
    </div>
  )
}
