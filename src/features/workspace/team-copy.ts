import type { ProductShellPolicy } from '@/products/core/product-manifest'

export type TeamPageCard = { title: string; text: string }

/**
 * Copy of the two explanation cards on /team. Products with localized role
 * labels (EventiApp) name the roles in Spanish and do not mention the other
 * products; every other product keeps today's text verbatim.
 */
export function teamPageCards(shell: ProductShellPolicy | undefined): [TeamPageCard, TeamPageCard] {
  if (shell?.localizedRoleLabels) {
    return [
      {
        title: 'Roles por responsabilidad',
        text: 'Propietario y Administrador gestionan el equipo; los demás roles reciben solo las acciones que necesitan para sus eventos.',
      },
      {
        title: 'Acceso por organización',
        text: 'Cada organización tiene su propio equipo y permisos. Una misma cuenta puede pertenecer a varias organizaciones.',
      },
    ]
  }
  return [
    {
      title: 'Roles por responsabilidad',
      text: 'Owner y Admin gestionan el equipo; operación, check-in y analítica reciben sólo las acciones necesarias.',
    },
    {
      title: 'Acceso independiente por producto',
      text: 'Una misma identidad puede entrar a EventiApp, ITBEM o Cafetton sin compartir datos ni permisos entre portales.',
    },
  ]
}
