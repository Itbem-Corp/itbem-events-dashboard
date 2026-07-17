'use client'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { designCatalogWorkspacePath, eventConfigPath } from '@/lib/api-paths'
import { designCatalogMediaRefreshKey, getDesignCatalogMediaRefreshDelay } from '@/lib/design-catalog-media'
import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  patchEventConfigIntoEventCacheValue,
  replaceEventConfigCacheValue,
} from '@/lib/event-config-cache'
import { fetcher } from '@/lib/fetcher'
import { resolveBackendMediaUrl } from '@/lib/media-url'
import { normalizeKeys } from '@/lib/normalizer'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { ColorPalette } from '@/models/ColorPalette'
import type { ColorPalettePattern } from '@/models/ColorPalettePattern'
import type { DesignTemplate } from '@/models/DesignTemplate'
import type { EventConfig, EventConfigPatch } from '@/models/EventConfig'
import type { FontSet } from '@/models/FontSet'
import type { FontSetPattern } from '@/models/FontSetPattern'
import { trackProductEvent, type SeededDesignTemplate } from '@/lib/product-analytics'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import useSWR, { mutate } from 'swr'

import { CheckCircleIcon, SwatchIcon } from '@heroicons/react/20/solid'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'

function normalizePatternKey(value?: string) {
  return value
    ?.trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
}

function colorPatternKey(pattern: ColorPalettePattern) {
  return normalizePatternKey(pattern.role ?? pattern.key)
}

function colorValue(pattern: ColorPalettePattern) {
  return pattern.color?.hex_code ?? pattern.color?.value
}

function fontPatternKey(pattern: FontSetPattern) {
  return normalizePatternKey(pattern.role ?? pattern.key)
}

function fontName(pattern: FontSetPattern) {
  return pattern.font?.family ?? pattern.font?.name
}

function normalizeSWRRecord<T>(value: T | undefined): T | undefined {
  return value ? (normalizeKeys(value) as T) : undefined
}

function normalizeSWRList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? (normalizeKeys(value) as T[]) : []
}

function ColorSwatches({ palette }: { palette: ColorPalette }) {
  const patterns = palette.patterns ?? []
  const colorsByKey = new Map<string, string>()
  for (const pattern of patterns) {
    const key = colorPatternKey(pattern)
    const value = colorValue(pattern)
    if (key && value) colorsByKey.set(key, value)
  }

  const preferred = ['PRIMARY', 'SECONDARY', 'BACKGROUND']
    .map((key) => colorsByKey.get(key))
    .filter(Boolean) as string[]
  const fallback = patterns.map(colorValue).filter(Boolean).slice(0, 4) as string[]
  const swatches = preferred.length > 0 ? preferred : fallback

  if (swatches.length === 0) return null

  return (
    <div className="flex gap-1">
      {swatches.map((hex, i) => (
        <div
          key={`${hex}-${i}`}
          className="size-4 rounded-full border border-white/10"
          style={{ backgroundColor: hex }}
          title={hex}
        />
      ))}
    </div>
  )
}

interface TemplatePreviewPalette {
  background: string
  surface: string
  text: string
  heading: string
  accent: string
  border: string
}

export function getDesignTemplatePreviewPalette(template: DesignTemplate): TemplatePreviewPalette | null {
  const palette = template.default_color_palette ?? template.color_palette
  const values = new Map<string, string>()
  for (const pattern of palette?.patterns ?? []) {
    const key = colorPatternKey(pattern)
    const value = colorValue(pattern)?.trim()
    if (key && value) values.set(key, value)
  }
  if (values.size === 0) return null

  const first = [...values.values()][0]
  const read = (...keys: string[]) => keys.map((key) => values.get(key)).find(Boolean)
  const background = read('BACKGROUND', 'BACKGROUND_SOFT', 'SURFACE') ?? first
  const surface = read('SURFACE', 'BACKGROUND_SOFT', 'BACKGROUND') ?? background
  const text = read('TEXT', 'BODY', 'FOREGROUND', 'PRIMARY') ?? first
  const heading = read('HEADING', 'TITLE', 'PRIMARY', 'TEXT') ?? text
  const accent = read('ACCENT', 'SECONDARY', 'PRIMARY', 'GOLD') ?? heading
  const border = read('BORDER', 'LINE', 'MUTED', 'ACCENT') ?? accent

  return { background, surface, text, heading, accent, border }
}

