import { describe, expect, it } from 'vitest'
import { decodeProjectDraft, encodeProjectDraft, projectDraftKey } from '@/features/automation/project-draft'
describe('project drafts', () => {
  const draft = { name: 'Portal', objective: 'Objetivo', clientId: 'client1' }
  it('roundtrips only the allowed fields', () => expect(decodeProjectDraft(encodeProjectDraft(draft, 1000), 1001)).toEqual(draft))
  it('expires and rejects malformed or future envelopes', () => {
    expect(decodeProjectDraft(encodeProjectDraft(draft, 1000), 86401001)).toBeUndefined()
    expect(decodeProjectDraft('{')).toBeUndefined()
    expect(decodeProjectDraft(encodeProjectDraft(draft, 10000), 1000)).toBeUndefined()
  })
  it('isolates identities and organizations', () => {
    expect(projectDraftKey('u1', 'itbem', 'c1')).not.toEqual(projectDraftKey('u2', 'itbem', 'c1'))
    expect(projectDraftKey('u1', 'itbem', 'c1')).not.toEqual(projectDraftKey('u1', 'itbem', 'c2'))
  })
})
