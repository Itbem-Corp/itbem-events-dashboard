'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageTransition } from '@/components/ui/page-transition'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { Select } from '@/components/select'
import { CapabilityMark, ModelMark, ProviderMark } from '@/components/automation/provider-visual'
import { ProviderAccountUsagePanel } from '@/features/automation/provider-account-usage-panel'
import { ModelEvaluationPanel } from '@/features/automation/model-evaluation-panel'
import type { ProviderUsageSnapshot } from '@/features/automation/provider-account-usage-panel'
import { api } from '@/lib/api'
import { automationAIActionPoliciesPath, automationAIActionPolicyPath, automationOpenCodeUsageCredentialPath, automationOpenCodeUsagePath, automationProjectProviderCredentialPath, automationProjectProviderUsagePath, automationProjectProviderUsageRefreshPath, automationProviderCatalogPath, automationProviderCredentialPath, automationProviderModelsPath, deliveryProjectsPath } from '@/lib/api-paths'
import { createAccessProfile } from '@/lib/access-profile'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { useStore } from '@/store/useStore'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  KeyIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/20/solid'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const providers = [
  { id: 'minimax', name: 'MiniMax Token Plan', description: 'Ruta inicial aprobada · MiniMax M3', badge: 'Ruta principal' },
  { id: 'deepseek', name: 'DeepSeek Direct', description: 'Facturación directa · API compatible con Chat Completions', badge: 'Conector listo' },
  { id: 'openrouter', name: 'OpenRouter Credits', description: 'Créditos por proveedor/modelo · catálogo con allowlist', badge: 'Conector listo' },
  { id: 'openai', name: 'OpenAI Direct', description: 'Facturación directa · modelos autorizados por política', badge: 'Conector listo' },
  { id: 'anthropic', name: 'Anthropic Direct', description: 'Facturación directa · catálogo de Claude en vivo', badge: 'Conector listo' },
  { id: 'opencode-go', name: 'OpenCode Go', description: 'Límites Go por ventana de 5 h · catálogo en vivo', badge: 'Conector listo' },
] as const

type ProviderID = (typeof providers)[number]['id']
type CredentialState = 'unknown' | 'saving' | 'stored'
type ProviderStates = Record<ProviderID, CredentialState>
type ProviderKeys = Record<ProviderID, string>
type ProjectCredentialStatus = 'stored' | 'not_configured'
type ProjectCredentialViewState = ProjectCredentialStatus | 'loading' | 'error'
type ProjectCredentialMutation = { provider: ProviderID; action: 'save' | 'remove' } | null
type ActionRoute = { provider: ProviderID | ''; model: string; reasoningEnabled: boolean; reasoningEffort: string; reasoning_enabled?: boolean; reasoning_effort?: string }
type ActionPolicy = { operation: string; routes: ActionRoute[]; provider?: ProviderID | ''; model?: string; reasoningEnabled?: boolean; reasoningEffort?: string; reasoning_enabled?: boolean; reasoning_effort?: string; configured: boolean }
type ProviderModelVariant = { id: string; name: string }
type ProviderModelPricingTier = { kind: string; thresholdTokens?: number; inputMicrousdPerMillion?: number; outputMicrousdPerMillion?: number; cachedMicrousdPerMillion?: number; cacheWriteMicrousdPerMillion?: number }
type ProviderModel = { id: string; name: string; description?: string; publisher?: string; family?: string; releaseDate?: string; lastUpdated?: string; knowledgeCutoff?: string; openWeights?: boolean; inputMicrousdPerMillion?: number; outputMicrousdPerMillion?: number; cachedMicrousdPerMillion?: number; cacheWriteMicrousdPerMillion?: number; pricingKnown?: boolean; pricingSource?: string; pricingTiers?: ProviderModelPricingTier[]; inputModalities?: string[]; outputModalities?: string[]; contextWindowTokens?: number; maxOutputTokens?: number; supportedParameters?: string[]; capabilityTags?: string[]; supportsAttachments?: boolean; supportsTools?: boolean; supportsStructuredOutput?: boolean; supportsTemperature?: boolean; gatewayApi?: string; supportsReasoning: boolean; reasoningEfforts?: string[]; variants?: ProviderModelVariant[]; source: 'provider_api' | 'curated' | 'models_dev' | 'official_catalog'; apiFamily?: string; availability?: 'account_verified' | 'public_reference' | 'gateway_incompatible'; supported?: boolean }
type ModelCatalog = Record<ProviderID, ProviderModel[]>
type LoadingStates = Record<ProviderID, boolean>
type ProviderCatalogProfile = { id: ProviderID; name: string; description: string; billing_model?: string; capability_source?: string; pricing_source?: string }
type ProviderCatalogEntry = { profile: ProviderCatalogProfile; models: unknown[]; captured_at?: string; status: 'ready' | 'pending_sync' | 'invalid_snapshot' }
type ProviderCatalogReview = { operation: string; route_index: number; provider: string; model: string; reason: string }
type ProviderCatalogChange = { provider: ProviderID; model: string; kind: 'added' | 'removed' | 'pricing_changed' | 'capabilities_changed' | 'availability_changed' }
type ComparedModel = { provider: ProviderID; model: ProviderModel }
type TokenEstimateInput = { value: number; setValue: (value: number) => void; label: string }

const emptyKeys: ProviderKeys = { minimax: '', deepseek: '', openrouter: '', openai: '', anthropic: '', 'opencode-go': '' }
const emptyStates: ProviderStates = { minimax: 'unknown', deepseek: 'unknown', openrouter: 'unknown', openai: 'unknown', anthropic: 'unknown', 'opencode-go': 'unknown' }
const emptyCatalog: ModelCatalog = { minimax: [], deepseek: [], openrouter: [], openai: [], anthropic: [], 'opencode-go': [] }
const emptyLoadingStates: LoadingStates = { minimax: false, deepseek: false, openrouter: false, openai: false, anthropic: false, 'opencode-go': false }

const actionLabels: Record<string, { title: string; description: string }> = {
  'ai.chat': { title: 'Chat general', description: 'Consultas generales que no pertenecen a un work item de Delivery.' },
  'document.analyze': { title: 'Análisis de documentos', description: 'Lectura y análisis acotado de material proporcionado.' },
  'code.review': { title: 'Revisión de código', description: 'Revisión de pull requests y hallazgos técnicos.' },
  'delivery.chat': { title: 'Conversación operativa', description: 'Respuestas de la automatización y asistencia del trabajo.' },
  'delivery.plan': { title: 'Planeación', description: 'Descomposición y ruta de ejecución.' },
  'delivery.qa': { title: 'QA y validación', description: 'Revisión previa a completar una entrega.' },
  'delivery.summary': { title: 'Resumen', description: 'Síntesis de resultados y trazas.' },
  'delivery.implementation': { title: 'Implementación', description: 'Generación de cambios dentro de un work item.' },
  'product.ideate': { title: 'Ideación de producto', description: 'Alternativas y propuestas de producto.' },
}

const defaultRoute = (): ActionRoute => ({ provider: '', model: '', reasoningEnabled: false, reasoningEffort: '' })

function normalizePolicy(value: unknown): ActionPolicy | null {
  if (!value || typeof value !== 'object') return null
  const policy = value as Partial<ActionPolicy>
  if (!policy.operation) return null
  const routes = Array.isArray(policy.routes) && policy.routes.length > 0
    ? policy.routes.slice(0, 3).map((route) => ({
      provider: route.provider ?? '',
      model: route.model ?? '',
      reasoningEnabled: Boolean(route.reasoning_enabled ?? route.reasoningEnabled),
      reasoningEffort: route.reasoning_effort ?? route.reasoningEffort ?? '',
    }))
    : policy.provider || policy.model
      ? [{ provider: policy.provider ?? '', model: policy.model ?? '', reasoningEnabled: Boolean(policy.reasoning_enabled ?? policy.reasoningEnabled), reasoningEffort: policy.reasoning_effort ?? policy.reasoningEffort ?? '' }]
      : [defaultRoute()]
  return { operation: policy.operation, routes, configured: Boolean(policy.configured) }
}