function TemplatePalettePreview({ template, compact }: { template: DesignTemplate; compact: boolean }) {
  const colors = getDesignTemplatePreviewPalette(template)
  if (!colors) return null

  return (
    <div
      role="img"
      aria-label={`Vista previa de ${template.name}`}
      data-template-palette-preview={template.identifier}
      className={[
        compact ? 'h-20' : 'h-28',
        'relative mb-3 w-full overflow-hidden rounded-lg border p-3',
      ].join(' ')}
      style={{ backgroundColor: colors.background, borderColor: colors.border }}
    >
      <div
        className="absolute -top-5 -right-3 size-16 rounded-full opacity-25 blur-xl"
        style={{ backgroundColor: colors.accent }}
      />
      <div
        className="relative h-full rounded-md border px-3 py-2 shadow-sm"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: colors.accent }} />
        <div className="mt-2 h-2 w-3/4 rounded-full opacity-90" style={{ backgroundColor: colors.heading }} />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full opacity-45" style={{ backgroundColor: colors.text }} />
        <div className="absolute right-3 bottom-2 left-3 h-px opacity-50" style={{ backgroundColor: colors.border }} />
      </div>
    </div>
  )
}

interface SelectableCardProps {
  title: string
  subtitle?: string
  isSelected: boolean
  onSelect: () => void
  children?: ReactNode
}

function SelectableCard({ title, subtitle, isSelected, onSelect, children }: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'relative rounded-xl border p-4 text-left transition-all hover:border-indigo-500/50',
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
          : 'border-white/10 bg-surface/50 hover:bg-surface',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          {children && <div className="mt-2">{children}</div>}
        </div>

        <AnimatePresence>
          {isSelected && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <CheckCircleIcon className="size-5 shrink-0 text-indigo-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </button>
  )
}

