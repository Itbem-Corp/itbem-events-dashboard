'use client'

import { BrandMark } from '@/components/product/brand-mark'
import type { TenantConfig } from '@/lib/tenant-config'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  LockClosedIcon,
} from '@heroicons/react/20/solid'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'

type LoginChallenge = 'NEW_PASSWORD_REQUIRED' | 'SMS_MFA' | 'SOFTWARE_TOKEN_MFA' | 'SMS_OTP' | 'EMAIL_OTP' | null

const PRODUCT_COPY = {
  eventiapp: {
    index: 'EA / 01',
    discipline: 'Event operations',
    title: 'Los eventos no esperan.',
    description: 'Decisiones, invitados y operación en un mismo ritmo.',
    context: 'Una consola diseñada para equipos que producen en tiempo real.',
    signature: 'EVENTI',
  },
  itbem: {
    index: 'IB / 01',
    discipline: 'Business control',
    title: 'Control sin ruido.',
    description: 'Organizaciones, accesos y responsabilidad con total claridad.',
    context: 'Gobierno operativo para equipos que necesitan precisión.',
    signature: 'ITBEM',
  },
  cafettonhouse: {
    index: 'CH / 01',
    discipline: 'Client operations',
    title: 'Operación con criterio.',
    description: 'Clientes y equipos coordinados desde un solo lugar.',
    context: 'Un workspace privado para relaciones que importan.',
    signature: 'CAFETTON',
  },
} as const

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
      window.location.assign('/')
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

  const copy = PRODUCT_COPY[tenant.code]
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
    <div className="mx-auto grid min-h-[calc(100dvh-1rem)] w-full max-w-[1500px] lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.68fr)]">
      <motion.section
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reducedMotion ? { duration: 0 } : entranceTransition}
        className="relative hidden overflow-hidden px-10 py-9 lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12"
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
              <p className="text-sm font-semibold tracking-[-0.01em] text-white">{tenant.name}</p>
              <p className="mt-0.5 text-[10px] font-medium tracking-[0.15em] text-zinc-600 uppercase">
                {copy.discipline}
              </p>
            </div>
          </div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-600">{copy.index}</p>
        </header>

        <div className="relative max-w-3xl pb-8">
          <p className="mb-8 flex items-center gap-3 text-[10px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            <span className="h-px w-9" style={{ backgroundColor: tenant.accent }} />
            Private workspace
          </p>
          <h1
            id="product-statement"
            className="max-w-3xl text-[clamp(3.6rem,6.5vw,7rem)] leading-[0.88] font-medium tracking-[-0.075em] text-white"
          >
            {copy.title}
          </h1>
          <p className="mt-9 max-w-xl text-lg leading-8 tracking-[-0.015em] text-zinc-400">{copy.description}</p>
        </div>

        <footer className="relative flex items-end justify-between gap-10 border-t border-white/[0.08] pt-6">
          <p className="max-w-sm text-xs leading-5 text-zinc-600">{copy.context}</p>
          <p
            aria-hidden="true"
            className="text-right text-[clamp(2rem,4vw,4rem)] leading-none font-semibold tracking-[-0.07em] text-white/[0.035] select-none"
          >
            {copy.signature}
          </p>
        </footer>
      </motion.section>

      <section className="flex items-center justify-center px-3 py-3 sm:px-6 sm:py-6 lg:px-8 xl:px-12">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reducedMotion ? { duration: 0 } : { ...entranceTransition, delay: 0.08 }}
          className="relative flex min-h-[calc(100dvh-1.5rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[1.75rem] bg-[#f2f1ed] px-6 py-7 text-zinc-950 shadow-[0_36px_100px_rgba(0,0,0,0.35)] sm:min-h-[680px] sm:px-10 sm:py-9 lg:min-h-[calc(100dvh-3rem)] xl:px-14"
        >
          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="sm" priority />
              <div>
                <p className="text-sm font-semibold">{tenant.name}</p>
                <p className="mt-0.5 text-[9px] tracking-[0.14em] text-zinc-500 uppercase">{copy.discipline}</p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
              <LockClosedIcon className="size-3.5" />
              Acceso protegido
            </span>
          </div>

          <div className="my-auto py-12 sm:py-16">
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
                    className="group mb-8 inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-zinc-500 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950/40"
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
                  <h2 className="max-w-md text-[2.45rem] leading-[1.02] font-semibold tracking-[-0.055em] text-zinc-950">
                    {title}
                  </h2>
                  <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-600">{supportingCopy}</p>
                </div>

                <form onSubmit={submit} className="space-y-5" aria-busy={pending} noValidate={false}>
                  {!challenge && (
                    <div>
                      <label htmlFor="login-email" className="mb-2 block text-xs font-semibold text-zinc-700">
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
                        className="h-13 w-full rounded-xl border border-zinc-300 bg-white px-4 text-[15px] text-zinc-950 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] outline-none placeholder:text-zinc-400 hover:border-zinc-400 focus:border-zinc-900 focus:ring-3 focus:ring-zinc-950/8"
                      />
                    </div>
                  )}

                  {!isVerificationChallenge && (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <label htmlFor="login-password" className="text-xs font-semibold text-zinc-700">
                          {isPasswordChallenge ? 'Nueva contraseña' : 'Contraseña'}
                        </label>
                        {!challenge && (
                          <Link
                            href="/forgot-password"
                            className="rounded text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950/40"
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
                          className="h-13 w-full rounded-xl border border-zinc-300 bg-white pr-13 pl-4 text-[15px] text-zinc-950 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] outline-none hover:border-zinc-400 focus:border-zinc-900 focus:ring-3 focus:ring-zinc-950/8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          aria-pressed={showPassword}
                          className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-950/40"
                        >
                          {showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                      {isPasswordChallenge && (
                        <div id="new-password-hint" className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
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
                        className="mb-2 block text-xs font-semibold text-zinc-700"
                      >
                        {verificationLabel}
                      </label>
                      <div className="relative">
                        <KeyIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" />
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
                          className="h-14 w-full rounded-xl border border-zinc-300 bg-white pr-4 pl-11 font-mono text-lg tracking-[0.28em] text-zinc-950 transition-[border-color,box-shadow] outline-none hover:border-zinc-400 focus:border-zinc-900 focus:ring-3 focus:ring-zinc-950/8"
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
                    className="group flex h-13 w-full items-center justify-between rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition-[transform,background-color,box-shadow,opacity] outline-none hover:bg-black hover:shadow-[0_16px_34px_rgba(0,0,0,0.22)] focus-visible:ring-3 focus-visible:ring-zinc-950/20 disabled:cursor-wait disabled:opacity-60"
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
                    <span
                      className="flex size-7 items-center justify-center rounded-lg transition-transform group-hover:translate-x-0.5"
                      style={{ backgroundColor: tenant.accent, color: '#09090b' }}
                    >
                      {pending ? (
                        <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <ArrowRightIcon className="size-3.5" />
                      )}
                    </span>
                  </motion.button>
                </form>
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-300/70 pt-5 text-[11px] text-zinc-500">
            <span>Identidad administrada con Cognito</span>
            <span className="font-mono tracking-[0.08em]">{tenant.hostname}</span>
          </footer>
        </motion.div>
      </section>
    </div>
  )
}