function normalizeProviderModel(value: unknown): ProviderModel | null {
  if (!value || typeof value !== 'object') return null
  const model = value as Record<string, unknown>
  const id = typeof model.id === 'string' ? model.id : ''
  if (!id) return null
  const number = (snake: string, camel: string) => {
    const candidate = model[snake] ?? model[camel]
    return typeof candidate === 'number' ? candidate : undefined
  }
  const textList = (snake: string, camel: string) => {
    const candidate = model[snake] ?? model[camel]
    return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string') : []
  }
  const apiFamily = model.api_family ?? model.apiFamily
  const availability = model.availability
  const source = model.source === 'curated' || model.source === 'models_dev' || model.source === 'official_catalog' ? model.source : 'provider_api'
  const pricingTierCandidate = model.pricing_tiers ?? model.pricingTiers
  const pricingTiers = Array.isArray(pricingTierCandidate)
    ? pricingTierCandidate.filter((tier): tier is ProviderModelPricingTier => Boolean(tier) && typeof tier === 'object' && typeof (tier as Record<string, unknown>).kind === 'string')
    : []
  return {
    id,
    name: typeof model.name === 'string' ? model.name : id,
    description: typeof model.description === 'string' ? model.description : undefined,
    publisher: typeof model.publisher === 'string' ? model.publisher : undefined,
    family: typeof model.family === 'string' ? model.family : undefined,
    releaseDate: typeof (model.release_date ?? model.releaseDate) === 'string' ? String(model.release_date ?? model.releaseDate) : undefined,
    lastUpdated: typeof (model.last_updated ?? model.lastUpdated) === 'string' ? String(model.last_updated ?? model.lastUpdated) : undefined,
    knowledgeCutoff: typeof (model.knowledge_cutoff ?? model.knowledgeCutoff) === 'string' ? String(model.knowledge_cutoff ?? model.knowledgeCutoff) : undefined,
    openWeights: Boolean(model.open_weights ?? model.openWeights),
    inputMicrousdPerMillion: number('input_microusd_per_million', 'inputMicrousdPerMillion'),
    outputMicrousdPerMillion: number('output_microusd_per_million', 'outputMicrousdPerMillion'),
    cachedMicrousdPerMillion: number('cached_microusd_per_million', 'cachedMicrousdPerMillion'),
    cacheWriteMicrousdPerMillion: number('cache_write_microusd_per_million', 'cacheWriteMicrousdPerMillion'),
    pricingKnown: Boolean(model.pricing_known ?? model.pricingKnown),
    pricingSource: typeof (model.pricing_source ?? model.pricingSource) === 'string' ? String(model.pricing_source ?? model.pricingSource) : undefined,
    pricingTiers,
    inputModalities: textList('input_modalities', 'inputModalities'),
    outputModalities: textList('output_modalities', 'outputModalities'),
    contextWindowTokens: number('context_window_tokens', 'contextWindowTokens'),
    maxOutputTokens: number('max_output_tokens', 'maxOutputTokens'),
    supportedParameters: textList('supported_parameters', 'supportedParameters'),
    capabilityTags: textList('capability_tags', 'capabilityTags'),
    supportsAttachments: Boolean(model.supports_attachments ?? model.supportsAttachments),
    supportsTools: Boolean(model.supports_tools ?? model.supportsTools),
    supportsStructuredOutput: Boolean(model.supports_structured_output ?? model.supportsStructuredOutput),
    supportsTemperature: Boolean(model.supports_temperature ?? model.supportsTemperature),
    gatewayApi: typeof (model.gateway_api ?? model.gatewayApi) === 'string' ? String(model.gateway_api ?? model.gatewayApi) : undefined,
    supportsReasoning: Boolean(model.supports_reasoning ?? model.supportsReasoning),
    reasoningEfforts: textList('reasoning_efforts', 'reasoningEfforts'),
    variants: Array.isArray(model.variants) ? model.variants.filter((variant): variant is ProviderModelVariant => Boolean(variant) && typeof variant === 'object' && typeof (variant as Record<string, unknown>).id === 'string' && typeof (variant as Record<string, unknown>).name === 'string') : [],
    apiFamily: typeof apiFamily === 'string' ? apiFamily : undefined,
    availability: availability === 'account_verified' || availability === 'public_reference' || availability === 'gateway_incompatible' ? availability : undefined,
    supported: typeof model.supported === 'boolean' ? model.supported : true,
    source,
  }
}

function normalizeProviderUsageSnapshot(value: unknown, expectedProjectId: string): ProviderUsageSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as Record<string, unknown>
  if (snapshot.project_id !== expectedProjectId || (snapshot.observed_at !== null && snapshot.observed_at !== undefined && typeof snapshot.observed_at !== 'string') || !Array.isArray(snapshot.accounts)) return null

  const scalar = (candidate: unknown) => typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : ''
  const accounts = snapshot.accounts.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const account = candidate as Record<string, unknown>
    const statuses = ['available', 'not_configured', 'not_supported', 'unavailable', 'error'] as const
    const billingModels = ['token', 'subscription_quota', 'unknown', 'management_api_not_supported'] as const
    const status = statuses.find((item) => item === account.status)
    const billingModel = billingModels.find((item) => item === account.billing_model)
    const credentialScope: ProviderUsageSnapshot['accounts'][number]['credential_scope'] | null = account.credential_scope === 'project' || account.credential_scope === 'missing' || account.credential_scope === 'separate_management_credential_required' ? account.credential_scope : null
    if (typeof account.provider !== 'string' || !account.provider.trim() || !status || !billingModel || !credentialScope) return []

    const rawBalance = account.balance && typeof account.balance === 'object' ? account.balance as Record<string, unknown> : null
    const balance = rawBalance && typeof rawBalance.is_available === 'boolean'
      ? { total: scalar(rawBalance.total), granted: scalar(rawBalance.granted), topped_up: scalar(rawBalance.topped_up), is_available: rawBalance.is_available }
      : undefined
    const windows = Array.isArray(account.windows) ? account.windows.flatMap((candidateWindow) => {
      if (!candidateWindow || typeof candidateWindow !== 'object') return []
      const window = candidateWindow as Record<string, unknown>
      if (typeof window.name !== 'string' || !window.name.trim() || typeof window.unit !== 'string') return []
      return [{ name: window.name, used: scalar(window.used), limit: scalar(window.limit), remaining: scalar(window.remaining), unit: window.unit, ...(typeof window.reset_at === 'string' ? { reset_at: window.reset_at } : {}) }]
    }) : undefined

    return [{
      provider: account.provider,
      status,
      billing_model: billingModel,
      credential_scope: credentialScope,
      ...(typeof account.observed_at === 'string' ? { observed_at: account.observed_at } : {}),
      ...(typeof account.currency === 'string' ? { currency: account.currency } : {}),
      ...(balance ? { balance } : {}),
      ...(windows ? { windows } : {}),
    }]
  })

  return { project_id: expectedProjectId, observed_at: typeof snapshot.observed_at === 'string' ? snapshot.observed_at : '', accounts }
}

function formatPrice(micros?: number) {
  if (typeof micros !== 'number' || micros < 0) return null
  return `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2)} / 1M`
}

function modelPriceSummary(model: ProviderModel) {
  if (!model.pricingKnown) return 'precio no publicado'
  const parts = [
    ['entrada', formatPrice(model.inputMicrousdPerMillion)],
    ['salida', formatPrice(model.outputMicrousdPerMillion)],
    ['cache lectura', formatPrice(model.cachedMicrousdPerMillion)],
    ['cache escritura', formatPrice(model.cacheWriteMicrousdPerMillion)],
  ].filter((part): part is [string, string] => part[1] !== null)
  return parts.map(([label, price]) => `${label} ${price}`).join(' · ')
}

function pricingTierSummary(tier: ProviderModelPricingTier) {
  const parts = [
    ['entrada', formatPrice(tier.inputMicrousdPerMillion)],
    ['salida', formatPrice(tier.outputMicrousdPerMillion)],
    ['cache lectura', formatPrice(tier.cachedMicrousdPerMillion)],
    ['cache escritura', formatPrice(tier.cacheWriteMicrousdPerMillion)],
  ].filter((part): part is [string, string] => part[1] !== null)
  const scope = tier.thresholdTokens ? `${tier.kind || 'tramo'} > ${compactTokenCount(tier.thresholdTokens)}` : tier.kind || 'tramo alterno'
  return `${scope}: ${parts.map(([label, price]) => `${label} ${price}`).join(' · ')}`
}

function compactTokenCount(value?: number) {
  if (!value || value < 1) return ''
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value)
}