interface TemplateCardProps {
  template: DesignTemplate
  isSelected: boolean
  onSelect: () => void
  compact?: boolean
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

const SEEDED_TEMPLATE_IDENTIFIERS = new Set<SeededDesignTemplate>([
  'editorial-romance',
  'contemporary-night',
  'warm-celebration',
])

function productTemplateKind(identifier?: string | null): SeededDesignTemplate | 'custom' {
  return identifier && SEEDED_TEMPLATE_IDENTIFIERS.has(identifier as SeededDesignTemplate)
    ? (identifier as SeededDesignTemplate)
    : 'custom'
}

export function resolveDesignTemplatePreviewUrl(
  template: DesignTemplate,
  backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
): string {
  return resolveBackendMediaUrl(
    firstNonEmptyString(template.preview_view_url, template.preview_image_url, template.preview_url),
    backendUrl
  )
}

function TemplateCard({ template, isSelected, onSelect, compact = false }: TemplateCardProps) {
  const previewSrc = resolveDesignTemplatePreviewUrl(template)
  const hasPalettePreview = getDesignTemplatePreviewPalette(template) !== null

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'relative rounded-xl border p-4 text-left transition-all hover:border-indigo-500/50',
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
          : 'border-white/10 bg-surface/50 hover:bg-surface',
      ].join(' ')}
    >
      {previewSrc ? (
        <img
          src={previewSrc}
          alt={template.name}
          className={[compact ? 'h-20' : 'h-28', 'mb-3 w-full rounded-lg border border-white/10 object-cover'].join(
            ' '
          )}
        />
      ) : hasPalettePreview ? (
        <TemplatePalettePreview template={template} compact={compact} />
      ) : (
        <div
          className={[
            compact ? 'h-20' : 'h-28',
            'mb-3 flex w-full items-center justify-center rounded-lg border border-white/10 bg-surface-raised',
          ].join(' ')}
        >
          <SwatchIcon className="size-8 text-ink-muted" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{template.name}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">{template.identifier}</p>
          {template.default_color_palette && (
            <div className="mt-2">
              <ColorSwatches palette={template.default_color_palette} />
            </div>
          )}
          {template.default_font_set && (
            <p className="mt-1 truncate text-xs text-ink-muted">{template.default_font_set.name}</p>
          )}
        </div>

        <AnimatePresence>
          {isSelected && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <CheckCircleIcon className="size-5 shrink-0 text-indigo-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </button>
  )
}

interface Props {
  eventId: string
  compact?: boolean
  initialConfig?: EventConfig | null
  onSaved?: (config?: EventConfig) => void
}

interface DesignCatalogWorkspace {
  templates: DesignTemplate[]
  palettes: ColorPalette[]
  font_sets: FontSet[]
}

export function EventDesignPicker({ eventId, compact = false, initialConfig, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const configPath = eventId ? eventConfigPath(eventId) : null

  const { data: rawConfig, error: configError, isLoading: configLoading } = useSWR<EventConfig>(
    configPath,
    fetcher,
    {
      ...responsiveListSwrOptions,
      fallbackData: initialConfig ?? undefined,
      revalidateOnMount: !initialConfig,
    }
  )
  const { data: rawCatalogs, error: catalogError, isLoading: catalogsLoading } = useSWR<DesignCatalogWorkspace>(designCatalogWorkspacePath(), fetcher, {
    ...responsiveListSwrOptions,
    shouldRetryOnError: false,
  })

  const config = useMemo(() => normalizeSWRRecord(rawConfig), [rawConfig])
  const templates = useMemo(() => normalizeSWRList(rawCatalogs?.templates), [rawCatalogs])
  const palettes = useMemo(() => normalizeSWRList(rawCatalogs?.palettes), [rawCatalogs])
  const fontSets = useMemo(() => normalizeSWRList(rawCatalogs?.font_sets), [rawCatalogs])
  const configErrorState = getDataErrorState(configError, rawConfig)
  const lastCatalogMediaRefreshKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const refreshDelay = getDesignCatalogMediaRefreshDelay({ templates, fontSets })
    const refreshKey = designCatalogMediaRefreshKey({ templates, fontSets })
    if (refreshDelay === null || !refreshKey) return

    const refreshCatalogs = () => {
      lastCatalogMediaRefreshKeyRef.current = refreshKey
      void mutate(designCatalogWorkspacePath())
    }

    if (refreshDelay <= 0) {
      if (lastCatalogMediaRefreshKeyRef.current === refreshKey) return
      refreshCatalogs()
      return
    }

    const timeoutId = window.setTimeout(refreshCatalogs, refreshDelay)

    return () => window.clearTimeout(timeoutId)
  }, [templates, fontSets])

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | undefined>(undefined)
  const [selectedFontSetId, setSelectedFontSetId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!config || saving) return
    setSelectedTemplateId(config.design_template_id ?? undefined)
    setSelectedPaletteId(config.color_palette_id ?? undefined)
    setSelectedFontSetId(config.font_set_id ?? undefined)
  }, [config, saving])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates]
  )

  const currentTemplateId = config?.design_template_id ?? undefined
  const currentPaletteId = config?.color_palette_id ?? undefined
  const currentFontSetId = config?.font_set_id ?? undefined
  const hasChanges =
    selectedTemplateId !== currentTemplateId ||
    selectedPaletteId !== currentPaletteId ||
    selectedFontSetId !== currentFontSetId
  const hasCatalogs = templates.length > 0 || palettes.length > 0 || fontSets.length > 0
  const catalogRefreshError = Boolean(catalogError && hasCatalogs)
  const catalogGridClass = compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'

  const handleSave = async () => {
    if (!config) return
    const payload: EventConfigPatch = {}
      if (selectedTemplateId !== currentTemplateId) payload.design_template_id = selectedTemplateId ?? null
      if (selectedPaletteId !== currentPaletteId) payload.color_palette_id = selectedPaletteId ?? null
      if (selectedFontSetId !== currentFontSetId) payload.font_set_id = selectedFontSetId ?? null

      if (Object.keys(payload).length === 0) {
        toast.info('Sin cambios')
        return
      }

    const snapshot = config
    const optimistic: EventConfig = { ...config, ...payload }
    setSaving(true)
    onSaved?.(optimistic)
    await mutate(eventConfigPath(eventId), optimistic, { revalidate: false })
    await mutate(
      (key) => isEventConfigBackedEventCacheKey(key, eventId),
      (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, optimistic),
      { revalidate: false }
    )
    try {

      const res = await api.put<EventConfig>(eventConfigPath(eventId), payload)
      const updated = readApiData<EventConfig | null>(res.data)
      if (hasEventConfigCacheIdentity(updated)) {
        await mutate(
          eventConfigPath(eventId),
          (current: EventConfig | undefined) => replaceEventConfigCacheValue(current, updated) as EventConfig,
          { revalidate: false }
        )
        await mutate(
          (key) => isEventConfigBackedEventCacheKey(key, eventId),
          (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, updated),
          { revalidate: false }
        )
      } else {
        await mutate(eventConfigPath(eventId))
        await mutate((key) => isEventConfigBackedEventCacheKey(key, eventId))
      }
      onSaved?.(updated ?? undefined)
      const appliedTemplate = templates.find((template) => template.id === selectedTemplateId)
      trackProductEvent('design_saved', {
        template_kind: productTemplateKind(appliedTemplate?.identifier),
        palette_override: Boolean(selectedPaletteId),
        font_override: Boolean(selectedFontSetId),
      })
      toast.success('Diseño guardado')
    } catch (err: unknown) {
      await mutate(eventConfigPath(eventId), snapshot, { revalidate: false })
      await mutate(
        (key) => isEventConfigBackedEventCacheKey(key, eventId),
        (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, snapshot),
        { revalidate: false }
      )
      onSaved?.(snapshot)
      toast.error(getApiErrorMessage(err, 'Error al guardar el diseño'))
    } finally {
      setSaving(false)
    }
  }

  const isLoading = Boolean((!config && configLoading) || catalogsLoading)

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-surface-raised" />
        <div className={catalogGridClass}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-surface-raised" />
          ))}
        </div>
      </div>
    )
  }

  if (!config) {
    return <div className="py-12 text-center text-sm text-ink-muted">No se pudo cargar la configuración de diseño.</div>
  }

  return (
    <div className={compact ? 'space-y-6' : 'space-y-8'}>
      {(configErrorState === 'stale' || catalogRefreshError) && (
        <StaleDataNotice
          label="el diseño"
          onRetry={() => {
            void mutate(eventConfigPath(eventId))
            void mutate(designCatalogWorkspacePath())
          }}
        />
      )}
      {templates.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-ink">Plantilla de diseño</p>
            <p className="mt-0.5 text-xs text-ink-muted">Elige la plantilla visual base para la página pública.</p>
          </div>
          <div className={catalogGridClass}>
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                onSelect={() => !saving && setSelectedTemplateId(template.id)}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {palettes.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-ink">Paleta de colores</p>
            <p className="mt-0.5 text-xs text-ink-muted">Override opcional; vacío usa la paleta de la plantilla.</p>
          </div>
          <div className={catalogGridClass}>
            <SelectableCard
              title="Usar plantilla"
              subtitle={selectedTemplate?.default_color_palette?.name ?? 'Sin override'}
              isSelected={!selectedPaletteId}
              onSelect={() => !saving && setSelectedPaletteId(undefined)}
            >
              {selectedTemplate?.default_color_palette && (
                <ColorSwatches palette={selectedTemplate.default_color_palette} />
              )}
            </SelectableCard>
            {palettes.map((palette) => (
              <SelectableCard
                key={palette.id}
                title={palette.name}
                isSelected={selectedPaletteId === palette.id}
                onSelect={() => !saving && setSelectedPaletteId(palette.id)}
              >
                <ColorSwatches palette={palette} />
              </SelectableCard>
            ))}
          </div>
        </div>
      )}

      {fontSets.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-ink">Tipografía</p>
            <p className="mt-0.5 text-xs text-ink-muted">Override opcional; vacío usa la fuente de la plantilla.</p>
          </div>
          <div className={catalogGridClass}>
            <SelectableCard
              title="Usar plantilla"
              subtitle={selectedTemplate?.default_font_set?.name ?? 'Sin override'}
              isSelected={!selectedFontSetId}
              onSelect={() => !saving && setSelectedFontSetId(undefined)}
            />
            {fontSets.map((fontSet) => {
              const sample = (fontSet.patterns ?? [])
                .map((pattern) => {
                  const key = fontPatternKey(pattern)
                  const name = fontName(pattern)
                  return key && name ? `${key.toLowerCase()}: ${name}` : name
                })
                .filter(Boolean)
                .join(' · ')

              return (
                <SelectableCard
                  key={fontSet.id}
                  title={fontSet.name}
                  subtitle={sample || undefined}
                  isSelected={selectedFontSetId === fontSet.id}
                  onSelect={() => !saving && setSelectedFontSetId(fontSet.id)}
                />
              )
            })}
          </div>
        </div>
      )}

      {!hasCatalogs && catalogError && (
        <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
          <SwatchIcon className="mx-auto mb-3 size-10 text-amber-500/60" />
          <p className="text-sm text-amber-200">No pudimos cargar los catálogos de diseño.</p>
          <button
            type="button"
            onClick={() => {
              void mutate(designCatalogWorkspacePath())
            }}
            className="mt-3 text-xs font-semibold text-amber-300 hover:text-white"
          >
            Reintentar
          </button>
        </div>
      )}

      {!hasCatalogs && !catalogError && (
        <div className="rounded-xl border border-white/10 bg-surface/30 p-8 text-center">
          <SwatchIcon className="mx-auto mb-3 size-10 text-ink-muted" />
          <p className="text-sm text-ink-muted">No hay catálogos de diseño disponibles aún.</p>
          <p className="mt-1 text-xs text-ink-muted">
            Los catálogos de diseño se configuran desde el panel de administración.
          </p>
        </div>
      )}

      {hasCatalogs && (
        <div className="flex justify-end border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={[
              'flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
              compact ? 'w-full justify-center' : '',
            ].join(' ')}
          >
            {saving ? 'Guardando...' : 'Guardar diseño'}
          </button>
        </div>
      )}
    </div>
  )
}
