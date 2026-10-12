import type { AccessProfile } from '@/lib/access-profile'

export type WorkspaceCopy = { eyebrow: string; title: string; description: string }

export type WorkspaceCopyOptions = {
  /** False for products without the events module (ITBEM, Cafetton House). */
  productHasEvents?: boolean
  /**
   * shell.localizedRoleLabels (EventiApp): eyebrows name the role the same
   * way the role labels do ('Administrador', 'Solo lectura').
   */
  localizedRoleLabels?: boolean
}

export type OrganizationWorkspaceCopyOptions = WorkspaceCopyOptions

type RoleCopy = { events: WorkspaceCopy; generic: WorkspaceCopy }

function roleCopy(role: string, organizationName: string | undefined, localized: boolean): RoleCopy {
  switch (role) {
    case 'OWNER':
      return {
        events: {
          eyebrow: 'Dirección de organización',
          title: organizationName || 'Tu organización',
          description: 'Equipo, eventos y resultados bajo una sola operación.',
        },
        generic: {
          eyebrow: 'Dirección de organización',
          title: organizationName || 'Tu organización',
          description: 'Equipo, operación y resultados en un solo espacio.',
        },
      }
    case 'ADMIN': {
      const copy = {
        eyebrow: localized ? 'Administrador' : 'Administración',
        title: organizationName || 'Tu organización',
        description: 'Coordina el equipo y mantiene la operación lista para crecer.',
      }
      return { events: copy, generic: copy }
    }
    case 'EVENT_MANAGER':
      return {
        events: {
          eyebrow: 'Centro de eventos',
          title: 'Operación y producción',
          description: 'Planea eventos, coordina invitados y sigue cada resultado.',
        },
        generic: {
          eyebrow: 'Operación',
          title: 'Operación y producción',
          description: 'Coordina la operación diaria y sigue cada resultado.',
        },
      }
    case 'EDITOR':
      return {
        events: {
          eyebrow: 'Contenido y experiencia',
          title: 'Eventos listos para publicar',
          description: 'Edita estructura, contenido e invitados sin acciones destructivas.',
        },
        generic: {
          eyebrow: 'Contenido y experiencia',
          title: 'Contenido en preparación',
          description: 'Edita el contenido de tu espacio sin acciones destructivas.',
        },
      }
    case 'CHECKIN':
      return {
        events: {
          eyebrow: 'Operación de acceso',
          title: 'Check-in sin fricción',
          description: 'Consulta próximos eventos y mantén ágil la llegada de invitados.',
        },
        generic: {
          eyebrow: 'Operación de acceso',
          title: 'Acceso sin fricción',
          description: 'Mantén ágil el registro de llegadas de tu espacio.',
        },
      }
    case 'ANALYST':
      return {
        events: {
          eyebrow: 'Resultados',
          title: 'Lectura de operación',
          description: 'Analiza actividad, capacidad y desempeño sin modificar la experiencia.',
        },
        generic: {
          eyebrow: 'Resultados',
          title: 'Lectura de operación',
          description: 'Analiza actividad y desempeño sin modificar la operación.',
        },
      }
    case 'MEMBER':
      return {
        events: {
          eyebrow: 'Colaboración',
          title: 'Tus eventos asignados',
          description: 'Apoya la gestión de invitados dentro de un espacio controlado.',
        },
        generic: {
          eyebrow: 'Colaboración',
          title: 'Tu espacio asignado',
          description: 'Colabora en la operación dentro de un espacio controlado.',
        },
      }
    default: {
      const eyebrow = localized && (role === 'GUEST' || role === 'VIEWER') ? 'Solo lectura' : 'Vista de consulta'
      return {
        events: {
          eyebrow,
          title: organizationName || 'Eventos',
          description: 'Consulta agenda y estado sin permisos de modificación.',
        },
        generic: {
          eyebrow,
          title: organizationName || 'Tu espacio',
          description: 'Consulta la actividad y el estado sin permisos de modificación.',
        },
      }
    }
  }
}

/** Product copy is feature policy, kept independent from the home route's UI. */
export function organizationWorkspaceCopy(
  accessProfile: AccessProfile,
  organizationName?: string,
  options: WorkspaceCopyOptions = {}
): WorkspaceCopy {
  const productHasEvents = options.productHasEvents ?? true
  const localized = Boolean(options.localizedRoleLabels)
  if (accessProfile.platformLevel === 'root_1') {
    return {
      eyebrow: 'Supervisión de organización',
      title: organizationName || 'Organización',
      description: 'Gobierno, operación y resultados del espacio seleccionado.',
    }
  }
  if (accessProfile.platformLevel === 'root_2') {
    return {
      eyebrow: 'Soporte operativo',
      title: organizationName || 'Organización',
      description: productHasEvents
        ? 'Asistencia a invitados, check-in y analítica sin cambios estructurales.'
        : 'Asistencia operativa y analítica sin cambios estructurales.',
    }
  }
  const role = (accessProfile.organizationRole ?? '').replace('INHERITED_', '').toUpperCase()
  const copy = roleCopy(role, organizationName, localized)
  return productHasEvents ? copy.events : copy.generic
}

/** What the Root 2 support notice may promise, given the product's modules. */
export function operationalRootSupportCopy({
  productHasEvents,
  productHasUsers,
}: {
  productHasEvents: boolean
  productHasUsers: boolean
}): string {
  const scope = [productHasUsers ? 'usuarios' : null, productHasEvents ? 'invitados y check-in' : null].filter(
    (item): item is string => item !== null
  )
  const assist = scope.length ? `Este nivel puede asistir ${scope.join(', ')}.` : 'Este nivel brinda soporte operativo.'
  const reserved = productHasEvents
    ? 'La creación o eliminación de eventos, los usuarios root y la configuración estructural permanecen reservados a Root 1.'
    : 'Los usuarios root y la configuración estructural permanecen reservados a Root 1.'
  return `${assist} ${reserved}`
}
