'use client'

import type { TenantConfig } from '@/lib/tenant-config'
import { ArrowRightIcon, EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/20/solid'
import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useState } from 'react'

export function LoginForm({ tenant }: { tenant: Omit<TenantConfig, 'clientId'> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [challenge, setChallenge] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch(challenge ? '/api/auth/new-password' : '/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenge ? { password: newPassword } : { email, password }),
      })
      const result = await response.json() as { ok?: boolean; challenge?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'No pudimos completar el acceso.')
      if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
        setChallenge(true)
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

  return (
    <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 shadow-[0_36px_120px_rgba(0,0,0,0.6)] backdrop-blur-2xl lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden min-h-[650px] overflow-hidden border-r border-white/[0.08] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_srgb,var(--tenant-accent)_22%,transparent),transparent_40%),linear-gradient(145deg,#111827_0%,#09090b_60%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] shadow-2xl">
            <Image src="/eventiapp-icon.svg" width={30} height={32} alt="" priority />
          </span>
          <div><p className="font-semibold text-white">{tenant.name}</p><p className="text-xs tracking-[0.16em] text-zinc-500 uppercase">{tenant.productLabel}</p></div>
        </div>
        <div className="relative max-w-md">
          <p className="mb-5 text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">Centro de operaciones</p>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-white">Todo tu evento, bajo control.</h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-zinc-400">Diseña, publica y opera experiencias memorables desde un espacio seguro y enfocado.</p>
        </div>
        <p className="relative text-xs text-zinc-600">Acceso protegido por Amazon Cognito</p>
      </section>

      <section className="flex min-h-[600px] items-center px-6 py-12 sm:px-12 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-9 lg:hidden"><Image src="/eventiapp-icon.svg" width={34} height={36} alt="" priority /><p className="mt-3 text-sm font-semibold text-white">{tenant.name}</p></div>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: tenant.accent }}>{challenge ? 'Protege tu cuenta' : 'Bienvenido de vuelta'}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{challenge ? 'Crea una contraseña nueva' : 'Inicia sesión'}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{challenge ? 'Este cambio es obligatorio antes de continuar.' : `Entra al workspace de ${tenant.name}.`}</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {!challenge && <label className="block"><span className="mb-2 block text-sm font-medium text-zinc-300">Correo</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@empresa.com" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none transition focus:border-white/25 focus:ring-4 focus:ring-white/[0.04]" /></label>}
            <label className="block"><span className="mb-2 block text-sm font-medium text-zinc-300">{challenge ? 'Nueva contraseña' : 'Contraseña'}</span><span className="relative block"><input type={showPassword ? 'text' : 'password'} autoComplete={challenge ? 'new-password' : 'current-password'} required minLength={challenge ? 8 : undefined} value={challenge ? newPassword : password} onChange={(event) => challenge ? setNewPassword(event.target.value) : setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 pr-12 text-sm text-white outline-none transition focus:border-white/25 focus:ring-4 focus:ring-white/[0.04]" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300">{showPassword ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}</button></span></label>
            {error && <div role="alert" className="rounded-xl border border-red-400/15 bg-red-400/[0.06] px-3.5 py-3 text-sm leading-5 text-red-200">{error}</div>}
            <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 shadow-xl shadow-black/20 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60">{pending ? 'Verificando…' : challenge ? 'Guardar y continuar' : 'Continuar'}<ArrowRightIcon className="size-4" /></button>
          </form>

          {!challenge && <div className="mt-5 flex items-center justify-between text-sm"><Link href="/forgot-password" className="text-zinc-400 transition hover:text-white">¿Olvidaste tu contraseña?</Link><span className="flex items-center gap-1.5 text-xs text-zinc-600"><LockClosedIcon className="size-3.5" /> Sesión privada</span></div>}
        </div>
      </section>
    </div>
  )
}

