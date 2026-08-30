import { deliveryPortfolioRefreshInterval, normalizeDeliveryPortfolio } from '@/features/automation/delivery-portfolio'
import { describe, expect, it } from 'vitest'

function portfolio(reviewOverrides: Record<string, unknown> = {}) {
  return {
    schema_version: 3,
    generated_at: '2026-08-30T23:00:00Z',
    revision: 'a'.repeat(64),
    totals: {
      projects: 0,
      work_items: 0,
      active_work_items: 0,
      decisions_required: 0,
      blocked_work_items: 0,
      automation_tasks: 0,
      queued_tasks: 0,
      running_tasks: 0,
      attention_tasks: 0,
      review_tasks: 1,
      queued_reviews: 0,
      running_reviews: 0,
      attention_reviews: 0,
      published_reviews: 1,
    },
    projects: [],
    review_queue: [
      {
        task_id: '11111111-1111-4111-8111-111111111111',
        repository: 'itbem/example',
        pull_request: 42,
        head_sha: 'b'.repeat(40),
        status: 'completed',
        attempt_count: 1,
        verdict: 'approve',
        event: 'APPROVE',
        review_url: 'https://github.com/itbem/example/pull/42#pullrequestreview-77',
        reviewer_actor: 'bema-review-bot[bot]',
        created_at: '2026-08-30T22:58:00Z',
        updated_at: '2026-08-30T22:59:00Z',
        completed_at: '2026-08-30T22:59:00Z',
        published_at: '2026-08-30T22:59:00Z',
        ...reviewOverrides,
      },
    ],
  }
}

describe('delivery portfolio review queue', () => {
  it('keeps schema-v2 snapshots usable during a rolling deployment', () => {
    const legacy = portfolio()
    legacy.schema_version = 2
    delete (legacy as { review_queue?: unknown }).review_queue

    expect(normalizeDeliveryPortfolio(legacy)?.reviewQueue).toEqual([])
  })

  it('normalizes exact-SHA public review evidence without private task fields', () => {
    const snapshot = normalizeDeliveryPortfolio(portfolio())
    expect(snapshot?.reviewQueue).toEqual([
      expect.objectContaining({
        repository: 'itbem/example',
        pullRequest: 42,
        headSha: 'b'.repeat(40),
        verdict: 'approve',
        event: 'APPROVE',
        reviewerActor: 'bema-review-bot[bot]',
      }),
    ])
    expect(snapshot?.totals.publishedReviews).toBe(1)
    expect(JSON.stringify(snapshot)).not.toMatch(/input_ref|output_ref|error_message|installation_id|patch_sha256/)
  })

  it.each([
    ['cross-origin URL', { review_url: 'https://attacker.example/itbem/example/pull/42#pullrequestreview-77' }],
    ['wrong PR URL', { review_url: 'https://github.com/itbem/example/pull/43#pullrequestreview-77' }],
    ['wrong event', { event: 'REQUEST_CHANGES' }],
    ['unsafe repository', { repository: '../private' }],
    ['mutable head', { head_sha: 'main' }],
  ])('drops a review with %s', (_name, overrides) => {
    expect(normalizeDeliveryPortfolio(portfolio(overrides))?.reviewQueue).toEqual([])
  })

  it('uses the active review queue to tighten refresh cadence', () => {
    const snapshot = normalizeDeliveryPortfolio(portfolio())!
    snapshot.totals.runningReviews = 1
    expect(deliveryPortfolioRefreshInterval(snapshot)).toBe(6_000)
    snapshot.totals.runningReviews = 0
    snapshot.totals.queuedReviews = 1
    expect(deliveryPortfolioRefreshInterval(snapshot)).toBe(12_000)
  })
})
