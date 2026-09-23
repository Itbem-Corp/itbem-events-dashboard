import type { DeliveryChangeSet } from '@/features/automation/delivery-types'

export type RepositoryPreviewCoverage = {
  published: boolean
  preview: boolean
  previewURL?: string
  previewMismatch?: boolean
}

function metadataRecord(value?: DeliveryChangeSet['metadata']) {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function isTrustedLocalReview(change: DeliveryChangeSet | undefined) {
  if (
    !change ||
    change.created_by !== 'itbem-local-agent' ||
    change.review_type !== 'local_worktree' ||
    change.ci_status !== 'passed' ||
    !change.repository_ref ||
    !change.branch
  ) return false
  const metadata = metadataRecord(change.metadata)
  return (
    metadata.verification_source === 'itbem-local-agent' &&
    typeof metadata.automation_task_id === 'string' &&
    metadata.worktree === `${change.repository_ref}#${change.branch}`
  )
}

export function reviewedPreviewMatches(reviewed: DeliveryChangeSet | undefined, published: DeliveryChangeSet | undefined) {
  if (!reviewed || !isTrustedLocalReview(reviewed) || !published || published.branch !== reviewed.branch) return false
  const reviewedMetadata = metadataRecord(reviewed.metadata)
  const publishedMetadata = metadataRecord(published.metadata)
  const reviewedDigest = typeof reviewedMetadata.review_diff_sha256 === 'string' ? reviewedMetadata.review_diff_sha256.trim().toLowerCase() : ''
  const publishedDigest = typeof publishedMetadata.review_diff_sha256 === 'string' ? publishedMetadata.review_diff_sha256.trim().toLowerCase() : ''
  return Boolean(reviewedDigest && publishedDigest && reviewedDigest === publishedDigest)
}

export type RepositoryPreviewGate = {
  ready: boolean
  state: 'ready' | 'missing' | 'ambiguous'
  previewURL?: string
  missingCount: number
  staleCount: number
  urls: string[]
}

/**
 * Mirrors the delivery control-plane rule: every changed repository must have
 * an authorized publication and a valid preview, and the work item must expose
 * one shared integrated preview URL. A single repository preview is not proof
 * that a multirepository delivery is ready for QA.
 */
export function evaluateRepositoryPreviewGate(
  repositories: RepositoryPreviewCoverage[],
): RepositoryPreviewGate {
  const isValidURL = (url?: string) => Boolean(url && /^https?:\/\/\S+$/i.test(url.trim()))
  const urls = repositories
    .map((repository) => repository.previewURL?.trim())
    .filter((url): url is string => Boolean(url))
    .filter(isValidURL)
  const uniqueURLs = Array.from(new Set(urls))
  const missingCount = repositories.filter(
    (repository) => !repository.published || !repository.preview || !isValidURL(repository.previewURL),
  ).length
  const staleCount = repositories.filter((repository) => repository.previewMismatch).length

  if (missingCount > 0) {
    return { ready: false, state: 'missing', missingCount, staleCount, urls: uniqueURLs }
  }
  if (uniqueURLs.length !== 1) {
    return { ready: false, state: 'ambiguous', missingCount: 0, staleCount, urls: uniqueURLs }
  }
  return { ready: true, state: 'ready', previewURL: uniqueURLs[0], missingCount: 0, staleCount, urls: uniqueURLs }
}