function modelCapabilitiesSummary(model: ProviderModel) {
  const parts = [
    model.inputModalities?.length ? `entrada ${model.inputModalities.join('/')}` : '',
    model.outputModalities?.length ? `salida ${model.outputModalities.join('/')}` : '',
    model.contextWindowTokens ? `contexto ${compactTokenCount(model.contextWindowTokens)}` : '',
    model.maxOutputTokens ? `salida máx. ${compactTokenCount(model.maxOutputTokens)}` : '',
    model.supportsReasoning ? 'razonamiento configurable' : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function modelLineageSummary(model: ProviderModel) {
  return [
    model.family ? `familia ${model.family}` : '',
    model.releaseDate ? `lanzado ${model.releaseDate}` : '',
    model.lastUpdated ? `ficha ${model.lastUpdated}` : '',
    model.knowledgeCutoff ? `conocimiento ${model.knowledgeCutoff}` : '',
  ].filter(Boolean).join(' · ')
}

function pricingSourceLabel(source?: string) {
  const labels: Record<string, string> = { provider_api: 'API del proveedor', official_catalog: 'catálogo oficial revisado', official_catalog_peak: 'catálogo oficial · tarifa pico', subscription_quota: 'cuota de suscripción', models_dev_catalog: 'directorio público Models.dev' }
  return source ? labels[source] ?? source : 'no publicado'
}

function availabilityLabel(model: ProviderModel) {
  if (model.availability === 'account_verified') return 'Cuenta verificada'
  if (model.availability === 'public_reference') return 'Referencia pública'
  if (model.availability === 'gateway_incompatible') return 'Gateway incompatible'
  return model.supported === false ? 'No seleccionable' : 'Sin verificar'
}

function modelMatchesCatalogFilter(model: ProviderModel, query: string, filter: string, onlySelectable: boolean) {
  if (onlySelectable && (!model.supported || model.availability !== 'account_verified')) return false
  const normalized = query.trim().toLowerCase()
  const searchText = [model.id, model.name, model.publisher, model.family, model.description, ...(model.capabilityTags ?? [])].filter(Boolean).join(' ').toLowerCase()
  if (normalized && !searchText.includes(normalized)) return false
  if (filter === 'vision') return (model.inputModalities ?? []).some((item) => ['image', 'video', 'audio'].includes(item))
  if (filter === 'tools') return Boolean(model.supportsTools || model.capabilityTags?.includes('tools'))
  if (filter === 'reasoning') return model.supportsReasoning
  if (filter === 'structured') return Boolean(model.supportsStructuredOutput || model.capabilityTags?.includes('structured_output'))
  if (filter === 'low_cost') return Boolean(model.pricingKnown && (model.inputMicrousdPerMillion ?? Number.MAX_SAFE_INTEGER) <= 500_000)
  return true
}

function estimatedModelCost(model: ProviderModel, inputTokens: number, outputTokens: number, cachedReadTokens: number, cacheWriteTokens: number) {
  if (!model.pricingKnown) return null
  const billableInput = Math.max(0, inputTokens - cachedReadTokens - cacheWriteTokens)
  const totalMicros = (billableInput * (model.inputMicrousdPerMillion ?? 0) + outputTokens * (model.outputMicrousdPerMillion ?? 0) + cachedReadTokens * (model.cachedMicrousdPerMillion ?? 0) + cacheWriteTokens * (model.cacheWriteMicrousdPerMillion ?? 0)) / 1_000_000
  return totalMicros / 1_000_000
}

function formatEstimatedCost(value: number | null) {
  if (value === null) return 'Sin tarifa tokenizada'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function catalogChangeLabel(kind: ProviderCatalogChange['kind']) {
  return { added: 'Modelo nuevo', removed: 'Modelo retirado', pricing_changed: 'Precio cambió', capabilities_changed: 'Capacidades cambiaron', availability_changed: 'Disponibilidad cambió' }[kind]
}

function reasoningEffortLabel(effort: string) {
  const labels: Record<string, string> = {
    none: 'Sin esfuerzo adicional',
    minimal: 'Esfuerzo mínimo',
    low: 'Esfuerzo bajo',
    medium: 'Esfuerzo medio',
    high: 'Esfuerzo alto',
    xhigh: 'Esfuerzo muy alto',
    max: 'Esfuerzo máximo',
  }
  return labels[effort] ?? effort
}

function SecurityPoint({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-2 text-sm leading-6 text-ink-secondary"><ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>{children}</span></li>
}

function ListboxVisualRow({ mark, title, detail }: { mark: React.ReactNode; title: string; detail: string }) {
  return <span className="flex min-w-0 flex-1 items-center gap-2.5">
    {mark}
    <span className="min-w-0 flex-1">
      <ListboxLabel className="!ml-0 block truncate font-medium leading-5">{title}</ListboxLabel>
      <span data-slot="option-detail" className="mt-0.5 block truncate text-xs leading-4 text-ink-muted">{detail}</span>
    </span>
  </span>
}

export default function AutomationSettingsPage() {
  const applicationSession = useStore((state) => state.applicationSession)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const currentClient = useStore((state) => state.currentClient)
  const profileLoaded = useStore((state) => state.profileLoaded)
  const access = createAccessProfile(applicationSession, workspaceMode, currentClient?.id)
  const canManage = access.isPlatformContext && access.platformLevel === 'root_1'
  const [apiKeys, setAPIKeys] = useState<ProviderKeys>(emptyKeys)
  const [credentialStates, setCredentialStates] = useState<ProviderStates>(emptyStates)
  const [deliveryProjects, setDeliveryProjects] = useState<DeliveryProject[]>([])
  const [projectsLoadState, setProjectsLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectCredentialStates, setProjectCredentialStates] = useState<Partial<Record<ProviderID, ProjectCredentialViewState>>>({})
  const [projectAPIKeys, setProjectAPIKeys] = useState<ProviderKeys>(emptyKeys)
  const [projectCredentialMutation, setProjectCredentialMutation] = useState<ProjectCredentialMutation>(null)
  const [confirmingProjectCredentialRemoval, setConfirmingProjectCredentialRemoval] = useState<ProviderID | null>(null)
  const [policies, setPolicies] = useState<ActionPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(false)
  const [catalog, setCatalog] = useState<ModelCatalog>(emptyCatalog)
  const [catalogProfiles, setCatalogProfiles] = useState<Partial<Record<ProviderID, ProviderCatalogProfile>>>({})
  const [catalogCapturedAt, setCatalogCapturedAt] = useState<Partial<Record<ProviderID, string>>>({})
  const [catalogReviews, setCatalogReviews] = useState<ProviderCatalogReview[]>([])
  const [catalogChanges, setCatalogChanges] = useState<ProviderCatalogChange[]>([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState('all')
  const [onlySelectable, setOnlySelectable] = useState(false)
  const [comparedModels, setComparedModels] = useState<ComparedModel[]>([])
  const [estimateInputTokens, setEstimateInputTokens] = useState(10_000)
  const [estimateOutputTokens, setEstimateOutputTokens] = useState(2_000)
  const [estimateCachedReadTokens, setEstimateCachedReadTokens] = useState(0)
  const [estimateCacheWriteTokens, setEstimateCacheWriteTokens] = useState(0)
  const tokenEstimateInputs: TokenEstimateInput[] = [
    { value: estimateInputTokens, setValue: setEstimateInputTokens, label: 'Input' },
    { value: estimateOutputTokens, setValue: setEstimateOutputTokens, label: 'Output' },
    { value: estimateCachedReadTokens, setValue: setEstimateCachedReadTokens, label: 'Cache lectura' },
    { value: estimateCacheWriteTokens, setValue: setEstimateCacheWriteTokens, label: 'Cache escritura' },
  ]
  const [catalogSnapshotLoading, setCatalogSnapshotLoading] = useState(false)
  const catalogSnapshotLoadingRef = useRef(false)
  const [catalogLoading, setCatalogLoading] = useState<LoadingStates>(emptyLoadingStates)
  const [savingPolicy, setSavingPolicy] = useState<string | null>(null)
  const [openCodeUsageKey, setOpenCodeUsageKey] = useState('')
  const [openCodeUsage, setOpenCodeUsage] = useState<{ windows?: Array<{ name: string; limit_microusd: number; remaining_microusd: number }> } | null>(null)
  const selectedProjectIdRef = useRef(selectedProjectId)
  selectedProjectIdRef.current = selectedProjectId
  const providerUsageRequestRef = useRef(0)
  const [providerUsageSnapshot, setProviderUsageSnapshot] = useState<ProviderUsageSnapshot | null>(null)
  const [providerUsageLoading, setProviderUsageLoading] = useState(false)
  const [providerUsageRefreshing, setProviderUsageRefreshing] = useState(false)
  const [providerUsageError, setProviderUsageError] = useState(false)

  useEffect(() => {
    if (!canManage) return
    let live = true
    setProjectsLoadState('loading')
    api.get(deliveryProjectsPath())
      .then(({ data }) => {
        const payload = data?.data ?? data
        const rows = Array.isArray(payload) ? payload : payload?.projects
        const safeProjects = Array.isArray(rows)
          ? rows.filter((project): project is DeliveryProject => Boolean(project) && typeof project === 'object' && typeof (project as DeliveryProject).id === 'string' && typeof (project as DeliveryProject).name === 'string')
          : null
        if (!live) return
        if (!safeProjects) {
          setProjectsLoadState('error')
          return
        }
        setDeliveryProjects(safeProjects)
        setSelectedProjectId((current) => safeProjects.some((project) => project.id === current) ? current : safeProjects[0]?.id ?? '')
        setProjectsLoadState('ready')
      })
      .catch(() => { if (live) setProjectsLoadState('error') })
    return () => { live = false }
  }, [canManage])

  useEffect(() => {
    setProjectAPIKeys(emptyKeys)
    setProjectCredentialMutation(null)
    setConfirmingProjectCredentialRemoval(null)
    if (!canManage || !selectedProjectId) {
      setProjectCredentialStates({})
      return
    }

    let live = true
    setProjectCredentialStates(Object.fromEntries(providers.map((provider) => [provider.id, 'loading'])) as Record<ProviderID, ProjectCredentialViewState>)
    for (const provider of providers) {
      api.get(automationProjectProviderCredentialPath(selectedProjectId, provider.id))
        .then(({ data }) => {
          const payload = data?.data ?? data
          if (payload?.project_id !== selectedProjectId || payload?.provider !== provider.id || (payload?.status !== 'stored' && payload?.status !== 'not_configured')) {
            throw new Error('Invalid project credential status response')
          }
          if (live && selectedProjectIdRef.current === selectedProjectId) setProjectCredentialStates((current) => ({ ...current, [provider.id]: payload.status as ProjectCredentialStatus }))
        })
        .catch(() => {
          if (live && selectedProjectIdRef.current === selectedProjectId) setProjectCredentialStates((current) => ({ ...current, [provider.id]: 'error' }))
        })
    }
    return () => { live = false }
  }, [canManage, selectedProjectId])

  useEffect(() => {
    setProviderUsageSnapshot(null)
    setProviderUsageError(false)
    if (!canManage || !selectedProjectId) {
      setProviderUsageLoading(false)
      return
    }

    let live = true
    const requestID = ++providerUsageRequestRef.current
    setProviderUsageLoading(true)
    api.get(automationProjectProviderUsagePath(selectedProjectId))
      .then(({ data }) => {
        const payload = normalizeProviderUsageSnapshot(data?.data ?? data, selectedProjectId)
        if (!payload) throw new Error('Invalid project provider usage response')
        if (live && requestID === providerUsageRequestRef.current && selectedProjectIdRef.current === selectedProjectId) {
          setProviderUsageSnapshot(payload)
        }
      })
      .catch(() => {
        if (live && requestID === providerUsageRequestRef.current && selectedProjectIdRef.current === selectedProjectId) setProviderUsageError(true)
      })
      .finally(() => {
        if (live && requestID === providerUsageRequestRef.current) setProviderUsageLoading(false)
      })
    return () => { live = false }
  }, [canManage, selectedProjectId])

  useEffect(() => {
    if (!canManage) return
    let live = true
    setPoliciesLoading(true)
    api.get(automationAIActionPoliciesPath())
      .then(({ data }) => {
        const values = data?.data ?? data
        if (live) setPolicies(Array.isArray(values) ? values.map(normalizePolicy).filter((value): value is ActionPolicy => value !== null) : [])
      })
      .catch(() => { if (live) toast.error('No se pudieron cargar las rutas de IA.') })
      .finally(() => { if (live) setPoliciesLoading(false) })
    return () => { live = false }
  }, [canManage])

  const loadCatalogSnapshot = useCallback(async () => {
    if (catalogSnapshotLoadingRef.current) return
    catalogSnapshotLoadingRef.current = true
    setCatalogSnapshotLoading(true)
    try {
      const { data } = await api.get(automationProviderCatalogPath())
      const payload = data?.data ?? data
      const entries = Array.isArray(payload?.providers) ? payload.providers as ProviderCatalogEntry[] : []
      const nextCatalog = { ...emptyCatalog }
      const nextProfiles: Partial<Record<ProviderID, ProviderCatalogProfile>> = {}
      const nextCapturedAt: Partial<Record<ProviderID, string>> = {}
      for (const entry of entries) {
        const provider = entry?.profile?.id
        if (!providers.some((item) => item.id === provider)) continue
        nextCatalog[provider] = Array.isArray(entry.models) ? entry.models.map(normalizeProviderModel).filter((model): model is ProviderModel => model !== null) : []
        nextProfiles[provider] = entry.profile
        if (typeof entry.captured_at === 'string') nextCapturedAt[provider] = entry.captured_at
      }
      setCatalog(nextCatalog)
      setCatalogProfiles(nextProfiles)
      setCatalogCapturedAt(nextCapturedAt)
      setCatalogReviews(Array.isArray(payload?.routes_requiring_review) ? payload.routes_requiring_review : [])
      setCatalogChanges(Array.isArray(payload?.changes) ? payload.changes.filter((change: unknown): change is ProviderCatalogChange => Boolean(change) && typeof change === 'object' && providers.some((provider) => provider.id === (change as Record<string, unknown>).provider) && ['added', 'removed', 'pricing_changed', 'capabilities_changed', 'availability_changed'].includes(String((change as Record<string, unknown>).kind)) && typeof (change as Record<string, unknown>).model === 'string') : [])
    } catch {
      toast.error('No se pudo cargar el catálogo auditado de IA.')
    } finally {
      catalogSnapshotLoadingRef.current = false
      setCatalogSnapshotLoading(false)
    }
  }, [])

  useEffect(() => { if (canManage) void loadCatalogSnapshot() }, [canManage, loadCatalogSnapshot])

  const filteredCatalog = useMemo(() => Object.fromEntries(providers.map((provider) => [provider.id, catalog[provider.id].filter((model) => modelMatchesCatalogFilter(model, catalogQuery, catalogFilter, onlySelectable))])) as ModelCatalog, [catalog, catalogFilter, catalogQuery, onlySelectable])

  function toggleComparedModel(provider: ProviderID, model: ProviderModel) {
    const key = `${provider}:${model.id}`
    setComparedModels((current) => {
      if (current.some((item) => `${item.provider}:${item.model.id}` === key)) return current.filter((item) => `${item.provider}:${item.model.id}` !== key)
      if (current.length >= 3) { toast.message('Compara hasta tres modelos a la vez.'); return current }
      return [...current, { provider, model }]
    })
  }

  async function saveCredential(provider: ProviderID, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextKey = apiKeys[provider].trim()
    if (!nextKey || credentialStates[provider] === 'saving') return

    setCredentialStates((current) => ({ ...current, [provider]: 'saving' }))
    try {
      await api.put(automationProviderCredentialPath(provider), { api_key: nextKey })
      setCredentialStates((current) => ({ ...current, [provider]: 'stored' }))
      toast.success(`Credencial ${providers.find((item) => item.id === provider)?.name} guardada. El valor no puede volver a mostrarse.`)
    } catch {
      // Never serialize an Axios request object: it can retain submitted input.
      toast.error('No se pudo guardar la credencial. Confirma que el almacén de credenciales está configurado.')
      setCredentialStates((current) => ({ ...current, [provider]: 'unknown' }))
    } finally {
      setAPIKeys((current) => ({ ...current, [provider]: '' }))
    }
  }

  async function saveProjectCredential(provider: ProviderID, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const projectId = selectedProjectId
    const nextKey = projectAPIKeys[provider].trim()
    if (!projectId || !nextKey || projectCredentialMutation) return

    setProjectCredentialMutation({ provider, action: 'save' })
    try {
      const { data } = await api.put(automationProjectProviderCredentialPath(projectId, provider), { api_key: nextKey })
      const payload = data?.data ?? data
      if (payload?.project_id !== projectId || payload?.provider !== provider || payload?.status !== 'stored') {
        throw new Error('Invalid project credential save response')
      }
      if (selectedProjectIdRef.current === projectId) {
        setProjectCredentialStates((current) => ({ ...current, [provider]: 'stored' }))
        toast.success(`Credencial de ${providers.find((item) => item.id === provider)?.name} guardada para este proyecto.`)
      }
    } catch {
      if (selectedProjectIdRef.current === projectId) toast.error('No se pudo guardar la credencial de este proyecto.')
    } finally {
      if (selectedProjectIdRef.current === projectId) {
        setProjectAPIKeys((current) => ({ ...current, [provider]: '' }))
        setProjectCredentialMutation(null)
      }
    }
  }

  async function removeProjectCredential(provider: ProviderID) {
    const projectId = selectedProjectId
    if (!projectId || projectCredentialStates[provider] !== 'stored' || projectCredentialMutation) return

    setProjectCredentialMutation({ provider, action: 'remove' })
    setConfirmingProjectCredentialRemoval(null)
    try {
      const { data } = await api.delete(automationProjectProviderCredentialPath(projectId, provider))
      const payload = data?.data ?? data
      if (payload?.project_id !== projectId || payload?.provider !== provider || payload?.status !== 'not_configured') {
        throw new Error('Invalid project credential removal response')
      }
      if (selectedProjectIdRef.current === projectId) {
        setProjectCredentialStates((current) => ({ ...current, [provider]: 'not_configured' }))
        toast.success(`Credencial de ${providers.find((item) => item.id === provider)?.name} quitada de este proyecto.`)
      }
    } catch {
      if (selectedProjectIdRef.current === projectId) toast.error('No se pudo quitar la credencial de este proyecto.')
    } finally {
      if (selectedProjectIdRef.current === projectId) setProjectCredentialMutation(null)
    }
  }

  async function refreshProviderUsage() {
    const projectId = selectedProjectId
    if (!projectId || providerUsageRefreshing) return
    const requestID = ++providerUsageRequestRef.current
    setProviderUsageRefreshing(true)
    setProviderUsageError(false)
    try {
      const { data } = await api.post(automationProjectProviderUsageRefreshPath(projectId), {})
      const payload = normalizeProviderUsageSnapshot(data?.data ?? data, projectId)
      if (!payload) throw new Error('Invalid project provider usage response')
      if (requestID === providerUsageRequestRef.current && selectedProjectIdRef.current === projectId) setProviderUsageSnapshot(payload)
    } catch {
      if (requestID === providerUsageRequestRef.current && selectedProjectIdRef.current === projectId) setProviderUsageError(true)
    } finally {
      if (requestID === providerUsageRequestRef.current) setProviderUsageRefreshing(false)
    }
  }

  function updateRoutes(operation: string, change: (routes: ActionRoute[]) => ActionRoute[]) {
    setPolicies((current) => current.map((policy) => policy.operation === operation ? { ...policy, routes: change(policy.routes), configured: true } : policy))
  }

  async function loadModels(provider: ProviderID) {
    if (catalogLoading[provider]) return
    setCatalogLoading((current) => ({ ...current, [provider]: true }))
    try {
      const { data } = await api.get(automationProviderModelsPath(provider))
      const payload = data?.data ?? data
      const models = Array.isArray(payload) ? payload : payload?.models
      const safeModels = Array.isArray(models) ? models.map(normalizeProviderModel).filter((model): model is ProviderModel => model !== null) : []
      setCatalog((current) => ({ ...current, [provider]: safeModels }))
      if (!Array.isArray(payload) && payload?.snapshot?.changed) toast.warning('El catálogo cambió desde la última revisión. Verifica rutas y precios antes de guardar.')
      if (safeModels.length === 0) toast.error('Este proveedor no devolvió modelos disponibles.')
    } catch {
      toast.error('No se pudo cargar el catálogo. Confirma que la credencial esté guardada.')
    } finally {
      setCatalogLoading((current) => ({ ...current, [provider]: false }))
    }
  }

  async function saveOpenCodeUsageCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!openCodeUsageKey.trim()) return
    try {
      await api.put(automationOpenCodeUsageCredentialPath(), { api_key: openCodeUsageKey.trim() })
      setOpenCodeUsageKey('')
      toast.success('Service-account key de OpenCode Console guardada.')
    } catch { toast.error('No se pudo guardar la service-account key de OpenCode Console.') }
  }

  async function loadOpenCodeUsage() {
    try {
      const { data } = await api.get(automationOpenCodeUsagePath())
      setOpenCodeUsage((data?.data ?? data) as typeof openCodeUsage)
    } catch { toast.error('No se pudo consultar la cuota de OpenCode.') }
  }

  async function savePolicy(policy: ActionPolicy) {
    if (policy.routes.length === 0 || policy.routes.some((route) => !route.provider || !route.model) || savingPolicy) return
    setSavingPolicy(policy.operation)
    try {
      const { data } = await api.put(automationAIActionPolicyPath(policy.operation), {
        routes: policy.routes.map((route) => ({
          provider: route.provider,
          model: route.model,
          reasoning_enabled: route.reasoningEnabled,
          reasoning_effort: route.reasoningEnabled ? route.reasoningEffort : '',
        })),
      })
      const saved = data?.data ?? data
      const normalized = normalizePolicy(saved)
      if (normalized) setPolicies((current) => current.map((item) => item.operation === policy.operation ? normalized : item))
      toast.success(`${actionLabels[policy.operation]?.title ?? 'Acción'}: cadena guardada.`)
    } catch {
      toast.error('No se pudo guardar la ruta. El proveedor debe tener una credencial válida.')
    } finally {
      setSavingPolicy(null)
    }
  }

  if (!profileLoaded) return <PageTransition><div className="h-48 animate-pulse rounded-3xl border border-border-subtle bg-surface-raised" /></PageTransition>

  if (!canManage) {
    return <PageTransition><main className="mx-auto max-w-3xl py-6 sm:py-10"><Badge color="zinc"><LockClosedIcon className="size-3" /> Acceso restringido</Badge><Heading className="mt-4">Configuración de IA</Heading><p className="mt-2 text-sm leading-6 text-ink-secondary">Sólo la persona Root 1 en el espacio de plataforma puede administrar credenciales de proveedores.</p></main></PageTransition>
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-5xl pb-20 sm:py-4">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-6">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-(--tenant-accent) uppercase"><KeyIcon className="size-4" /> Automatización</p>
            <Heading className="mt-2">Configuración de IA</Heading>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">Conecta proveedores para el gateway cloud. Los workers locales reciben resultados, nunca las claves.</p>
          </div>
          <Badge color="indigo"><LockClosedIcon className="size-3" /> Root 1 · plataforma</Badge>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,.8fr)]">
          <section className="rounded-3xl border border-border-subtle bg-surface-raised p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Subheading>Proveedores de plataforma</Subheading><Badge color="emerald">Gateway cloud</Badge></div><p className="mt-1.5 text-sm text-ink-secondary">Estas claves globales son para acciones de plataforma sin proyecto. Las inferencias de un proyecto usan sus propias credenciales y no hacen fallback a estas claves.</p></div></div>
            <div className="mt-6 space-y-4">
              {providers.map((provider) => {
                const state = credentialStates[provider.id]
                const storedThisSession = state === 'stored'
                return (
                  <article key={provider.id} className="rounded-2xl border border-border-subtle bg-canvas/45 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><ProviderMark provider={provider.id} /><div><h2 className="text-base font-semibold text-ink">{provider.name}</h2><p className="mt-1 text-sm text-ink-secondary">{provider.description}</p></div></div>{storedThisSession ? <Badge color="emerald"><CheckCircleIcon className="size-3" /> Guardada esta sesión</Badge> : <Badge color={provider.id === 'minimax' ? 'indigo' : 'zinc'}>{provider.badge}</Badge>}</div>
                    <form className="mt-5" onSubmit={(event) => void saveCredential(provider.id, event)}>
                      <Field><Label>Clave de API de inferencia</Label><Description>Se cifra en el almacén del entorno. Después de guardarla, no se puede consultar ni revelar desde el dashboard.</Description><Input type="password" name={`${provider.id}-api-key`} autoComplete="new-password" value={apiKeys[provider.id]} disabled={state === 'saving'} onChange={(event) => setAPIKeys((current) => ({ ...current, [provider.id]: event.target.value }))} placeholder="Pega una clave nueva para guardar o rotar" /></Field>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-ink-muted">No pegues esta clave en un work item, chat, archivo `.env` de un worker ni consola.</p><Button color="indigo" type="submit" disabled={!apiKeys[provider.id].trim() || state === 'saving'}>{state === 'saving' ? <><ArrowPathIcon className="animate-spin" /> Guardando…</> : storedThisSession ? <><ArrowPathIcon /> Rotar clave</> : <><CloudArrowUpIcon /> Guardar clave</>}</Button></div>
                    </form>
                    {provider.id === 'opencode-go' && <div className="mt-5 border-t border-border-subtle pt-5"><form onSubmit={(event) => void saveOpenCodeUsageCredential(event)}><Field><Label>Service-account key de Console (cuota)</Label><Description>Es una key separada de inferencia y sólo sirve para leer la cuota.</Description><Input type="password" value={openCodeUsageKey} onChange={(event) => setOpenCodeUsageKey(event.target.value)} placeholder="oc_sk_…" /></Field><div className="mt-3 flex gap-3"><Button outline type="submit" disabled={!openCodeUsageKey.trim()}>Guardar key de cuota</Button><Button outline type="button" onClick={() => void loadOpenCodeUsage()}>Actualizar cuota</Button></div></form>{openCodeUsage?.windows && <div className="mt-3 space-y-1 text-xs text-ink-muted">{openCodeUsage.windows.map((usageWindow) => <p key={usageWindow.name}>{usageWindow.name}: ${(usageWindow.remaining_microusd / 1_000_000).toFixed(2)} restantes de ${(usageWindow.limit_microusd / 1_000_000).toFixed(2)}</p>)}</div>}</div>}
                  </article>
                )
              })}
            </div>
          </section>

          <aside className="rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6"><div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><LockClosedIcon className="size-5" /></div><Subheading className="mt-4">Límite de confianza</Subheading><ul className="mt-4 space-y-3"><SecurityPoint>La clave queda sólo en el backend cloud o en el bundle de prueba local.</SecurityPoint><SecurityPoint>El gateway valida tarea, lease, proveedor y modelo antes de usarla.</SecurityPoint><SecurityPoint>Workers, navegador, SQS, logs y receipts no reciben la clave.</SecurityPoint></ul><div className="mt-6 rounded-2xl bg-(--tenant-accent)/[0.06] p-4"><p className="text-xs font-semibold tracking-[.12em] text-(--tenant-accent) uppercase">Estado intencional</p><p className="mt-2 text-sm leading-6 text-ink-secondary">Por seguridad no existe una lectura de “clave actual”. Guardar una nueva clave es la forma de rotarla.</p></div></aside>
        </div>

        <section className="mt-6 rounded-3xl border border-border-subtle bg-surface-raised p-5 shadow-sm sm:p-7" aria-labelledby="project-ai-credentials-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2"><Subheading id="project-ai-credentials-title">Credenciales de IA por proyecto</Subheading><Badge color="indigo">Aisladas por proyecto</Badge></div>
              <p className="mt-1.5 text-sm leading-6 text-ink-secondary">Cada proveedor se guarda bajo el proyecto elegido. El estado sólo indica si existe una credencial; el valor guardado nunca se consulta ni se muestra.</p>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">Las credenciales ya quedan separadas por proyecto; la selección de proveedor, modelo y razonamiento sigue siendo global por tipo de operación.</p>
            </div>
            <Badge color="zinc">{projectsLoadState === 'loading' ? 'Cargando proyectos…' : `${deliveryProjects.length} proyecto(s)`}</Badge>
          </div>

          {projectsLoadState === 'error' ? (
            <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">No se pudo cargar el listado de proyectos. No se enviaron ni modificaron credenciales.</p>
          ) : projectsLoadState === 'ready' && deliveryProjects.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-secondary">No hay proyectos disponibles para configurar credenciales.</p>
          ) : (
            <>
              <div className="mt-5 max-w-xl">
                <Field>
                  <Label>Proyecto</Label>
                  <Select value={selectedProjectId} disabled={projectsLoadState !== 'ready' || deliveryProjects.length === 0} onChange={(event) => setSelectedProjectId(event.target.value)}>
                    {deliveryProjects.map((project) => <option key={project.id} value={project.id}>{project.client?.name ? `${project.client.name} · ` : ''}{project.name}</option>)}
                  </Select>
                  <Description>Elige el ámbito donde se guardarán o quitarán las claves. Los permisos también se comprueban en el backend para cada proyecto.</Description>
                </Field>
              </div>
              {selectedProjectId && <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {providers.map((provider) => {
                  const status = projectCredentialStates[provider.id] ?? 'loading'
                  const isSaving = projectCredentialMutation?.provider === provider.id && projectCredentialMutation.action === 'save'
                  const isRemoving = projectCredentialMutation?.provider === provider.id && projectCredentialMutation.action === 'remove'
                  const hasStoredCredential = status === 'stored'
                  return (
                    <article key={provider.id} className="rounded-2xl border border-border-subtle bg-canvas/45 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3"><ProviderMark provider={provider.id} /><div><h3 className="text-base font-semibold text-ink">{provider.name}</h3><p className="mt-1 text-sm text-ink-secondary">{provider.description}</p></div></div>
                        <Badge color={hasStoredCredential ? 'emerald' : status === 'not_configured' ? 'zinc' : status === 'error' ? 'amber' : 'indigo'}>
                          {hasStoredCredential ? <><CheckCircleIcon className="size-3" /> Guardada</> : status === 'not_configured' ? 'No configurada' : status === 'error' ? 'No se pudo verificar' : 'Consultando…'}
                        </Badge>
                      </div>
                      <form className="mt-5" onSubmit={(event) => void saveProjectCredential(provider.id, event)}>
                        <Field><Label>Clave API de proyecto</Label><Description>Se envía sólo al endpoint del proyecto seleccionado y nunca se devuelve desde la API.</Description><Input type="password" name={`project-${provider.id}-api-key`} autoComplete="new-password" value={projectAPIKeys[provider.id]} disabled={projectCredentialMutation !== null} onChange={(event) => setProjectAPIKeys((current) => ({ ...current, [provider.id]: event.target.value }))} placeholder={hasStoredCredential ? 'Pega otra clave para rotarla' : 'Pega una clave para este proyecto'} /></Field>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-ink-muted">Ámbito: {deliveryProjects.find((project) => project.id === selectedProjectId)?.name ?? 'proyecto seleccionado'}.</p><Button color="indigo" type="submit" disabled={!projectAPIKeys[provider.id].trim() || projectCredentialMutation !== null}>{isSaving ? <><ArrowPathIcon className="animate-spin" /> Guardando…</> : hasStoredCredential ? <><ArrowPathIcon /> Guardar y rotar</> : <><CloudArrowUpIcon /> Guardar en proyecto</>}</Button></div>
                      </form>
                      {hasStoredCredential && <div className="mt-3 flex justify-end gap-2">
                        {confirmingProjectCredentialRemoval === provider.id ? <><Button outline type="button" disabled={projectCredentialMutation !== null} onClick={() => setConfirmingProjectCredentialRemoval(null)}>Cancelar</Button><Button outline type="button" disabled={projectCredentialMutation !== null} onClick={() => void removeProjectCredential(provider.id)}>{isRemoving ? <><ArrowPathIcon className="animate-spin" /> Quitando…</> : 'Confirmar quitar'}</Button></> : <Button outline type="button" disabled={projectCredentialMutation !== null} onClick={() => setConfirmingProjectCredentialRemoval(provider.id)}>Quitar credencial del proyecto</Button>}
                      </div>}
                    </article>
                  )
                })}
              </div>}
              {selectedProjectId && <ProviderAccountUsagePanel
                projectId={selectedProjectId}
                snapshot={providerUsageSnapshot}
                loading={providerUsageLoading}
                refreshing={providerUsageRefreshing}
                error={providerUsageError}
                onRefresh={() => void refreshProviderUsage()}
              />}
            </>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-border-subtle bg-surface-raised p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl"><div className="flex items-center gap-2"><Subheading>Catálogo de modelos y capacidades</Subheading><Badge color="indigo">Auditado</Badge></div><p className="mt-1.5 text-sm leading-6 text-ink-secondary">Cada ficha separa lo que publica el proveedor de lo que el gateway puede ejecutar. Los precios son USD por millón de tokens; cache lectura/escritura sólo aparece cuando el provider lo publica.</p></div>
            <Button outline type="button" disabled={catalogSnapshotLoading} onClick={() => void loadCatalogSnapshot()}>{catalogSnapshotLoading ? <><ArrowPathIcon className="animate-spin" /> Cargando…</> : <><ArrowPathIcon /> Actualizar vista</>}</Button>
          </div>
          {catalogReviews.length > 0 && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">{catalogReviews.length} ruta(s) requieren revisión</p>{catalogReviews.slice(0, 12).map((review) => <p key={`${review.operation}-${review.route_index}-${review.provider}-${review.model}`} className="mt-1">{actionLabels[review.operation]?.title ?? review.operation} · {review.provider}/{review.model}: {review.reason.replaceAll('_', ' ')}.</p>)}</div>}
          <div className="mt-5 grid gap-3 rounded-2xl border border-border-subtle bg-canvas/45 p-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
            <Field><Label>Buscar modelo o editor</Label><Input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Ej. Claude, Qwen, visión, OpenAI…" /></Field>
            <Field><Label>Filtrar por</Label><Select value={catalogFilter} onChange={(event) => setCatalogFilter(event.target.value)}><option value="all">Todas las capacidades</option><option value="vision">Visión o multimedia</option><option value="tools">Tools / agentes</option><option value="reasoning">Razonamiento</option><option value="structured">Salida estructurada</option><option value="low_cost">Entrada ≤ $0.50 / 1M</option></Select></Field>
            <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={onlySelectable} onChange={(event) => setOnlySelectable(event.target.checked)} /> Sólo verificables</label>
          </div>
          {catalogChanges.length > 0 && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4"><p className="text-sm font-semibold text-sky-950">Cambios desde la sincronización anterior</p><div className="mt-2 flex flex-wrap gap-2">{catalogChanges.slice(0, 12).map((change) => <span key={`${change.provider}-${change.model}-${change.kind}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-sky-900 ring-1 ring-sky-200"><span className="font-medium">{catalogProfiles[change.provider]?.name ?? change.provider}</span> · {change.model} · {catalogChangeLabel(change.kind)}</span>)}</div></div>}
          <section className="mt-4 rounded-2xl border border-border-subtle bg-canvas/45 p-4" aria-labelledby="cost-comparator-title">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p id="cost-comparator-title" className="text-sm font-semibold text-ink">Comparador de costo por solicitud</p><p className="mt-1 text-xs leading-5 text-ink-muted">Elige hasta tres modelos desde sus fichas. Es una estimación con tarifas publicadas; el ledger usa su catálogo inmutable configurado.</p></div><Badge color="zinc">{comparedModels.length}/3 modelos</Badge></div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tokenEstimateInputs.map(({ value, setValue, label }) => (
                <Field key={label}>
                  <Label>{label}</Label>
                  <Input type="number" min="0" value={String(value)} onChange={(event) => setValue(Math.max(0, Number(event.target.value) || 0))} />
                </Field>
              ))}
            </div>
            {comparedModels.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-3">{comparedModels.map(({ provider, model }) => <div key={`${provider}:${model.id}`} className="rounded-xl border border-border-subtle bg-surface-raised p-3"><div className="flex items-center gap-2"><ModelMark provider={provider} model={model.id} family={model.family} publisher={model.publisher} size="xs" /><p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{model.name}</p><Button plain type="button" onClick={() => toggleComparedModel(provider, model)}>Quitar</Button></div><p className="mt-2 text-lg font-semibold text-ink">{formatEstimatedCost(estimatedModelCost(model, estimateInputTokens, estimateOutputTokens, estimateCachedReadTokens, estimateCacheWriteTokens))}</p><p className="text-xs text-ink-muted">{modelPriceSummary(model)}</p></div>)}</div> : <p className="mt-4 text-sm text-ink-secondary">Activa “Comparar” en una ficha para empezar.</p>}
          </section>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {providers.map((provider) => {
              const profile = catalogProfiles[provider.id]
              const catalogModels = catalog[provider.id]
              const models = filteredCatalog[provider.id]
              const capturedAt = catalogCapturedAt[provider.id]
              return <article key={provider.id} className="rounded-2xl border border-border-subtle bg-canvas/45 p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><ProviderMark provider={provider.id} /><div><h2 className="font-semibold text-ink">{profile?.name ?? provider.name}</h2><p className="mt-1 text-sm leading-5 text-ink-secondary">{profile?.description ?? provider.description}</p></div></div><Badge color={catalogModels.length ? 'emerald' : 'zinc'}>{catalogModels.length ? `${models.length}/${catalogModels.length} modelos` : 'Pendiente'}</Badge></div><p className="mt-3 text-xs text-ink-muted">Facturación: {pricingSourceLabel(profile?.pricing_source)} · Capacidades: {profile?.capability_source?.replaceAll('_', ' ') ?? 'pendiente'}{capturedAt ? ` · actualizado ${new Date(capturedAt).toLocaleString()}` : ''}</p><details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-(--tenant-accent)">{catalogModels.length ? `Ver ${models.length} modelo(s) filtrado(s)` : 'Se poblará en la siguiente sincronización o al cargar modelos'}</summary><div className="mt-4 max-h-[32rem] space-y-3 overflow-auto pr-1">{models.map((model) => <div key={model.id} className="rounded-xl border border-border-subtle bg-surface-raised p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><ModelMark provider={provider.id} model={model.id} family={model.family} publisher={model.publisher} /><div><p className="font-medium text-ink">{model.name}</p><p className="text-xs text-ink-muted">{model.id} · gateway: {model.gatewayApi ?? 'no declarado'}</p></div></div><Badge color={model.availability === 'account_verified' && model.supported !== false ? 'emerald' : 'zinc'}>{availabilityLabel(model)}</Badge></div>{model.description && <p className="mt-2 text-xs leading-5 text-ink-secondary">{model.description}</p>}<p className="mt-2 text-xs text-ink-secondary">{modelPriceSummary(model)} · {pricingSourceLabel(model.pricingSource)}</p>{model.pricingTiers?.map((tier, index) => <p key={`${tier.kind}-${tier.thresholdTokens ?? index}`} className="mt-1 text-xs text-ink-muted">Precio alterno · {pricingTierSummary(tier)}</p>)}{modelCapabilitiesSummary(model) && <p className="mt-1 text-xs text-ink-secondary">{modelCapabilitiesSummary(model)}</p>}{modelLineageSummary(model) && <p className="mt-1 text-xs text-ink-muted">{modelLineageSummary(model)}</p>}{model.capabilityTags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{model.capabilityTags.map((capability) => <CapabilityMark key={capability} capability={capability} />)}</div> : null}{model.supportedParameters?.length ? <p className="mt-2 text-xs text-ink-muted">Parámetros publicados: {model.supportedParameters.join(', ')}</p> : null}<div className="mt-3 flex justify-end"><Button outline type="button" onClick={() => toggleComparedModel(provider.id, model)}>{comparedModels.some((item) => item.provider === provider.id && item.model.id === model.id) ? 'Quitar de comparación' : 'Comparar'}</Button></div></div>)}{catalogModels.length > 0 && models.length === 0 && <p className="rounded-xl border border-dashed border-border-subtle p-3 text-sm text-ink-secondary">Ningún modelo coincide con los filtros actuales.</p>}</div></details></article>
            })}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-border-subtle bg-surface-raised p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2"><Subheading>Cadena de rutas por acción</Subheading><Badge color="indigo">Política aplicada por gateway</Badge></div>
              <p className="mt-1.5 text-sm leading-6 text-ink-secondary">Define una ruta principal y hasta dos fallbacks, cada uno con su proveedor y modelo. El gateway sólo avanza ante un rechazo temporal explícito (408, 429 o 5xx); una acción sin ruta se bloquea.</p>
            </div>
            <Badge color="zinc">{policiesLoading ? 'Cargando…' : `${policies.filter((policy) => policy.configured && policy.routes.every((route) => route.provider && route.model)).length} configuradas`}</Badge>
          </div>

          <div className="mt-6 space-y-4">
            {policies.map((policy) => {
              const meta = actionLabels[policy.operation] ?? { title: policy.operation, description: 'Acción de automatización.' }
              return (
                <article key={policy.operation} className="rounded-2xl border border-border-subtle bg-canvas/45 p-4 sm:p-5">
                   <div className="flex flex-wrap items-start justify-between gap-3">
                     <div><h2 className="text-base font-semibold text-ink">{meta.title}</h2><p className="mt-1 text-sm text-ink-secondary">{meta.description}</p></div>
                     {policy.configured && policy.routes.every((route) => route.provider && route.model) ? <Badge color="emerald"><CheckCircleIcon className="size-3" /> Configurada</Badge> : <Badge color="zinc">Pendiente</Badge>}
                   </div>
                   <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised/70 p-3" aria-label={`Cadena de fallback para ${meta.title}`}>
                     {policy.routes.map((route, routeIndex) => {
                       const model = route.provider ? catalog[route.provider]?.find((item) => route.model === item.id || route.model.startsWith(item.id + '#')) : undefined
                       const label = routeIndex === 0 ? 'Principal' : routeIndex === 1 ? 'Fallback 1' : 'Fallback 2'
                       return <div key={`${route.provider}-${route.model}-${routeIndex}`} className="flex min-w-0 items-center gap-2"><div className="flex min-w-0 items-center gap-2 rounded-lg bg-canvas px-2.5 py-2"><ProviderMark provider={route.provider || 'minimax'} size="xs" /><span className="min-w-0"><span className="block text-[10px] font-semibold tracking-[.08em] text-ink-muted uppercase">{label}</span><span className="block max-w-44 truncate text-xs font-medium text-ink">{(model?.name ?? route.model) || 'Sin modelo'}</span></span></div>{routeIndex < policy.routes.length - 1 && <span aria-hidden="true" className="text-ink-muted">→</span>}</div>
                     })}
                   </div>
                   <div className="mt-5 space-y-4">
                    {policy.routes.map((route, routeIndex) => {
                      const activeProvider = route.provider || 'minimax'
                      const models = catalog[activeProvider] ?? []
                      const visibleModels = route.model && !models.some((model) => model.id === route.model) ? [{ id: route.model, name: route.model, supportsReasoning: route.provider === 'deepseek', reasoningEfforts: route.provider === 'deepseek' ? ['low', 'high', 'max'] : [], source: 'curated' as const, supported: true, pricingKnown: false }, ...models] : models
                      const modelOptions = visibleModels.flatMap((model) => [{ id: model.id, name: model.name, model }, ...(model.variants ?? []).map((variant) => ({ id: model.id + '#' + variant.id, name: model.name + ' · ' + variant.name, model }))])
                      const selectedModel = visibleModels.find((model) => route.model === model.id || route.model.startsWith(model.id + '#'))
                      const reasoningEfforts = selectedModel?.reasoningEfforts ?? []
                      const canConfigureReasoning = selectedModel?.supportsReasoning && reasoningEfforts.length > 0
                      const routeLabel = routeIndex === 0 ? 'Ruta principal' : routeIndex === 1 ? 'Fallback' : 'Último fallback'
                      return <div key={routeIndex} className="rounded-xl border border-border-subtle bg-surface-raised/50 p-4">
                        <div className="flex items-center justify-between gap-3"><Badge color={routeIndex === 0 ? 'indigo' : 'zinc'}>{routeLabel}</Badge>{routeIndex > 0 && <Button plain type="button" onClick={() => updateRoutes(policy.operation, (routes) => routes.filter((_, index) => index !== routeIndex))}>Quitar</Button>}</div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(12rem,.85fr)_minmax(16rem,1.2fr)_auto] lg:items-end">
                          <Field><Label>Proveedor autenticado</Label><Listbox value={route.provider || undefined} placeholder="Selecciona proveedor" onChange={(provider: ProviderID) => updateRoutes(policy.operation, (routes) => routes.map((item, index) => index === routeIndex ? { provider, model: provider === 'deepseek' ? 'deepseek-flash' : provider === 'minimax' ? 'MiniMax-M3' : '', reasoningEnabled: false, reasoningEffort: '' } : item))}>{providers.map((provider) => <ListboxOption key={provider.id} value={provider.id}><ListboxVisualRow mark={<ProviderMark provider={provider.id} size="xs" />} title={provider.name} detail={provider.description} /></ListboxOption>)}</Listbox></Field>
                          <Field><Label>Modelo</Label><Listbox value={route.model} disabled={!route.provider || visibleModels.length === 0} placeholder={route.provider ? 'Carga o selecciona un modelo' : 'Primero elige proveedor'} onChange={(model: string) => updateRoutes(policy.operation, (routes) => routes.map((item, index) => index === routeIndex ? { ...item, model, reasoningEnabled: false, reasoningEffort: '' } : item))}>{modelOptions.map((option) => <ListboxOption key={option.id} value={option.id} disabled={option.model.supported === false}><ListboxVisualRow mark={<ModelMark provider={activeProvider} model={option.id} family={option.model.family} publisher={option.model.publisher} size="xs" />} title={option.name} detail={`${modelPriceSummary(option.model)}${option.model.supported === false ? ' · no seleccionable' : ''}`} /></ListboxOption>)}</Listbox></Field>
                          <Button outline type="button" disabled={!route.provider || catalogLoading[activeProvider]} onClick={() => route.provider && void loadModels(route.provider)}>{catalogLoading[activeProvider] ? <><ArrowPathIcon className="animate-spin" /> Consultando…</> : <><ArrowPathIcon /> Cargar modelos</>}</Button>
                        </div>
                        {route.provider === 'openrouter' && models.length > 0 && <p className="mt-2 text-xs leading-5 text-ink-muted">Catálogo live de OpenRouter, ordenado por precio de entrada. Se deshabilitan modelos que el proveedor declara incompatibles con chat de texto.</p>}
                        {route.provider === 'deepseek' && <p className="mt-2 text-xs leading-5 text-ink-muted">Catálogo live de DeepSeek. La tarifa mostrada es la tarifa pico por millón para reservar presupuesto de forma conservadora; su factura puede ser menor en horario valle.</p>}
                        {route.provider === 'opencode-go' && <p className="mt-2 text-xs leading-5 text-ink-muted">El catálogo se consulta en vivo desde OpenCode Go. Es una cuota de suscripción, no una tarifa USD por token; sus límites por 5 h se ven en OpenCode Console.</p>}
                        {selectedModel && modelCapabilitiesSummary(selectedModel) && <p className="mt-2 text-xs leading-5 text-ink-muted">Capacidades publicadas: {modelCapabilitiesSummary(selectedModel)}.</p>}
                        {route.provider !== 'opencode-go' && selectedModel && !selectedModel.pricingKnown && <p className="mt-2 text-xs leading-5 text-amber-700">Este modelo no publicó tarifa tokenizada en el catálogo. Para registrar y limitar gasto exacto, añade una entrada de este proveedor:model a <code>AUTOMATION_PRICING_JSON</code>.</p>}
                        {selectedModel?.source === 'curated' && <p className="mt-2 text-xs leading-5 text-ink-muted">Catálogo verificado por el backend para este proveedor.</p>}
                        {selectedModel?.source === 'models_dev' && <p className="mt-2 text-xs leading-5 text-ink-muted">Ficha pública de Models.dev; guarda la credencial y recarga modelos para confirmar que esta cuenta lo tiene disponible.</p>}
                        <div className="mt-4 border-t border-border-subtle pt-4">
                          {canConfigureReasoning ? <div className="flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm text-ink"><input type="checkbox" checked={route.reasoningEnabled} onChange={(event) => updateRoutes(policy.operation, (routes) => routes.map((item, index) => index === routeIndex ? { ...item, reasoningEnabled: event.target.checked, reasoningEffort: event.target.checked ? (reasoningEfforts.includes(item.reasoningEffort) ? item.reasoningEffort : reasoningEfforts[0]) : '' } : item))} /> Razonamiento del modelo</label>{route.reasoningEnabled && <Select className="min-w-36" value={reasoningEfforts.includes(route.reasoningEffort) ? route.reasoningEffort : reasoningEfforts[0]} onChange={(event) => updateRoutes(policy.operation, (routes) => routes.map((item, index) => index === routeIndex ? { ...item, reasoningEffort: event.target.value } : item))}>{reasoningEfforts.map((effort) => <option key={effort} value={effort}>{reasoningEffortLabel(effort)}</option>)}</Select>}</div> : <p className="text-xs leading-5 text-ink-muted">{route.provider === 'minimax' ? 'MiniMax M3 usa el razonamiento administrado por el proveedor.' : route.provider ? 'Este proveedor/modelo no publica un control de razonamiento compatible para el gateway.' : 'Selecciona primero un proveedor y modelo.'}</p>}
                        </div>
                      </div>
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle pt-4">
                    <div>{policy.routes.length < 3 ? <Button outline type="button" onClick={() => updateRoutes(policy.operation, (routes) => [...routes, defaultRoute()])}>Agregar fallback</Button> : <p className="text-xs text-ink-muted">Máximo de tres rutas por acción.</p>}</div>
                    <Button color="indigo" type="button" disabled={policy.routes.some((route) => !route.provider || !route.model) || savingPolicy === policy.operation} onClick={() => void savePolicy(policy)}>{savingPolicy === policy.operation ? <><ArrowPathIcon className="animate-spin" /> Guardando…</> : <><CheckCircleIcon /> Guardar cadena</>}</Button>
                  </div>
                </article>
              )
            })}
            {!policiesLoading && policies.length === 0 && <p className="rounded-2xl border border-dashed border-border-subtle p-5 text-sm text-ink-secondary">No se encontraron acciones configurables. Recarga la página cuando el backend actualizado esté disponible.</p>}
          </div>
        </section>
        <ModelEvaluationPanel />
      </main>
    </PageTransition>
  )
}
