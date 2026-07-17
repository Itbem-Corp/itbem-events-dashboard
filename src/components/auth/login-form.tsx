'use client'

import { BrandMark } from '@/components/product/brand-mark'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import type { TenantConfig } from '@/lib/tenant-config'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  CheckIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  LockClosedIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useRef, useState } from 'react'

type LoginChallenge = 'NEW_PASSWORD_REQUIRED' | 'SMS_MFA' | 'SOFTWARE_TOKEN_MFA' | 'SMS_OTP' | 'EMAIL_OTP' | null

const entranceTransition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }

async function authRequest(endpoint: string, body: Record<string, string>) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      challenge?: string
      error?: string
      session?: ApplicationSession
    }
    if (!response.ok) throw new Error(result.error || 'No pudimos completar el acceso.')
    return result
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado. Revisa tu red e intenta nuevamente.')
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}

export function LoginForm({ tenant }: { tenant: Omit<TenantConfig, 'clientId'> }) {
  const router = useRouter()
  const setApplicationSession = useStore((state) => state.setApplicationSession)
  const reducedMotion = useReducedMotion()
  const errorRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [challenge, setChallenge] = useState<LoginChallenge>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    setPending(true)
    setError('')
    try {
      const isPasswordChallenge = challenge === 'NEW_PASSWORD_REQUIRED'
      const isVerificationChallenge = Boolean(challenge && !isPasswordChallenge)
      const endpoint = isPasswordChallenge
        ? '/api/auth/new-password'
        : isVerificationChallenge
          ? '/api/auth/challenge'
          : '/api/auth/sign-in'
      const result = await authRequest(
        endpoint,
        isPasswordChallenge
          ? { password: newPassword }
          : isVerificationChallenge
            ? { code: verificationCode }
            : { email: email.trim().toLowerCase(), password }
      )

      if (result.challenge) {
        setChallenge(result.challenge as LoginChallenge)
        setPassword('')
        return
      }
      if (result.session) setApplicationSession(result.session)
      // Cookies are already committed by the auth response. A client
      // transition preserves the loaded runtime and removes the costly full
      // document reload that made the first dashboard entry feel frozen.
      router.replace('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos completar el acceso.')
    } finally {
      setPending(false)
    }
  }

  function resetChallenge() {
    setChallenge(null)
    setPassword('')
    setNewPassword('')
    setVerificationCode('')
    setShowPassword(false)
    setError('')
  }

  const copy = getProductManifest(tenant.code).login
  const isPasswordChallenge = challenge === 'NEW_PASSWORD_REQUIRED'
  const isVerificationChallenge = Boolean(challenge && !isPasswordChallenge)
  const verificationLabel =
    challenge === 'SOFTWARE_TOKEN_MFA'
      ? 'Código de tu aplicación autenticadora'
      : challenge === 'EMAIL_OTP'
        ? 'Código enviado a tu correo'
        : 'Código de verificación'
  const stageKey = challenge ?? 'sign-in'
  const title = isPasswordChallenge
    ? 'Crea una contraseña nueva'
    : isVerificationChallenge
      ? 'Confirma que eres tú'
      : 'Accede a tu cuenta'
  const supportingCopy = isPasswordChallenge
    ? 'Define una nueva contraseña para terminar de activar tu acceso.'
    : isVerificationChallenge
      ? `Estamos verificando el acceso de ${email}.`
      : `Continúa al espacio privado de ${tenant.name}.`

  return (
    <div className="grid min-h-dvh w-full bg-[var(--app-canvas)] transition-colors duration-300 motion-reduce:transition-none xl:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <motion.section
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reducedMotion ? { duration: 0 } : entranceTransition}
        className="auth-editorial-panel relative hidden overflow-hidden px-12 py-10 xl:flex xl:flex-col xl:justify-between xl:px-20 xl:py-14"
        aria-labelledby="product-statement"
      >
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0 w-1"
          style={{ backgroundColor: tenant.accent }}
        />

        <header className="relative flex items-center justify-between gap-8">
          <div className="flex items-center gap-3.5">
            <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="md" priority />
            <div>
              <p className="text-sm font-semibold tracking-[-0.01em] text-ink dark:text-white">{tenant.name}</p>
              <p className="mt-0.5 text-[10px] font-medium tracking-[0.15em] text-ink-muted uppercase dark:text-ink-muted">
                {copy.discipline}
              </p>
            </div>
          </div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-ink-muted dark:text-ink-muted">{copy.index}</p>
        </header>

        <div className="relative max-w-3xl pb-8">
          <p className="mb-8 flex items-center gap-3 text-[10px] font-semibold tracking-[0.2em] text-ink-muted uppercase">
            <span className="h-px w-9" style={{ backgroundColor: tenant.accent }} />
            {copy.eyebrow}
          </p>
          <h1
            id="product-statement"
            className="max-w-3xl text-[clamp(3.5rem,6.2vw,6.25rem)] leading-[0.91] font-medium tracking-[-0.07em] text-ink dark:text-white"
          >
            {copy.title}
          </h1>
          <p className="mt-9 max-w-xl text-lg leading-8 tracking-[-0.015em] text-ink-muted dark:text-ink-secondary">
            {copy.description}
          </p>
        </div>

        <footer className="relative border-t border-border-subtle pt-6 dark:border-white/[0.08]">
          <div className="flex items-center gap-5 text-[11px] font-medium text-ink-muted dark:text-ink-muted">
            <span className="flex items-center gap-2">
              <BoltIcon className="size-4 text-(--tenant-accent)" />
              Decisiones en tiempo real
            </span>
            <span className="h-5 w-px bg-canvas/10 dark:bg-white/10" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <UserGroupIcon className="size-4 text-(--tenant-accent)" />
              Equipos alineados
            </span>
            <span className="h-5 w-px bg-canvas/10 dark:bg-white/10" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <CheckCircleIcon className="size-4 text-(--tenant-accent)" />
              Operación coordinada
            </span>
          </div>
          <div className="mt-6 flex items-end justify-between gap-10">
            <p className="max-w-sm text-xs leading-5 text-ink-muted dark:text-ink-muted">{copy.context}</p>
            <p
              aria-hidden="true"
              className="text-right text-[clamp(2rem,4vw,4rem)] leading-none font-semibold tracking-[-0.07em] text-ink/[0.035] select-none dark:text-white/[0.035]"
            >
              {copy.signature}
            </p>
          </div>
        </footer>
      </motion.section>

      <section className="flex min-h-dvh items-center justify-center border-border-subtle bg-[var(--app-surface)]/88 px-5 py-7 transition-colors duration-300 motion-reduce:transition-none sm:px-10 xl:border-l dark:border-white/[0.08] dark:bg-[#080d1b]/94">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reducedMotion ? { duration: 0 } : { ...entranceTransition, delay: 0.08 }}
          className="relative flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[560px] flex-col px-1 py-1 text-ink sm:min-h-[680px] sm:px-3 sm:py-3 xl:min-h-[calc(100dvh-7rem)] dark:text-white"
        >
          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <div className="flex items-center gap-3 xl:hidden">
              <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="sm" priority />
              <div>
                <p className="text-sm font-semibold text-ink dark:text-white">{tenant.name}</p>
                <p className="mt-0.5 text-[9px] tracking-[0.14em] text-ink-muted uppercase">{copy.discipline}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 text-[11px] font-medium text-ink-muted min-[360px]:flex">
                <LockClosedIcon className="size-3.5" />
                Acceso protegido
              </span>
              <ThemeToggle />
            </div>
          </div>

          <div className="flex flex-1 items-start pt-20 pb-10 sm:items-center sm:pt-5 sm:pb-20">
            <div className="w-full">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stageKey}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {challenge && (
                    <button
                      type="button"
                      onClick={resetChallenge}
                      className="group mb-8 inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-ink-muted transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                    >
                      <ArrowLeftIcon className="size-4 transition-transform group-hover:-translate-x-0.5" />
                      Cambiar cuenta
                    </button>
                  )}

                  <div className="mb-9">
                    <p
                      className="mb-4 text-[10px] font-bold tracking-[0.18em] uppercase"
                      style={{ color: tenant.accent }}
                    >
                      {challenge ? 'Verificación requerida' : copy.index}
                    </p>
                    <h2 className="max-w-lg text-[2.35rem] leading-[1.04] font-semibold tracking-[-0.052em] text-ink sm:text-[3.05rem] dark:text-white">
                      {title}
                    </h2>
                    <p className="mt-4 max-w-sm text-sm leading-6 text-ink-muted">{supportingCopy}</p>
                  </div>

                  <form onSubmit={submit} className="space-y-5" aria-busy={pending} noValidate={false}>
                    {!challenge && (
                      <div>
                        <label
                          htmlFor="login-email"
                          className="mb-2 block text-xs font-semibold text-ink-muted dark:text-ink-secondary"
                        >
                          Correo de trabajo
                        </label>
                        <input
                          id="login-email"
                          type="email"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          autoFocus
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="nombre@empresa.com"
                          aria-describedby={error ? 'login-error' : undefined}
                          className="h-14 w-full rounded-xl border border-border-subtle bg-white/80 px-4 text-[15px] text-ink shadow-[0_10px_28px_var(--app-shadow)] transition-[border-color,background-color,box-shadow] outline-none placeholder:text-ink-secondary hover:border-border-subtle hover:bg-white focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15 sm:h-16 dark:border-white/[0.16] dark:bg-[#10182a]/86 dark:text-ink dark:shadow-[inset_0_1px_rgba(255,255,255,0.025),0_12px_32px_rgba(0,0,0,0.18)] dark:placeholder:text-ink-muted dark:hover:border-white/25 dark:hover:bg-[#121b2f] dark:focus:bg-[#121b2f]"
                        />
                      </div>
                    )}

                    {!isVerificationChallenge && (
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <label
                            htmlFor="login-password"
                            className="text-xs font-semibold text-ink-muted dark:text-ink-secondary"
                          >
                            {isPasswordChallenge ? 'Nueva contraseña' : 'Contraseña'}
                          </label>
                          {!challenge && (
                            <Link
                              href="/forgot-password"
                              className="rounded text-xs font-medium text-ink-muted underline decoration-ink-secondary underline-offset-4 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong dark:decoration-ink-muted dark:hover:text-white dark:focus-visible:outline-white/40"
                            >
                              Recuperar acceso
                            </Link>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={isPasswordChallenge ? 'new-password' : 'current-password'}
                            required
                            minLength={isPasswordChallenge ? 8 : undefined}
                            value={isPasswordChallenge ? newPassword : password}
                            onChange={(event) =>
                              isPasswordChallenge ? setNewPassword(event.target.value) : setPassword(event.target.value)
                            }
                            aria-describedby={
                              isPasswordChallenge ? 'new-password-hint' : error ? 'login-error' : undefined
                            }
                            className="h-14 w-full rounded-xl border border-border-subtle bg-white/80 pr-13 pl-4 text-[15px] text-ink shadow-[0_10px_28px_var(--app-shadow)] transition-[border-color,background-color,box-shadow] outline-none hover:border-border-subtle hover:bg-white focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15 sm:h-16 dark:border-white/[0.16] dark:bg-[#10182a]/86 dark:text-ink dark:shadow-[inset_0_1px_rgba(255,255,255,0.025),0_12px_32px_rgba(0,0,0,0.18)] dark:hover:border-white/25 dark:hover:bg-[#121b2f] dark:focus:bg-[#121b2f]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            aria-pressed={showPassword}
                            className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary transition hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-strong dark:hover:bg-white/[0.06] dark:hover:text-ink dark:focus-visible:outline-white/40"
                          >
                            {showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                          </button>
                        </div>
                        {isPasswordChallenge && (
                          <div id="new-password-hint" className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
                            <span
                              className="flex size-4 items-center justify-center rounded-full"
                              style={{ backgroundColor: `${tenant.accent}18`, color: tenant.accent }}
                            >
                              <CheckIcon className="size-3" />
                            </span>
                            Usa al menos 8 caracteres.
                          </div>
                        )}
                      </div>
                    )}

                    {isVerificationChallenge && (
                      <div>
                        <label
                          htmlFor="login-verification-code"
                          className="mb-2 block text-xs font-semibold text-ink-muted dark:text-ink-secondary"
                        >
                          {verificationLabel}
                        </label>
                        <div className="relative">
                          <KeyIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-secondary" />
                          <input
                            id="login-verification-code"
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            minLength={4}
                            maxLength={12}
                            value={verificationCode}
                            onChange={(event) => setVerificationCode(event.target.value.replace(/\s/g, ''))}
                            aria-describedby={error ? 'login-error' : undefined}
                            className="h-14 w-full rounded-xl border border-border-subtle bg-white/80 pr-4 pl-11 font-mono text-lg tracking-[0.28em] text-ink transition-[border-color,background-color,box-shadow] outline-none hover:border-border-subtle hover:bg-white focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/15 dark:border-white/[0.16] dark:bg-[#10182a]/86 dark:text-ink dark:hover:border-white/25 dark:hover:bg-[#121b2f]"
                          />
                        </div>
                      </div>
                    )}

                    <AnimatePresence initial={false}>
                      {error && (
                        <motion.div
                          ref={errorRef}
                          id="login-error"
                          role="alert"
                          aria-live="assertive"
                          tabIndex={-1}
                          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: reducedMotion ? 0 : 0.18 }}
                          className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-800 outline-none"
                        >
                          <ExclamationCircleIcon className="mt-0.5 size-4 shrink-0" />
                          <span>{error}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.button
                      type="submit"
                      disabled={pending}
                      whileTap={reducedMotion || pending ? undefined : { scale: 0.992 }}
                      transition={{ duration: 0.12 }}
                      className="auth-cta group flex h-14 w-full items-center justify-between rounded-xl border border-white/15 px-5 text-sm font-semibold text-white transition-[transform,filter,box-shadow,opacity] outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-(--tenant-accent)/35 disabled:cursor-wait disabled:opacity-60 sm:h-16"
                    >
                      <span>
                        {pending
                          ? 'Verificando'
                          : isPasswordChallenge
                            ? 'Guardar contraseña'
                            : isVerificationChallenge
                              ? 'Verificar identidad'
                              : 'Entrar al dashboard'}
                      </span>
                      <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white transition-transform group-hover:translate-x-0.5">
                        {pending ? (
                          <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <ArrowRightIcon className="size-3.5" />
                        )}
                      </span>
                    </motion.button>
                  </form>

                  <div className="mt-8 border-t border-border-subtle pt-6 dark:border-white/[0.08]">
                    <div className="flex items-start gap-3 text-xs leading-5 text-ink-muted">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-canvas/[0.045] text-ink-muted dark:bg-white/[0.055] dark:text-ink-secondary">
                        <LockClosedIcon className="size-3.5" />
                      </span>
                      <p>
                        <span className="block font-semibold text-ink-muted dark:text-ink-secondary">
                          Tu acceso está protegido.
                        </span>
                        Autenticación e identidad administradas con Cognito.
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5 text-[11px] text-ink-muted dark:border-white/[0.08] dark:text-ink-muted">
            <span>Sesión privada · {copy.index}</span>
            <span className="font-mono tracking-[0.08em]">{tenant.hostname}</span>
          </footer>
        </motion.div>
      </section>
    </div>
  )
}
