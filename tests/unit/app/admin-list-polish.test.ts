import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('admin list UX hardening', () => {
  it('separates event operational state from public visibility', () => {
    const source = readSource('src/components/events/forms/event-form-modal.tsx')

    expect(source).toContain('Mantiene el evento disponible para la operación interna')
    expect(source).toMatch(/La visibilidad para invitados se publica\s+desde/)
    expect(source).not.toContain('Los eventos activos son visibles para los invitados')
  })

  it('gives filtered user results an honest empty state and protects Root 2 changes', () => {
    const source = readSource('src/app/(app)/users/page.tsx')

    expect(source).toContain("debouncedSearch || statusFilter !== 'ALL'")
    expect(source).toContain('Limpiar búsqueda y filtros')
    expect(source).toContain('<ul')
    expect(source).toContain('<li')
    expect(source).toContain('<ConfirmAlert')
    expect(source).toContain('rootLevelPendingId')
    expect(source).toContain('No se pudo actualizar el acceso Root 2')
  })

  it('renders organizations as a flat paginated directory with explicit labels and icons', () => {
    const source = readSource('src/app/(app)/clients/page.tsx')

    expect(source).toContain("singularLabel: 'Plataforma'")
    expect(source).toContain("singularLabel: 'Agencia'")
    expect(source).toContain("singularLabel: 'Cliente'")
    expect(source).toContain('Organizaciones visibles')
    expect(source).toContain('clients.map((client)')
    expect(source).toContain('<li')
    expect(source).not.toContain("from 'motion/react'")
    expect(source).toContain('<ArrowRightIcon')
    expect(source).toContain('<EllipsisVerticalIcon')
    expect(source).not.toContain('ClientHierarchyItem')
    expect(source).not.toContain('Math.min(depth')
    expect(source).not.toContain('.slice(0, -1)')
  })

  it('keeps required organization fields before the optional logo and handles type failures', () => {
    const source = readSource('src/components/clients/forms/client-form-modal.tsx')
    const nameIndex = source.indexOf('Nombre Legal o Comercial')
    const logoIndex = source.indexOf('Identidad visual')

    expect(nameIndex).toBeGreaterThan(-1)
    expect(logoIndex).toBeGreaterThan(nameIndex)
    expect(source).toContain('clientTypesError')
    expect(source).toContain('retryClientTypes')
    expect(source).toContain('No pudimos cargar los tipos de organización')
    expect(source).toContain('prepareImageForUpload')
    expect(source).toContain('<UploadStatus')
    expect(source).toContain('requestConfig')
    expect(source).not.toContain("'Content-Type': 'multipart/form-data'")
  })
})
