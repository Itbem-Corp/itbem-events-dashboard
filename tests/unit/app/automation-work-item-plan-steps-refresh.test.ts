import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/automation/work-items/[workItemId]/page.tsx'), 'utf8')
const projectSource = readFileSync(
  resolve(process.cwd(), 'src/app/(app)/automation/projects/[projectId]/page.tsx'),
  'utf8'
)

describe('approved plan steps revalidation', () => {
  it('selects the highest approved plan and revalidates its current steps key on stream snapshots and updates', () => {
    expect(source).toContain('const approvedPlan = [...(item?.plans ?? [])]')
    expect(source).toContain(".filter((plan) => plan.status === 'approved')")
    expect(source).toContain('.sort((left, right) => right.version - left.version)[0]')
    expect(source).toContain('const approvedPlanStepsKey = deliveryPlanStepsPathForValidPlanID(approvedPlan?.id)')
    expect(source).toMatch(
      /onSnapshot:\s*\(\)\s*=>\s*\{[\s\S]*?revalidateApprovedPlanSteps\(approvedPlan\?\.id, mutateSWR\)/
    )
    expect(source).toMatch(
      /onUpdate:\s*\(\)\s*=>\s*\{[\s\S]*?revalidateApprovedPlanSteps\(approvedPlan\?\.id, mutateSWR\)/
    )
    expect(source).toContain(
      '[approvedPlan?.id, approvedPlanStepsKey, consoleView, mutateSWR, planStepsFallbackInterval]'
    )
  })

  it('rejects absent, malformed, and nil IDs before building the API path or mounting the roadmap', () => {
    expect(source).toMatch(
      /if \(typeof planID !== 'string'\) return null[\s\S]*?canonicalUUIDPattern\.test\(normalizedPlanID\)[\s\S]*?normalizedPlanID\.toLowerCase\(\) === '00000000-0000-0000-0000-000000000000'[\s\S]*?return null[\s\S]*?return deliveryPlanStepsPath\(normalizedPlanID\)/
    )
    expect(source).toMatch(/approvedPlan && approvedPlanStepsKey &&\s*\(?\s*<ApprovedPlanRoadmap/)
    expect(source).toContain(
      "if (!approvedPlanStepsKey || consoleView !== 'overview' || planStepsFallbackInterval <= 0) return"
    )
  })

  it('keeps interval refresh as a fallback only while implementation is active and SSE is not live', () => {
    expect(source).toContain("task.operation === 'delivery.implementation' && isActiveTask(task)")
    expect(source).toContain('deliveryTraceRefreshInterval(implementationExecutionActive, graphStream.status)')
    expect(source).toContain(
      'revalidateApprovedPlanSteps(approvedPlan?.id, mutateSWR)\n    }, planStepsFallbackInterval)'
    )
  })
})

describe('agent-to-step activity deep link', () => {
  it('resolves the one-shot step/run query against the approved plan and clears it after navigation', () => {
    expect(source).toContain('readDeliveryStepFocusRequest(new URLSearchParams(searchParams.toString()))')
    expect(source).toContain('focusStepKey={agentStepFocus?.stepKey}')
    expect(source).toContain('focusRunId={agentStepFocus?.runId}')
    expect(source).toContain('onFocusResolution={handleAgentStepFocusResolution}')
    expect(source).toMatch(/deliveryStepFocusReturnQuery\([\s\S]*?new URLSearchParams\(searchParams\.toString\(\)\)/)
    expect(source).toContain("result.status === 'matched' ? 'overview' : 'activity'")
  })

  it('falls back to general task activity when there is no approved plan to resolve the step against', () => {
    expect(source).toContain("handleAgentStepFocusResolution({ status: 'unavailable', stepKey: requestedStepKey })")
    expect(source).toContain("setConsoleView('activity')")
    expect(source).toContain('Abrimos la actividad general de la tarea')
  })
})

describe('work-item hierarchy return context', () => {
  it('loads parent context only for a canonical epic ID and verifies project plus membership before showing that parent', () => {
    expect(source).toContain("const requestedFromEpicID = searchParams.get('from_epic')")
    expect(source).toContain(
      'const fromEpicID = isCanonicalRouteUUID(requestedFromEpicID) ? requestedFromEpicID.trim() : null'
    )
    expect(source).toContain('item && fromEpicID ? deliveryEpicDetailPath(fromEpicID, requestedEpicTasksCursor) : null')
    expect(source).toMatch(
      /epicContext\.data\?\.epic\.id === fromEpicID &&[\s\S]*?epicContext\.data\.epic\.project_id === item\?\.project_id[\s\S]*?epicContext\.data\.work_items\.items\.some\(\(entry\) => entry\.id === item\?\.id\)/
    )
  })

  it('shows company and project breadcrumbs, returns to the verified epic page, and falls back to the project for standalone links', () => {
    expect(source).toContain('href={`/automation/clients/${encodeURIComponent(projectData.client_id)}`}')
    expect(source).toContain('href={projectReturnPath}')
    expect(source).toContain('deliveryEpicReturnPathWithContext(fromEpicID, searchParams)')
    expect(source).toContain('href={epicReturnPath ?? projectReturnPath}')
    expect(source).toContain("{parentEpic ? 'Volver a la épica' : 'Volver al proyecto'}")
    expect(source).toContain('aria-label="Ruta de navegación"')
  })

  it('round-trips project filters and the current epic task cursor when returning from a task', () => {
    expect(source).toContain("searchParams.get('epic_status') ?? undefined")
    expect(source).toContain("searchParams.get('epic_cursor') ?? undefined")
    expect(source).toContain("searchParams.get('epic_tasks_cursor')")
    expect(source).toContain("query.set('tasks_cursor', tasksCursor)")
  })

  it('keeps hierarchy context when an agent execution/history deep link clears its one-shot selection', () => {
    expect(source).toContain('const nextParams = new URLSearchParams(searchParams.toString())')
    expect(source).toContain("nextParams.delete('task')")
    expect(source).toContain("nextParams.delete('execution')")
    expect(source).toContain("nextParams.delete('execution_kind')")
    expect(source).not.toContain("nextParams.delete('from_epic')")
  })
})

describe('frozen repository topology recovery', () => {
  it('links the immutable-task warning to the real project configuration anchor with an accessible action', () => {
    expect(source).toMatch(
      /<Link\s+href=\{`\/automation\/projects\/\$\{item\.project_id\}#project-operations`\}\s+aria-label="Abrir configuración de repositorios para elegir uno principal y dejar los demás de apoyo"/
    )
    expect(source).toContain('Configurar roles para un encargo nuevo')
    expect(source).toContain('exactamente un repositorio como Principal y los demás como De apoyo')
    expect(source).toContain('Esta tarea conserva su contexto congelado: no se puede corregir ni cambiar su historial.')
    expect(source).toMatch(/role="alert"\s+className="mt-4 rounded-2xl border border-amber-500\/30/)

    // The fragment points at the existing project-settings section; that panel contains
    // the per-repository role editor rather than a fabricated route or anchor.
    expect(projectSource).toContain('id="project-operations"')
    expect(projectSource).toContain('name="repositoryRole"')
    expect(projectSource).toContain('<option value="primary">Principal</option>')
    expect(projectSource).toContain('<option value="supporting">Apoyo</option>')
  })
})
