import { BrainCircuit, Braces, Bot, Eye, FileText, Wrench } from 'lucide-react'
import Image from 'next/image'
import clsx from 'clsx'

type ProviderVisualID = 'minimax' | 'deepseek' | 'openrouter' | 'openai' | 'anthropic' | 'opencode-go'

const providerVisuals: Record<ProviderVisualID, { label: string; image?: string; fallback: string; tone: string }> = {
  minimax: { label: 'MiniMax', image: '/providers/minimax.svg', fallback: 'M', tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  deepseek: { label: 'DeepSeek', image: '/providers/deepseek.svg', fallback: 'DS', tone: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  openrouter: { label: 'OpenRouter', image: '/providers/openrouter.svg', fallback: 'OR', tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300' },
  openai: { label: 'OpenAI', fallback: 'AI', tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  anthropic: { label: 'Anthropic', image: '/providers/anthropic.svg', fallback: 'A', tone: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' },
  'opencode-go': { label: 'OpenCode Go', fallback: '<>', tone: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300' },
}

function isProviderVisualID(provider: string): provider is ProviderVisualID {
  return provider in providerVisuals
}

export function ProviderMark({ provider, size = 'md', className }: { provider: string; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const visual = isProviderVisualID(provider) ? providerVisuals[provider] : { label: provider || 'Proveedor', fallback: '?', tone: 'bg-zinc-500/12 text-ink-secondary' }
  const dimensions = size === 'xs' ? 'size-5 rounded-md text-[9px]' : size === 'sm' ? 'size-7 rounded-lg text-[10px]' : 'size-10 rounded-xl text-xs'
  if (visual.image) {
    return <span title={visual.label} aria-label={visual.label} data-slot="avatar" className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white p-1.5 shadow-sm ring-1 ring-black/5 dark:bg-white', dimensions, className)}><Image src={visual.image} alt="" fill sizes={size === 'xs' ? '20px' : size === 'sm' ? '28px' : '40px'} className="object-contain p-1" /></span>
  }
  return <span title={visual.label} aria-label={visual.label} data-slot="avatar" className={clsx('inline-flex shrink-0 items-center justify-center font-bold tracking-tight', visual.tone, dimensions, className)}>{visual.fallback}</span>
}

const publisherVisuals = [
  { match: /(?:claude|anthropic)/, image: '/providers/anthropic.svg', label: 'Anthropic / Claude', fallback: 'C', tone: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' },
  { match: /(?:deepseek)/, image: '/providers/deepseek.svg', label: 'DeepSeek', fallback: 'DS', tone: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  { match: /(?:minimax)/, image: '/providers/minimax.svg', label: 'MiniMax', fallback: 'M', tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  { match: /(?:gemini|google)/, image: '/providers/google.svg', label: 'Google / Gemini', fallback: 'G', tone: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  { match: /(?:llama|meta)/, image: '/providers/meta.svg', label: 'Meta / Llama', fallback: 'L', tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  { match: /(?:grok|xai|x-ai)/, image: '/providers/xai.svg', label: 'xAI / Grok', fallback: 'G', tone: 'bg-zinc-500/12 text-ink-secondary' },
  { match: /(?:qwen|alibaba)/, image: '/providers/alibaba.svg', label: 'Alibaba / Qwen', fallback: 'Q', tone: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' },
  { match: /(?:perplexity)/, image: '/providers/perplexity.svg', label: 'Perplexity', fallback: 'P', tone: 'bg-teal-500/12 text-teal-700 dark:text-teal-300' },
  { match: /(?:nemotron|nvidia)/, image: '/providers/nvidia.svg', label: 'NVIDIA', fallback: 'N', tone: 'bg-lime-500/12 text-lime-700 dark:text-lime-300' },
] as const

export function ModelMark({ provider, model, family, publisher, size = 'sm' }: { provider: string; model: string; family?: string; publisher?: string; size?: 'xs' | 'sm' }) {
  const normalized = `${publisher ?? ''} ${family ?? ''} ${model}`.toLowerCase()
  const visual = publisherVisuals.find((candidate) => candidate.match.test(normalized))
  const label = normalized.includes('claude') ? 'C' : normalized.includes('gpt') ? 'GPT' : normalized.includes('deepseek') ? 'DS' : normalized.includes('minimax') ? 'M' : normalized.includes('kimi') ? 'K' : normalized.includes('qwen') ? 'Q' : normalized.includes('glm') ? 'GLM' : normalized.includes('grok') ? 'G' : normalized.includes('mistral') ? 'MI' : normalized.includes('cohere') ? 'CO' : normalized.includes('phi') ? 'Φ' : visual?.fallback ?? 'AI'
  const tone = visual?.tone ?? (isProviderVisualID(provider) ? providerVisuals[provider].tone : 'bg-zinc-500/12 text-ink-secondary')
  const dimensions = size === 'xs' ? 'size-5 text-[8px]' : 'size-7 text-[9px]'
  if (visual?.image) return <span title={visual.label} aria-label={visual.label} data-slot="avatar" className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 ring-1 ring-black/5', dimensions)}><Image src={visual.image} alt="" fill sizes={size === 'xs' ? '20px' : '28px'} className="object-contain p-1" /></span>
  return <span title={model} aria-label={`Familia ${label}`} data-slot="avatar" className={clsx('inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-tight', tone, dimensions)}>{label}</span>
}

const capabilityIcons = {
  text: FileText,
  image: Eye,
  video: Eye,
  audio: Eye,
  tools: Wrench,
  agent: Bot,
  structured_output: Braces,
  reasoning: BrainCircuit,
  attachments: FileText,
  open_weights: Braces,
  temperature: BrainCircuit,
} as const

export function CapabilityMark({ capability }: { capability: string }) {
  const Icon = capabilityIcons[capability as keyof typeof capabilityIcons] ?? BrainCircuit
  const label = capability.replaceAll('_', ' ')
  return <span title={label} className="inline-flex items-center gap-1 rounded-full bg-surface-interactive px-2 py-1 text-[11px] font-medium text-ink-secondary"><Icon aria-hidden="true" className="size-3" />{label}</span>
}
