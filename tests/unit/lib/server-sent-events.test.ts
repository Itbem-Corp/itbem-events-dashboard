import { consumeServerSentEvents, parseServerSentEventBlock } from '@/lib/realtime/server-sent-events'
import { describe, expect, it, vi } from 'vitest'

const encoder = new TextEncoder()

describe('server-sent events', () => {
  it('cancels a silent pending reader when the watchdog aborts', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const consume = consumeServerSentEvents(stream, vi.fn(), controller.signal)
    controller.abort()
    await consume
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('counts keepalives as transport activity without inventing events', async () => {
    const onEvent = vi.fn()
    const onActivity = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encoder.encode(': heartbeat\n\n')); c.close() } })
    await consumeServerSentEvents(stream, onEvent, undefined, onActivity)
    expect(onActivity).toHaveBeenCalledOnce()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('rejects an unbounded incomplete frame and releases the reader', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encoder.encode('data: '+ 'x'.repeat(256 * 1024))); c.close() } })
    await expect(consumeServerSentEvents(stream, vi.fn())).rejects.toThrow('safety limit')
    expect(stream.locked).toBe(false)
  })
  it('parses an event frame with an id, retry directive, and multiline data', () => {
    expect(parseServerSentEventBlock('event: update\nid: revision-4\nretry: 2000\ndata: {"state":"running"}\ndata: {"active":1}')).toEqual({
      event: 'update',
      id: 'revision-4',
      retry: 2000,
      data: '{"state":"running"}\n{"active":1}',
    })
  })

  it('ignores SSE comments and does not invent an event from a keepalive', () => {
    expect(parseServerSentEventBlock(': keepalive')).toBeNull()
  })

  it('reassembles frames split across streamed byte chunks', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: snapshot\nid: one\ndata: {"state":"planning"}'))
        controller.enqueue(encoder.encode('\n\nevent: update\nid: two\ndata: {"state":"qa"}\n\n'))
        controller.close()
      },
    })
    const received: string[] = []

    await consumeServerSentEvents(stream, (event) => received.push(`${event.event}:${event.id}:${event.data}`))

    expect(received).toEqual([
      'snapshot:one:{"state":"planning"}',
      'update:two:{"state":"qa"}',
    ])
  })
})
