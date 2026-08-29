export type ServerSentEvent = {
  event: string
  data: string
  id?: string
  retry?: number
}

export function parseServerSentEventBlock(block: string): ServerSentEvent | null {
  const fields: Record<string, string[]> = {}

  for (const rawLine of block.replace(/\r/g, '').split('\n')) {
    if (!rawLine || rawLine.startsWith(':')) continue
    const separator = rawLine.indexOf(':')
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator)
    const rawValue = separator === -1 ? '' : rawLine.slice(separator + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue
    if (!field) continue
    fields[field] = [...(fields[field] ?? []), value]
  }

  const data = fields.data?.join('\n')
  if (data === undefined) return null

  const retryValue = fields.retry?.at(-1)
  const retry = retryValue && /^\d+$/.test(retryValue) ? Number(retryValue) : undefined
  return {
    event: fields.event?.at(-1) || 'message',
    data,
    ...(fields.id?.at(-1) ? { id: fields.id.at(-1) } : {}),
    ...(retry === undefined ? {} : { retry }),
  }
}

export async function consumeServerSentEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })

      let boundary = pending.search(/\r?\n\r?\n/)
      while (boundary !== -1) {
        const match = pending.slice(boundary).match(/^\r?\n\r?\n/)
        const block = pending.slice(0, boundary)
        pending = pending.slice(boundary + (match?.[0].length ?? 2))
        const event = parseServerSentEventBlock(block)
        if (event) onEvent(event)
        boundary = pending.search(/\r?\n\r?\n/)
      }
    }

    pending += decoder.decode()
    const trailing = parseServerSentEventBlock(pending)
    if (!signal?.aborted && trailing) onEvent(trailing)
  } finally {
    reader.releaseLock()
  }
}
