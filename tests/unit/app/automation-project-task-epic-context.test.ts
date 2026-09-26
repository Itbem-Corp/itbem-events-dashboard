import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectPagePath = 'src/app/(app)/automation/projects/[projectId]/page.tsx'

describe('project task epic context', () => {
  it('loads project epics and lets a manual task opt into a frozen epic snapshot', () => {
    const page = readFileSync(resolve(process.cwd(), projectPagePath), 'utf8')

    expect(page).toContain('deliveryProjectEpicsPagePath(projectId, { limit: 100 })')
    expect(page).toContain('id="project-task-epic"')
    expect(page).toContain('htmlFor="project-task-epic"')
    expect(page).toContain('value="">Trabajo independiente · sin épica</option>')
    expect(page).toContain('aria-describedby="project-task-epic-help project-task-epic-status"')
    expect(page).toContain('Cargando épicas del proyecto…')
    expect(page).toContain('No se pudieron cargar las épicas; puedes crear la tarea como independiente.')
    expect(page).toContain('Este proyecto aún no tiene épicas; la tarea se creará de forma independiente.')
    expect(page).toContain('contexto como snapshot inmutable antes de preparar el plan')
    expect(page).toContain("...(task.epicId ? { epic_id: task.epicId } : {})")
    expect(page).toContain("epicId: '',")
  })

  it('shows configured environments and promotion guidance without implying live deployment state', () => {
    const page = readFileSync(resolve(process.cwd(), projectPagePath), 'utf8')

    expect(page).toContain('id="project-environment-promotion"')
    expect(page).toContain('Ambientes y promoción')
    expect(page).toContain('environmentDeploymentLabel(source.metadata?.deployment)')
    expect(page).toContain("projectMetadataText(source.metadata, 'branch')")
    expect(page).toContain("projectMetadataText(source.metadata, 'url')")
    expect(page).toContain("projectMetadataText(source.metadata, 'promotion')")
    expect(page).toContain("projectMetadataText(source.metadata, 'release_workflow')")
    expect(page).toContain('La lista no implica un orden entre ambientes.')
    expect(page).toContain('El contrato actual guarda esta información como configuración y texto libre')
    expect(page).toContain('Esta vista no despliega ni autoriza promociones.')
    expect(page).not.toContain('Promover a producción')
  })
})
