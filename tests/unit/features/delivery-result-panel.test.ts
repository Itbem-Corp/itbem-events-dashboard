import { privateArtifactObjectURL } from '@/features/automation/delivery-result-panel'
import { automationTaskArtifactPath, automationTaskRunArtifactPath } from '@/lib/api-paths'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('private artifact object URL resolution', () => {
  const taskID = 'task-1'
  const runID = 'd4a4b837-2e18-43af-9f58-6d59629db2bb'
  it.each([undefined, runID])('uses the authenticated task or run-scoped endpoint (%s)', async (run) => {
    mocks.get.mockReset().mockResolvedValue({ data: { status: 200, data: { download_url: 'https://storage.example.test/private' } } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verified-local-object')
    const artifact = { name: 'preview.png', reference: `s3://outputs/automation/${taskID}/${run ? `runs/${run}/` : ''}artifacts/preview.png` }
    expect(await privateArtifactObjectURL(taskID, artifact)).toBe('blob:verified-local-object')
    expect(mocks.get).toHaveBeenCalledWith(run ? automationTaskRunArtifactPath(taskID, run, artifact.name) : automationTaskArtifactPath(taskID, artifact.name))
    expect(fetchMock).toHaveBeenCalledWith('https://storage.example.test/private', { cache: 'no-store', credentials: 'omit' })
    expect(createURL).toHaveBeenCalledWith(expect.any(Blob))
  })
})
