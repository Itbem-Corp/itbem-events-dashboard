import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TeamPage from '@/app/(app)/team/page'
import { ProductProvider } from '@/products/core/product-context'
import type { TenantCode } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

vi.mock('next/dynamic', () => ({ default: () => () => null }))

function renderTeam(code: TenantCode) {
  useStore.setState({ currentClient: { id: 'c1', name: 'Acme' } as never })
  return render(
    <ProductProvider product={getProductManifest(code)}>
      <TeamPage />
    </ProductProvider>
  )
}

afterEach(() => {
  useStore.setState({ currentClient: null })
})

describe('Team page copy', () => {
  it('EventiApp names roles in Spanish and does not mention other products', () => {
    const { container } = renderTeam('eventiapp')

    expect(
      screen.getByText(
        'Propietario y Administrador gestionan el equipo; los demás roles reciben solo las acciones que necesitan para sus eventos.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acceso por organización' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cada organización tiene su propio equipo y permisos. Una misma cuenta puede pertenecer a varias organizaciones.'
      )
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/ITBEM|Cafetton|Owner y Admin/)
  })

  it('Cafetton keeps today text verbatim', () => {
    renderTeam('cafettonhouse')

    expect(
      screen.getByText(
        'Owner y Admin gestionan el equipo; operación, check-in y analítica reciben sólo las acciones necesarias.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acceso independiente por producto' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Una misma identidad puede entrar a EventiApp, ITBEM o Cafetton sin compartir datos ni permisos entre portales.'
      )
    ).toBeInTheDocument()
  })
})

describe('Home workspace copy', () => {
  it('uses the shared organizationWorkspaceCopy instead of a local duplicate', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/page.tsx'), 'utf8')
    expect(source).toContain("import { organizationWorkspaceCopy } from '@/features/workspace/workspace-copy'")
    expect(source).not.toMatch(/function organizationWorkspaceCopy\(/)
    expect(source.match(/localizedRoleLabels \}\)/g)).toHaveLength(2)
  })
})
