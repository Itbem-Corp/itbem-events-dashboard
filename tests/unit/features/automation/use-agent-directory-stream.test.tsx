import { act, renderHook } from '@testing-library/react'
import type { ServerSentEvent } from '@/lib/realtime/server-sent-events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useAuthenticatedSSE: vi.fn(), streamPath: '/automation/agents/stream' }))

vi.mock('@/hooks/useAuthenticatedSSE', () => ({ useAuthenticatedSSE: mocks.useAuthenticatedSSE }))
vi.mock('@/lib/api-paths', () => ({
  automationAgentsStreamPath: (scope?: { client_id?: string | null; project_id?: string | null }) => {
    const query = new URLSearchParams()
    if (scope?.client_id?.trim()) query.set('client_id', scope.client_id.trim())
    if (scope?.project_id?.trim()) query.set('project_id', scope.project_id.trim())
    const suffix = query.toString()
    return `${mocks.streamPath}${suffix ? `?${suffix}` : ''}`
  },
}))

import { parseAgentDirectoryStreamEvent, useAgentDirectoryStream } from '@/features/automation/use-agent-directory-stream'
import { automationAgentsStreamPath } from '@/lib/api-paths'

function rawEvent(event: string, data: unknown): ServerSentEvent {
  return { event, data: JSON.stringify(data) }
}

describe('agent directory stream', () => {
  beforeEach(() => {
    mocks.useAuthenticatedSSE.mockReset().mockReturnValue({ status: 'live' })
    mocks.streamPath = '/automation/agents/stream'
  })

  it('parses only the minimal snapshot/update invalidation contract with an RFC3339Nano timestamp', () => {
    const valid = rawEvent('snapshot', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00.123456789Z' })
    expect(parseAgentDirectoryStreamEvent(valid)).toEqual({ revision: 'rev-1', generated_at: '2026-09-23T18:20:00.123456789Z' })
    expect(parseAgentDirectoryStreamEvent(rawEvent('update', { revision: 'rev-2', generated_at: '2026-09-23T20:20:00-04:00' }))).not.toBeNull()

    expect(parseAgentDirectoryStreamEvent(rawEvent('message', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00Z' }))).toBeNull()
    expect(parseAgentDirectoryStreamEvent(rawEvent('snapshot', { revision: ' ', generated_at: '2026-09-23T18:20:00Z' }))).toBeNull()
    expect(parseAgentDirectoryStreamEvent(rawEvent('update', { revision: 'rev-1', generated_at: '2026-02-30T18:20:00Z' }))).toBeNull()
    expect(parseAgentDirectoryStreamEvent(rawEvent('update', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00.1234567890Z' }))).toBeNull()
    expect(parseAgentDirectoryStreamEvent(rawEvent('snapshot', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00Z', agents: [{ secret: 'never accepted' }] }))).toBeNull()
  })

  it('uses authenticated SSE and emits only the first or changed revision for each event kind', () => {
    const snapshots = vi.fn()
    const updates = vi.fn()
    const { result } = renderHook(() => useAgentDirectoryStream({ onSnapshot: snapshots, onUpdate: updates }))
    const options = mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0] as {
      path: string
      parse: (event: ServerSentEvent) => { revision: string; generated_at: string } | null
      onEvent: (event: { revision: string; generated_at: string }, rawEvent: ServerSentEvent) => void
    }

    expect(options.path).toBe(automationAgentsStreamPath())
    expect(options.path).toBe('/automation/agents/stream')
    expect(result.current).toEqual({ status: 'live' })

    act(() => {
      const snapshot = rawEvent('snapshot', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00Z' })
      options.onEvent(options.parse(snapshot)!, snapshot)
      options.onEvent(options.parse(snapshot)!, snapshot)
      const duplicateUpdate = rawEvent('update', { revision: 'rev-1', generated_at: '2026-09-23T18:20:00Z' })
      options.onEvent(options.parse(duplicateUpdate)!, duplicateUpdate)
      const changedUpdate = rawEvent('update', { revision: 'rev-2', generated_at: '2026-09-23T18:21:00Z' })
      options.onEvent(options.parse(changedUpdate)!, changedUpdate)
    })

    expect(snapshots).toHaveBeenCalledTimes(1)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(updates).toHaveBeenCalledWith({ revision: 'rev-2', generated_at: '2026-09-23T18:21:00Z' })
  })

  it('resets revision deduplication when the stream path changes', () => {
    const snapshots = vi.fn()
    const { rerender } = renderHook(() => useAgentDirectoryStream({ onSnapshot: snapshots }))
    const firstStream = mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0] as {
      parse: (event: ServerSentEvent) => { revision: string; generated_at: string } | null
      onEvent: (event: { revision: string; generated_at: string }, rawEvent: ServerSentEvent) => void
    }
    const snapshot = rawEvent('snapshot', { revision: 'same-revision', generated_at: '2026-09-23T18:20:00Z' })
    act(() => firstStream.onEvent(firstStream.parse(snapshot)!, snapshot))
    expect(snapshots).toHaveBeenCalledTimes(1)

    mocks.streamPath = '/automation/agents/stream?scope=changed'
    rerender()
    const nextStream = mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0] as typeof firstStream
    act(() => nextStream.onEvent(nextStream.parse(snapshot)!, snapshot))

    expect(snapshots).toHaveBeenCalledTimes(2)
  })

  it('rekeys authenticated SSE when the selected client and project change', () => {
    const { rerender } = renderHook(
      ({ client_id, project_id }) => useAgentDirectoryStream({ client_id, project_id }),
      { initialProps: { client_id: 'client-1', project_id: 'project-1' } },
    )

    expect(mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0]).toMatchObject({
      path: '/automation/agents/stream?client_id=client-1&project_id=project-1',
    })

    rerender({ client_id: 'client-2', project_id: '' })
    expect(mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0]).toMatchObject({
      path: '/automation/agents/stream?client_id=client-2',
    })

    rerender({ client_id: '', project_id: '' })
    expect(mocks.useAuthenticatedSSE.mock.calls.at(-1)?.[0]).toMatchObject({
      path: '/automation/agents/stream',
    })
  })
})
