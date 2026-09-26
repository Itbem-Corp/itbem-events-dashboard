import { describe, expect, it } from 'vitest'
import { canQueryAutomationDispatchQueue } from './dispatch-queue'

describe('canQueryAutomationDispatchQueue', () => {
  it('keeps the platform-wide queue available to platform operators', () => {
    expect(canQueryAutomationDispatchQueue('platform', '', [], true)).toBe(true)
  })

  it('does not query an organization queue until its project list and selection are ready', () => {
    expect(canQueryAutomationDispatchQueue('organization', '', ['project-a'], true)).toBe(false)
    expect(canQueryAutomationDispatchQueue('organization', 'project-a', [], false)).toBe(false)
  })

  it('requires the selected project to come from the authorized project list', () => {
    expect(canQueryAutomationDispatchQueue('organization', 'project-outside-scope', ['project-a'], true)).toBe(false)
    expect(canQueryAutomationDispatchQueue('organization', 'project-a', ['project-a'], true)).toBe(true)
  })
})
