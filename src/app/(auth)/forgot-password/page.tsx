'use client'

import { BrandMark } from '@/components/product/brand-mark'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'

export default function ForgotPasswordPage() {
  const errorRef = useRef<HTMLDivElement>(null)
  const [tenant, setTenant] = useState(() => tenantPresentationForHostname('dashboard.eventiapp.com.mx'))
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTenant(tenantPresentationForHostname(window.location.hostname))
  }, [])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sent
            ? { email: email.trim().toLowerCase(), code: code.trim(), password }
            : { email: email.trim().toLowerCase() }
        ),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'No pudimos procesar la solicitud.')
      if (!sent) setSent(true)
      else window.location.assign('/login')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos procesar la solicitud.')
    } finally {
      setPending(false)
    }
  }

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
              <p className="mt-0.5 text-[9px] tracking-[0.14em] text-ink-muted uppercase">Recuperación segura</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="size-5" style={{ color: tenant.accent }} aria-label="Proceso protegido" />
            <ThemeToggle />
          </div>
        </header>

        <div className="mt-14">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: tenant.accent }}>
            {sent ? 'Paso 02 / 02' : 'Paso 01 / 02'}
          </p>
          <h1 className="mt-4 text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.055em]">
            {sent ? 'Revisa tu correo.' : 'Recupera tu acceso.'}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--app-text-secondary)]">
            {sent
              ? `Ingresa el código enviado a ${email} y define una contraseña nueva.`
              : 'Te enviaremos un código si el correo pertenece a una cuenta autorizada.'}
          </p>
        </div>

        <form onSubmit={submit} className="mt-9 space-y-5" aria-busy={pending}>
          <div>
            <label htmlFor="recovery-email" className="mb-2 block text-xs font-semibold text-ink-secondary">
              Correo de trabajo
            </label>
            <input
              id="recovery-email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={sent}
              className="h-13 w-full rounded-xl border border-border-subtle bg-surface-interactive px-4 text-[15px] text-ink transition-[border-color,background-color,box-shadow] outline-none hover:border-border-strong hover:bg-surface-raised focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15 disabled:bg-surface-soft disabled:text-ink-muted"
            />
          </div>

          {sent && (
            <>
              <div>
                <label
                  htmlFor="recovery-code"
                  className="mb-2 block text-xs font-semibold text-ink-secondary"
                >
                  Código de verificación
                </label>
                <input
                  id="recovery-code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  minLength={4}
                  maxLength={12}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
                  className="h-13 w-full rounded-xl border border-border-subtle bg-surface-interactive px-4 font-mono text-[15px] tracking-[0.18em] text-ink transition-[border-color,background-color,box-shadow] outline-none hover:border-border-strong hover:bg-surface-raised focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15"
                />
              </div>
              <div>
                <label
                  htmlFor="recovery-password"
                  className="mb-2 block text-xs font-semibold text-ink-secondary"
                >
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="recovery-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-13 w-full rounded-xl border border-border-subtle bg-surface-interactive pr-13 pl-4 text-[15px] text-ink transition-[border-color,background-color,box-shadow] outline-none hover:border-border-strong hover:bg-surface-raised focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--app-text-muted)] transition hover:bg-(--tenant-accent)/8 hover:text-[var(--app-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--tenant-accent)"
                  >
                    {showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-3 text-sm text-red-700 outline-none dark:text-red-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="auth-cta group flex h-13 w-full items-center justify-between rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-[filter,box-shadow,opacity] outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-(--tenant-accent)/30 disabled:cursor-wait disabled:opacity-60"
          >
            <span>{pending ? 'Procesando' : sent ? 'Guardar contraseña' : 'Enviar código'}</span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-white/12 text-white">
              {pending ? (
                <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowRightIcon className="size-3.5" />
              )}
            </span>
          </button>
        </form>

        <Link
          href="/login"
          className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
        >
          <ArrowLeftIcon className="size-4" />
          Volver al acceso
        </Link>
      </section>
    </div>
  )
}
