import { consumeServerSentEvents, parseServerSentEventBlock } from '@/lib/realtime/server-sent-events'
import { describe, expect, it } from 'vitest'

const encoder = new TextEncoder()

describe('server-sent events', () => {
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
