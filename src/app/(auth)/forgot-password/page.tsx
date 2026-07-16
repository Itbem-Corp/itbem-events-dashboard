'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('')
    try {
      const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent ? { email, code, password } : { email }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'No pudimos procesar la solicitud.')
      if (!sent) setSent(true); else window.location.assign('/login')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos procesar la solicitud.') } finally { setPending(false) }
  }
  return <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950/90 p-8 shadow-2xl sm:p-10"><p className="text-xs font-semibold tracking-[0.18em] text-indigo-300 uppercase">Recuperar acceso</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{sent ? 'Revisa tu correo' : 'Restablece tu contraseña'}</h1><p className="mt-3 text-sm leading-6 text-zinc-500">{sent ? 'Ingresa el código recibido y crea una contraseña nueva.' : 'Te enviaremos un código si el correo pertenece a una cuenta.'}</p><form onSubmit={submit} className="mt-8 space-y-4"><input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} disabled={sent} placeholder="tu@empresa.com" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none disabled:opacity-60" />{sent && <><input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Código de verificación" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none" /><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nueva contraseña" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none" /></>}{error && <p role="alert" className="rounded-xl bg-red-400/[0.07] p-3 text-sm text-red-200">{error}</p>}<button disabled={pending} className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">{pending ? 'Procesando…' : sent ? 'Guardar contraseña' : 'Enviar código'}</button></form><Link href="/login" className="mt-6 inline-block text-sm text-zinc-500 hover:text-white">Volver al acceso</Link></div>
}
