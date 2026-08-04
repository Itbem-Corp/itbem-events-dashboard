import type { AccessProfile } from '@/lib/access-profile'

/** Product copy is feature policy, kept independent from the home route's UI. */
export function organizationWorkspaceCopy(accessProfile: AccessProfile, organizationName?: string) {
  const role = (accessProfile.organizationRole ?? '').replace('INHERITED_', '').toUpperCase()
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
      description: 'Asistencia a invitados, check-in y analítica sin cambios estructurales.',
    }
  }
  switch (role) {
    case 'OWNER':
      return {
        eyebrow: 'Dirección de organización',
        title: organizationName || 'Tu organización',
        description: 'Equipo, eventos y resultados bajo una sola operación.',
      }
    case 'ADMIN':
      return {
        eyebrow: 'Administración',
        title: organizationName || 'Tu organización',
        description: 'Coordina el equipo y mantiene la operación lista para crecer.',
      }
    case 'EVENT_MANAGER':
      return {
        eyebrow: 'Centro de eventos',
        title: 'Operación y producción',
        description: 'Planea eventos, coordina invitados y sigue cada resultado.',
      }
    case 'EDITOR':
      return {
        eyebrow: 'Contenido y experiencia',
        title: 'Eventos listos para publicar',
        description: 'Edita estructura, contenido e invitados sin acciones destructivas.',
      }
    case 'CHECKIN':
      return {
        eyebrow: 'Operación de acceso',
        title: 'Check-in sin fricción',
        description: 'Consulta próximos eventos y mantén ágil la llegada de invitados.',
      }
    case 'ANALYST':
      return {
        eyebrow: 'Resultados',
        title: 'Lectura de operación',
        description: 'Analiza actividad, capacidad y desempeño sin modificar la experiencia.',
      }
    case 'MEMBER':
      return {
        eyebrow: 'Colaboración',
        title: 'Tus eventos asignados',
        description: 'Apoya la gestión de invitados dentro de un espacio controlado.',
      }
    default:
      return {
        eyebrow: 'Vista de consulta',
        title: organizationName || 'Eventos',
        description: 'Consulta agenda y estado sin permisos de modificación.',
      }
  }
}
