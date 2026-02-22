'use client'

import useSWR, { mutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useState } from 'react'
import type { DesignTemplate } from '@/models/DesignTemplate'
import type { ColorPalette } from '@/models/ColorPalette'
import type { FontSet } from '@/models/FontSet'
import type { EventConfig } from '@/models/EventConfig'

import {
  CheckCircleIcon,
  SwatchIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'

// ─── Color Swatch Preview ─────────────────────────────────────────────────────

function ColorSwatches({ palette }: { palette: ColorPalette }) {
  const colors = palette.patterns ?? []
  const primary = colors.find((p) => p.role === 'PRIMARY')?.color?.hex_code
  const secondary = colors.find((p) => p.role === 'SECONDARY')?.color?.hex_code
  const bg = colors.find((p) => p.role === 'BACKGROUND')?.color?.hex_code

  return (
    <div className="flex gap-1">
      {[primary, secondary, bg].filter(Boolean).map((hex, i) => (
        <div
          key={i}
          className="size-4 rounded-full border border-white/10"
          style={{ backgroundColor: hex }}
          title={hex}
        />
      ))}
    </div>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: DesignTemplate
  isSelected: boolean
  onSelect: () => void
}

function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  return (
    <button
      onClick={onSelect}
      className={[
        'relative rounded-xl border p-4 text-left transition-all hover:border-indigo-500/50',
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
          : 'border-white/10 bg-zinc-900/50 hover:bg-zinc-900',
      ].join(' ')}
    >
      {/* Preview image */}
      {template.preview_image_url ? (
        <img
          src={template.preview_image_url}
          alt={template.name}
          className="w-full h-28 object-cover rounded-lg mb-3 border border-white/10"
        />
      ) : (
        <div className="w-full h-28 rounded-lg mb-3 border border-white/10 bg-zinc-800 flex items-center justify-center">
          <SwatchIcon className="size-8 text-zinc-700" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-200">{template.name}</p>
          <p className="text-xs text-zinc-600 mt-0.5 font-mono">{template.identifier}</p>
          {template.default_color_palette && (
            <div className="mt-2">
              <ColorSwatches palette={template.default_color_palette} />
            </div>
          )}
          {template.default_font_set && (
            <p className="mt-1 text-xs text-zinc-600">
              {template.default_font_set.name}
            </p>
          )}
        </div>

        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <CheckCircleIcon className="size-5 text-indigo-400 shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </button>
  )
}

// ─── Palette Card ─────────────────────────────────────────────────────────────

interface PaletteCardProps {
  palette: ColorPalette
  isSelected: boolean
  onSelect: () => void
}

function PaletteCard({ palette, isSelected, onSelect }: PaletteCardProps) {
  const colors = palette.patterns ?? []
  const primary = colors.find((p) => p.role === 'PRIMARY')?.color?.hex_code ?? '#6366f1'
  const secondary = colors.find((p) => p.role === 'SECONDARY')?.color?.hex_code ?? '#8b5cf6'
  const bg = colors.find((p) => p.role === 'BACKGROUND')?.color?.hex_code ?? '#09090b'

  return (
    <button
      onClick={onSelect}
      title={palette.name}
      className={[
        'relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all',
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
          : 'border-white/10 bg-zinc-900/50 hover:border-white/20',
      ].join(' ')}
    >
      {/* Color preview */}
      <div
        className="w-full h-12 rounded-lg border border-white/10"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 50%, ${bg} 100%)` }}
      />
      <p className="text-xs font-medium text-zinc-400 truncate w-full text-center">{palette.name}</p>
      {palette.is_premium && (
        <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <SparklesIcon className="size-2.5" />
          PRO
        </span>
      )}
      {isSelected && (
        <CheckCircleIcon className="absolute top-1.5 left-1.5 size-4 text-indigo-400" />
      )}
    </button>
  )
}

// ─── Font Set Card ────────────────────────────────────────────────────────────

function FontSetCard({ fontSet, isSelected, onSelect }: { fontSet: FontSet; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={[
        'relative flex flex-col gap-1 rounded-xl border p-4 text-left transition-all',
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
          : 'border-white/10 bg-zinc-900/50 hover:border-white/20',
      ].join(' ')}
    >
      <p className="text-sm font-semibold text-zinc-200">{fontSet.name}</p>
      {fontSet.patterns?.map((p) => (
        <p key={p.id} className="text-xs text-zinc-600">
          <span className="text-zinc-500">{p.role}:</span> {p.font?.name ?? '—'}
        </p>
      ))}
      {isSelected && (
        <CheckCircleIcon className="absolute top-2 right-2 size-4 text-indigo-400" />
      )}
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
}

export function EventDesignPicker({ eventId }: Props) {
  const [saving, setSaving] = useState(false)

  const { data: config, error: configError } = useSWR<EventConfig>(
    eventId ? `/events/${eventId}/config` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const { data: templates = [] } = useSWR<DesignTemplate[]>(
    '/catalogs/design-templates',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const { data: palettes = [] } = useSWR<ColorPalette[]>(
    '/catalogs/color-palettes',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const { data: fontSets = [] } = useSWR<FontSet[]>(
    '/catalogs/font-sets',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | undefined>(undefined)
  const [selectedFontSetId, setSelectedFontSetId] = useState<string | undefined>(undefined)

  // Initialize from config when loaded
  const [initialized, setInitialized] = useState(false)
  if (config && !initialized) {
    setSelectedTemplateId(config.design_template_id)
    setInitialized(true)
  }

  const hasChanges =
    selectedTemplateId !== config?.design_template_id ||
    selectedPaletteId !== undefined ||
    selectedFontSetId !== undefined

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      if (selectedTemplateId !== config?.design_template_id) {
        payload.design_template_id = selectedTemplateId ?? null
      }
      if (Object.keys(payload).length === 0) {
        toast.info('Sin cambios')
        setSaving(false)
        return
      }
      await api.put(`/events/${eventId}/config`, { ...config, ...payload })
      await mutate(`/events/${eventId}/config`)
      toast.success('Diseño guardado')
    } catch {
      toast.error('Error al guardar el diseño')
    } finally {
      setSaving(false)
    }
  }

  const isLoading = !config && !configError

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-zinc-800 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-zinc-800 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (configError || !config) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        No se pudo cargar la configuración de diseño.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Design Templates */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Plantilla de diseño</p>
              <p className="text-xs text-zinc-500 mt-0.5">Elige la plantilla visual para la página pública.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                isSelected={selectedTemplateId === t.id}
                onSelect={() => setSelectedTemplateId(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Color Palettes */}
      {palettes.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-zinc-200">Paleta de colores</p>
            <p className="text-xs text-zinc-500 mt-0.5">Personaliza los colores de la página.</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {palettes.map((p) => (
              <PaletteCard
                key={p.id}
                palette={p}
                isSelected={selectedPaletteId === p.id}
                onSelect={() => setSelectedPaletteId(selectedPaletteId === p.id ? undefined : p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Font Sets */}
      {fontSets.length > 0 && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-zinc-200">Tipografía</p>
            <p className="text-xs text-zinc-500 mt-0.5">Elige la combinación de fuentes.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fontSets.map((fs) => (
              <FontSetCard
                key={fs.id}
                fontSet={fs}
                isSelected={selectedFontSetId === fs.id}
                onSelect={() => setSelectedFontSetId(selectedFontSetId === fs.id ? undefined : fs.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* No catalogs loaded */}
      {templates.length === 0 && palettes.length === 0 && fontSets.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/30 p-8 text-center">
          <SwatchIcon className="mx-auto size-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">No hay plantillas de diseño disponibles aún.</p>
          <p className="text-xs text-zinc-700 mt-1">Los catálogos de diseño se configuran desde el panel de administración.</p>
        </div>
      )}

      {/* Save button */}
      {(templates.length > 0 || palettes.length > 0 || fontSets.length > 0) && (
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar diseño'}
          </button>
        </div>
      )}
    </div>
  )
}
