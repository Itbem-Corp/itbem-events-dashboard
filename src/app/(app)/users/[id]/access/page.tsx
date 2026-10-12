'use client'

import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import {
  ACCESS_POLICY_PRODUCT_LABELS,
  ACCESS_POLICY_PRODUCTS,
  capabilityLabel,
  isAccessPolicyDirty,
  readAccessPolicy,
  type AccessPolicy,
  type AccessPolicyProduct,
} from '@/features/users/access-policy'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { userAccessPolicyPath } from '@/lib/api-paths'
import { useStore } from '@/store/useStore'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

// TODO(ADM-1): "Restaurar permisos heredados" needs a backend
// DELETE /access-policies/:user_id/:application_code that does not exist yet.
// Until then an explicit policy can only be edited, not removed.

export default function UserAccessPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const current = useStore((state) => state.user)
  const [product, setProduct] = useState<AccessPolicyProduct>('itbem')
  const [policy, setPolicy] = useState<AccessPolicy | null>(null)
  const [active, setActive] = useState(true)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const primaryRoot = current?.root_level === 1 || (current?.is_root && !current?.root_level)
  const dirty = isAccessPolicyDirty(policy, { isActive: active, capabilities })

  useEffect(() => {
    if (!primaryRoot) router.replace('/users')
  }, [primaryRoot, router])

  useEffect(() => {
    // Only Root 1 may read policies; anyone else would get 403 toasts (ROLES-98).
    if (!primaryRoot) return
    let live = true
    // Never show (or save) the previous product's capabilities while the
    // next product's policy is loading or after it failed to load.
    setPolicy(null)
    setActive(true)
    setCapabilities([])
    setLoadError(false)
    setLoading(true)
    api
      .get(userAccessPolicyPath(id, product))
      .then(({ data }) => {
        if (!live) return
        const loaded = readAccessPolicy(data?.data ?? data)
        setPolicy(loaded)
        setActive(loaded.isActive)
        setCapabilities(loaded.capabilities)
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [id, primaryRoot, product, reloadToken])

  const selectProduct = useCallback(
    (next: AccessPolicyProduct) => {
      if (next === product) return
      if (dirty && !window.confirm('Tienes cambios sin guardar en este producto. ¿Quieres descartarlos?')) return
      setProduct(next)
    },
    [dirty, product]
  )

  const toggle = (capability: string) =>
    setCapabilities((values) =>
      values.includes(capability) ? values.filter((value) => value !== capability) : [...values, capability]
    )

  const save = async () => {
    if (!policy || !dirty || saving) return
    setSaving(true)
    try {
      const { data } = await api.put(userAccessPolicyPath(id, product), { is_active: active, capabilities })
      const saved = readAccessPolicy(data?.data ?? data)
      setPolicy({ ...saved, mode: 'explicit' })
      setActive(saved.isActive)
      setCapabilities(saved.capabilities)
      toast.success('Política de acceso guardada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo guardar la política de acceso.'))
    } finally {
      setSaving(false)
    }
  }

  if (!primaryRoot) return null

  const inherited = policy?.mode === 'inherited'
  const noCapabilities = active && capabilities.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gobierno de acceso"
        title="Control de acceso"
        description="Define qué módulos y vistas puede usar esta persona. Una política explícita sólo limita permisos heredados."
        icon={ShieldCheckIcon}
        actions={
          <Button color="indigo" disabled={loading || saving || !policy || !dirty} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        }
      />
      <div className="premium-surface rounded-2xl p-5" aria-busy={loading}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Producto">
          {(Object.keys(ACCESS_POLICY_PRODUCTS) as AccessPolicyProduct[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={product === code}
              onClick={() => selectProduct(code)}
              className={
                product === code
                  ? 'rounded-lg bg-(--tenant-accent)/15 px-3 py-2 text-sm font-semibold text-ink'
                  : 'rounded-lg px-3 py-2 text-sm text-ink-muted hover:text-ink'
              }
            >
              {ACCESS_POLICY_PRODUCT_LABELS[code]}
            </button>
          ))}
        </div>

        {loadError ? (
          <div role="alert" className="mt-5 flex flex-col gap-3 rounded-xl border border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-secondary">No se pudo cargar la política de acceso de este producto.</p>
            <Button outline onClick={() => setReloadToken((value) => value + 1)}>
              Reintentar
            </Button>
          </div>
        ) : loading || !policy ? (
          <p role="status" className="mt-5 text-sm text-ink-muted">
            Cargando política de acceso…
          </p>
        ) : (
          <>
            {inherited ? (
              <p className="mt-5 rounded-xl border border-border-subtle bg-surface-interactive p-3 text-sm text-ink-secondary">
                <span className="font-semibold text-ink">Heredado.</span> Esta persona usa los permisos de sus roles y
                organizaciones. Si guardas cambios, se creará una política explícita que limitará su acceso a las
                capacidades marcadas.
              </p>
            ) : (
              <p className="mt-5 text-sm text-ink-secondary">
                <span className="font-semibold text-ink">Política explícita.</span> Sólo las capacidades marcadas están
                permitidas en este producto.
              </p>
            )}
            <label className="mt-5 flex items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              Permitir acceso a este producto
            </label>
            <fieldset className="mt-5">
              <legend className="sr-only">Capacidades</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACCESS_POLICY_PRODUCTS[product].map((capability) => (
                  <label
                    key={capability}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle p-3 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={capabilities.includes(capability)}
                      onChange={() => toggle(capability)}
                    />
                    {capabilityLabel(capability)}
                  </label>
                ))}
              </div>
            </fieldset>
            {dirty && noCapabilities && (
              <p role="note" className="mt-4 text-sm text-amber-700 dark:text-amber-300">
                Sin capacidades marcadas, esta persona no podrá usar ningún módulo de este producto.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
