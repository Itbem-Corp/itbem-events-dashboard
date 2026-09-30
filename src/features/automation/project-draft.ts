export type ProjectDraft = { clientId: string; name: string; objective: string }
const lifetime = 24 * 60 * 60 * 1000
export function projectDraftKey(user: string, tenant: string, organization: string) {
  return `delivery-project-draft:v1:${JSON.stringify([user, tenant, organization])}`
}
export function encodeProjectDraft(value: ProjectDraft, now = Date.now()) {
  return JSON.stringify({ version: 1, expires: now + lifetime, value })
}
export function decodeProjectDraft(raw: string | null, now = Date.now()): ProjectDraft | undefined {
  try {
    const parsed = JSON.parse(raw ?? 'null')
    const draft = parsed?.value
    if (parsed?.version !== 1 || !Number.isFinite(parsed.expires) || parsed.expires <= now || parsed.expires > now + lifetime ||
      !draft || typeof draft.clientId !== 'string' || typeof draft.name !== 'string' || typeof draft.objective !== 'string' ||
      draft.clientId.length > 100 || draft.name.length > 180 || draft.objective.length > 12000) return undefined
    return { clientId: draft.clientId, name: draft.name, objective: draft.objective }
  } catch { return undefined }
}
