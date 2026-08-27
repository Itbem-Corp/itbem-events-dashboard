'use client'

import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { api } from '@/lib/api'
import { userAccessPolicyPath } from '@/lib/api-paths'
import { useStore } from '@/store/useStore'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const products = {
  itbem: ['dashboard:view', 'metrics:view', 'audit:view', 'automation:view', 'automation:manage', 'platform:users:view', 'organizations:view', 'members:manage'],
  eventiapp: ['dashboard:view', 'metrics:view', 'events:view', 'events:create', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view', 'members:manage'],
  cafettonhouse: ['dashboard:view', 'metrics:view', 'events:view', 'events:create', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view', 'members:manage'],
} as const

export default function UserAccessPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const current = useStore((state) => state.user)
  const [product, setProduct] = useState<keyof typeof products>('itbem')
  const [active, setActive] = useState(true)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const primaryRoot = current?.root_level === 1 || (current?.is_root && !current?.root_level)
  useEffect(() => { if (!primaryRoot) router.replace('/users') }, [primaryRoot, router])
  useEffect(() => { let live = true; setLoading(true); api.get(userAccessPolicyPath(id, product)).then(({ data }) => { const value = data?.data ?? data; if (live) { setActive(value.is_active !== false); setCapabilities(value.capabilities ?? []) } }).catch(() => toast.error('No se pudo cargar la política')).finally(() => live && setLoading(false)); return () => { live = false } }, [id, product])
  const toggle = (capability: string) => setCapabilities((current) => current.includes(capability) ? current.filter((value) => value !== capability) : [...current, capability])
  const save = async () => { setSaving(true); try { await api.put(userAccessPolicyPath(id, product), { is_active: active, capabilities }); toast.success('Política de acceso guardada') } catch { toast.error('No se pudo guardar la política') } finally { setSaving(false) } }
  if (!primaryRoot) return null
  return <div className="space-y-6"><PageHeader eyebrow="Gobierno de acceso" title="Control de acceso" description="Define qué módulos y vistas puede usar esta persona. Una política explícita sólo limita permisos heredados." icon={ShieldCheckIcon} actions={<Button color="indigo" disabled={loading || saving} onClick={() => void save()}>Guardar cambios</Button>} /><div className="premium-surface rounded-2xl p-5"><div className="flex flex-wrap gap-2">{Object.keys(products).map((code) => <button key={code} type="button" onClick={() => setProduct(code as keyof typeof products)} className={product === code ? 'rounded-lg bg-(--tenant-accent)/15 px-3 py-2 text-sm font-semibold text-ink' : 'rounded-lg px-3 py-2 text-sm text-ink-muted'}>{code}</button>)}</div><label className="mt-5 flex items-center gap-3 text-sm text-ink"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Permitir acceso a este producto</label><div className="mt-5 grid gap-2 sm:grid-cols-2">{products[product].map((capability) => <label key={capability} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3 text-sm text-ink"><input type="checkbox" checked={capabilities.includes(capability)} onChange={() => toggle(capability)} />{capability}</label>)}</div></div></div>
}
