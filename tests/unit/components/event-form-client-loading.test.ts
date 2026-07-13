import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/components/events/forms/event-form-modal.tsx'),
  'utf8'
)

describe('EventFormModal organization loading', () => {
  it('uses bounded remote organization search for root users', () => {
    expect(source).toContain('useDebounce(clientSearch, 200)')
    expect(source).toContain('clientsPagePath({ page: 1, page_size: 25, search: debouncedClientSearch })')
    expect(source).toContain('remoteFiltering')
    expect(source).not.toContain('clientsPath()')
  })

  it('keeps the assigned organization available while editing', () => {
    expect(source).toContain('const fallbackClient = event?.client ?? currentClient')
    expect(source).toContain('fallbackClient?.id === field.value')
  })
})
