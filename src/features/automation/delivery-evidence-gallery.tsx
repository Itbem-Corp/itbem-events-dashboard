'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import type { DeliveryEvidence } from '@/features/automation/delivery-types'
import { api } from '@/lib/api'
import { deliveryWorkItemEvidenceAssetPath } from '@/lib/api-paths'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon, PhotoIcon, PlayCircleIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useRef, useState } from 'react'

type EvidenceAsset = DeliveryEvidence & { url?: string; loading?: boolean; error?: boolean }

function formatDate(value?: string) {
  if (!value) return 'Sin fecha registrada'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin fecha registrada' : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function evidenceIntegrity(entry?: DeliveryEvidence) {
  const digest = typeof entry?.metadata?.sha256 === 'string' ? entry.metadata.sha256.trim().toLowerCase() : ''
  const size = typeof entry?.metadata?.size_bytes === 'number' && Number.isFinite(entry.metadata.size_bytes)
    ? Math.max(0, Math.trunc(entry.metadata.size_bytes))
    : undefined
  return { digest: /^[a-f0-9]{64}$/.test(digest) ? digest : '', size }
}

function fileSize(bytes?: number) {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPrivateVisual(entry: DeliveryEvidence) {
  return entry.reference.startsWith('s3://') && (entry.kind === 'screenshot' || entry.kind === 'video')
}

function isVisual(entry: DeliveryEvidence) {
  return entry.kind === 'screenshot' || entry.kind === 'video'
}

function phaseLabel(phase: string) {
  return ({ plan: 'Plan', implementation: 'Implementación', qa: 'QA', summary: 'Entrega' }[phase] ?? phase)
}

type QAComparisonPair = { key: string; before: DeliveryEvidence; after: DeliveryEvidence }

export function qaComparison(entry: DeliveryEvidence): { key: string; role: 'before' | 'after' } | undefined {
  const metadata = entry.metadata
  const key = typeof metadata?.qa_comparison_key === 'string' ? metadata.qa_comparison_key : ''
  const role = typeof metadata?.qa_comparison_role === 'string' ? metadata.qa_comparison_role : ''
  if (!/^case-\d{1,3}$/.test(key) || (role !== 'before' && role !== 'after')) return undefined
  return { key, role }
}

export function DeliveryEvidenceGallery({ workItemId, evidence }: { workItemId: string; evidence?: DeliveryEvidence[] }) {
  const [assets, setAssets] = useState<Record<string, EvidenceAsset>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Evidence assets can be sizable authenticated downloads. A focused first
  // batch keeps opening this console surface responsive; the operator can
  // deliberately extend the gallery when the current result needs it.
  const [visibleVisualCount, setVisibleVisualCount] = useState(4)
  const loadedAssetIDsRef = useRef(new Set<string>())
  const objectURLsRef = useRef(new Map<string, string>())
  // New proof should be immediately useful. Keep the freshest evidence first
  // instead of exposing the order in which storage happened to return it.
  const entries = useMemo(() => [...(evidence ?? [])].sort((left, right) => {
    const leftTime = left.captured_at ? Date.parse(left.captured_at) : 0
    const rightTime = right.captured_at ? Date.parse(right.captured_at) : 0
    return rightTime - leftTime
  }), [evidence])
  const visualEntries = useMemo(() => entries.filter(isVisual), [entries])
  const latestEvidence = entries[0]
  // A QA pair is one proof. If a visible capture belongs to a comparison,
  // include its counterpart too so the operator never sees a dangling item.
  const visibleVisualEntries = useMemo(() => {
    const visibleIDs = new Set(visualEntries.slice(0, visibleVisualCount).map((entry) => entry.id))
    for (const entry of visualEntries.slice(0, visibleVisualCount)) {
      const comparison = qaComparison(entry)
      if (!comparison) continue
      const counterpart = visualEntries.find((candidate) => {
        const candidateComparison = qaComparison(candidate)
        return candidateComparison?.key === comparison.key && candidateComparison.role !== comparison.role
      })
      if (counterpart) visibleIDs.add(counterpart.id)
    }
    return visualEntries.filter((entry) => visibleIDs.has(entry.id))
  }, [visibleVisualCount, visualEntries])

  useEffect(() => {
    setVisibleVisualCount(4)
    setSelectedId(null)
    loadedAssetIDsRef.current.clear()
    objectURLsRef.current.forEach((url) => URL.revokeObjectURL(url))
    objectURLsRef.current.clear()
    setAssets({})
  }, [workItemId])

  useEffect(() => {
    setAssets((current) => Object.fromEntries(entries.map((entry) => [entry.id, {
      ...entry,
      ...(current[entry.id]?.url ? { url: current[entry.id].url, loading: false } : {}),
      ...(!current[entry.id]?.url && isPrivateVisual(entry) ? { loading: !loadedAssetIDsRef.current.has(entry.id) } : {}),
      ...(current[entry.id]?.error ? { error: true, loading: false } : {}),
    }])))
  }, [entries])

  useEffect(() => {
    let active = true
    void (async () => {
      const privateVisualEntries = visibleVisualEntries.filter((entry) => isPrivateVisual(entry) && !loadedAssetIDsRef.current.has(entry.id))
      // Resolve a few assets at a time. Screenshot evidence can be materially
      // larger than a normal dashboard response, so this avoids a burst of
      // parallel authenticated downloads on long QA runs.
      for (let index = 0; index < privateVisualEntries.length; index += 2) {
        await Promise.all(privateVisualEntries.slice(index, index + 2).map(async (entry) => {
          loadedAssetIDsRef.current.add(entry.id)
          try {
            const response = await api.get(deliveryWorkItemEvidenceAssetPath(workItemId, entry.id), { responseType: 'blob' })
            const url = URL.createObjectURL(response.data as Blob)
            if (!active) {
              URL.revokeObjectURL(url)
              return
            }
            objectURLsRef.current.set(entry.id, url)
            setAssets((current) => ({ ...current, [entry.id]: { ...entry, url, loading: false } }))
          } catch {
            if (active) setAssets((current) => ({ ...current, [entry.id]: { ...entry, loading: false, error: true } }))
          }
        }))
        if (!active) return
      }
    })()
    return () => {
      active = false
    }
  }, [visibleVisualEntries, workItemId])

  useEffect(() => () => {
    objectURLsRef.current.forEach((url) => URL.revokeObjectURL(url))
    objectURLsRef.current.clear()
  }, [])

  const comparisonPairs = useMemo<QAComparisonPair[]>(() => {
    const pairs = new Map<string, Partial<QAComparisonPair>>()
    for (const entry of visibleVisualEntries) {
      const comparison = qaComparison(entry)
      if (!comparison || !isPrivateVisual(entry)) continue
      const pair = pairs.get(comparison.key) ?? { key: comparison.key }
      pair[comparison.role] = entry
      pairs.set(comparison.key, pair)
    }
    return Array.from(pairs.values()).flatMap((pair) => pair.before && pair.after ? [{ key: pair.key!, before: pair.before, after: pair.after }] : [])
  }, [visibleVisualEntries])
  const pairedEvidenceIDs = useMemo(() => new Set(comparisonPairs.flatMap((pair) => [pair.before.id, pair.after.id])), [comparisonPairs])
  const standaloneVisualEntries = useMemo(() => visibleVisualEntries.filter((entry) => !pairedEvidenceIDs.has(entry.id)), [pairedEvidenceIDs, visibleVisualEntries])
  const secondaryEntries = useMemo(() => entries.filter((entry) => !isVisual(entry)), [entries])
  const loadingVisualCount = visibleVisualEntries.filter((entry) => assets[entry.id]?.loading).length
  const selected = useMemo(() => {
    if (!selectedId) return undefined
    const entry = entries.find((candidate) => candidate.id === selectedId)
    if (!entry) return undefined
    const asset = assets[selectedId]
    const external = /^https?:\/\//.test(entry.reference) ? entry.reference : undefined
    return { ...entry, ...asset, ...(asset?.url || !external ? {} : { url: external }) }
  }, [assets, entries, selectedId])

  return (
    <section className="premium-surface overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-4 border-b border-border-subtle px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
            <ShieldCheckIcon className="size-4 text-(--tenant-accent)" /> Evidencia
          </div>
          <h2 className="mt-1 text-lg font-semibold text-ink">Pruebas del flujo</h2>
        </div>
        {entries.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            {latestEvidence && (
              <span title={latestEvidence.title} className="hidden min-w-0 max-w-52 items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-semibold text-ink-secondary sm:inline-flex">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="truncate">Última prueba · {latestEvidence.title}</span>
              </span>
            )}
            {visualEntries.length > 0 && <Badge color="indigo">{visualEntries.length} visual{visualEntries.length === 1 ? '' : 'es'}</Badge>}
            {secondaryEntries.length > 0 && <Badge color="zinc">{secondaryEntries.length} registro{secondaryEntries.length === 1 ? '' : 's'}</Badge>}
          </div>
        )}
      </div>

      {!entries.length ? (
        <div className="flex items-center gap-4 px-5 py-6 sm:px-6" role="status" aria-live="polite">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><ArrowPathIcon className="size-5 delivery-signal motion-reduce:animate-none" /></span>
          <div>
            <p className="text-sm font-semibold text-ink">Evidencia en preparación</p>
            <p className="mt-1 text-xs text-ink-muted">El agente la incorpora al terminar su siguiente comprobación.</p>
          </div>
        </div>
      ) : (
        <div className="p-5 sm:p-6">
          {visualEntries.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy={loadingVisualCount > 0}>
              {comparisonPairs.map((pair) => (
                <article key={pair.key} className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft md:col-span-2 xl:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                    <div><p className="text-sm font-semibold text-ink">Comparación QA · {pair.key.replace('case-', 'Caso ')}</p><p className="mt-0.5 text-xs text-ink-muted">Antes y después del mismo caso comprobado.</p></div>
                    <Badge color="indigo">Antes / Después</Badge>
                  </div>
                  <div className="grid gap-px bg-border-subtle sm:grid-cols-2">
                    {[{ entry: pair.before, label: 'Antes' }, { entry: pair.after, label: 'Después' }].map(({ entry, label }) => {
                      const asset = assets[entry.id]
                      const source = asset?.url ?? (/^https?:\/\//.test(entry.reference) ? entry.reference : undefined)
                      return (
                        <button key={entry.id} type="button" onClick={() => source && setSelectedId(entry.id)} disabled={!source} className="group bg-surface-raised text-left transition motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-(--tenant-accent) disabled:opacity-70">
                          <div className="relative aspect-[16/10] overflow-hidden bg-surface-interactive">
                            {asset?.loading ? <div className="flex h-full items-center justify-center text-sm text-ink-muted">Preparando captura privada…</div> : source ? <img src={source} alt={`${label}: ${entry.title}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none" /> : <div className="flex h-full items-center justify-center text-sm text-ink-muted">Captura no disponible</div>}
                            {source && <span className="absolute left-3 top-3 rounded-lg bg-black/55 px-2 py-1 text-xs font-semibold text-white">{label}</span>}
                          </div>
                          <div className="p-3"><p className="text-xs font-semibold text-ink">{label}</p><p className="mt-1 text-[11px] text-ink-muted">{formatDate(entry.captured_at)}</p></div>
                        </button>
                      )
                    })}
                  </div>
                </article>
              ))}
              {standaloneVisualEntries.map((entry, index) => {
                const asset = assets[entry.id]
                const external = /^https?:\/\//.test(entry.reference) ? entry.reference : undefined
                const source = asset?.url ?? external
                const isVideo = entry.kind === 'video'
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => source && setSelectedId(entry.id)}
                    disabled={!source}
                    className={`group overflow-hidden rounded-2xl border bg-surface-soft text-left transition motion-reduce:transform-none motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-(--tenant-accent) ${index === 0 && standaloneVisualEntries.length % 2 === 1 ? 'md:col-span-2 xl:col-span-1' : ''} ${source ? 'border-border-subtle hover:-translate-y-0.5 hover:border-(--tenant-accent)/45 hover:shadow-lg' : 'border-border-subtle opacity-75'}`}
                  >
                    <div className="relative aspect-[16/8] overflow-hidden bg-surface-interactive">
                      {asset?.loading ? (
                        <div className="flex h-full items-center justify-center text-sm text-ink-muted">Preparando evidencia privada…</div>
                      ) : source && !isVideo ? (
                        <img src={source} alt={entry.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none" />
                      ) : source ? (
                        <video src={source} className="h-full w-full object-cover" muted preload="metadata" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-muted"><PhotoIcon className="size-7" /> Evidencia no disponible</div>
                      )}
                      {source && <span className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent" />}
                      {isVideo && source && <PlayCircleIcon className="absolute left-4 top-4 size-8 text-white" />}
                      {source && <span className="absolute bottom-3 right-3 rounded-lg bg-black/55 px-2 py-1 text-xs font-medium text-white">Abrir</span>}
                    </div>
                    <div className="p-3">
                        <div className="flex flex-wrap gap-2"><Badge color="indigo">{phaseLabel(entry.phase)}</Badge><Badge color="zinc">{isVideo ? 'Video' : 'Captura'}</Badge></div>
                        <p className="mt-2 truncate text-sm font-semibold text-ink">{entry.title}</p>
                        <p className="mt-1 text-xs text-ink-muted">{formatDate(entry.captured_at)}</p>
                        {evidenceIntegrity(entry).digest && (
                          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700"><ShieldCheckIcon className="size-3.5" /> Integridad SHA-256 {fileSize(evidenceIntegrity(entry).size) && `· ${fileSize(evidenceIntegrity(entry).size)}`}</p>
                        )}
                      </div>
                  </button>
                )
              })}
            </div>
          )}

          {visualEntries.length > visibleVisualEntries.length && (
            <div className="mt-4 flex justify-center">
              <Button outline onClick={() => setVisibleVisualCount((count) => Math.min(count + 4, visualEntries.length))}>
                Ver {Math.min(4, visualEntries.length - visibleVisualEntries.length)} evidencia{Math.min(4, visualEntries.length - visibleVisualEntries.length) === 1 ? '' : 's'} más
              </Button>
            </div>
          )}

          {loadingVisualCount > 0 && (
            <p role="status" aria-live="polite" className="sr-only">
              Preparando {loadingVisualCount} captura{loadingVisualCount === 1 ? '' : 's'} privada{loadingVisualCount === 1 ? '' : 's'}.
            </p>
          )}

          {secondaryEntries.length > 0 && (
            <details open={visualEntries.length === 0} className={`group ${visualEntries.length ? 'mt-5 overflow-hidden border-t border-border-subtle pt-5' : 'overflow-hidden'}`}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden">
                <span><span className="block text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Registros</span><span className="mt-1 block text-xs text-ink-secondary">{secondaryEntries.length} artefacto{secondaryEntries.length === 1 ? '' : 's'} del proceso</span></span>
                <span className="min-h-9 rounded-lg bg-surface-soft px-2 py-1 text-xs font-semibold text-ink-secondary"><span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Ocultar</span></span>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {secondaryEntries.map((entry) => (
                  <article key={entry.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border-subtle bg-surface-soft p-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-(--tenant-accent)"><DocumentTextIcon className="size-5" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{entry.title}</p><p className="mt-0.5 text-xs text-ink-muted">{phaseLabel(entry.phase)} · {formatDate(entry.captured_at)}</p></div>
                    <Badge color="zinc" className="shrink-0">{entry.kind.replace('_', ' ')}</Badge>
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <Dialog open={Boolean(selected)} onClose={() => setSelectedId(null)} size="2xl">
        <DialogTitle>{selected?.title ?? 'Evidencia visual'}</DialogTitle>
        <DialogBody className="py-4">
          {selected?.url && selected.kind === 'screenshot' && <img src={selected.url} alt={selected.title} className="max-h-[70vh] w-full rounded-xl object-contain bg-surface-soft" />}
          {selected?.url && selected.kind === 'video' && <video src={selected.url} controls className="max-h-[70vh] w-full rounded-xl bg-surface-soft" />}
          <p className="mt-3 text-sm text-ink-muted">{phaseLabel(selected?.phase ?? '')} · {formatDate(selected?.captured_at)}</p>
          {evidenceIntegrity(selected).digest && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] px-3 py-2 text-xs text-emerald-800">
              <ShieldCheckIcon className="size-4 shrink-0" />
              <span className="font-semibold">Huella SHA-256 registrada</span>
              <span className="font-mono text-[11px]">SHA-256 {evidenceIntegrity(selected).digest.slice(0, 12)}…</span>
              {fileSize(evidenceIntegrity(selected).size) && <span>{fileSize(evidenceIntegrity(selected).size)}</span>}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          {selected?.url && <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-(--tenant-accent) hover:underline"><ArrowTopRightOnSquareIcon className="size-4" /> Abrir en otra pestaña</a>}
          <Button outline onClick={() => setSelectedId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </section>
  )
}
