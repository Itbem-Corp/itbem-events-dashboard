type RootCarrier = { is_root?: boolean | null; root_level?: number | null } | null | undefined

/**
 * Spanish label for a platform root. Root 1 is the primary administrator;
 * Root 2 is support. A legacy root without a level is a primary root, the
 * same rule the backend and the access page use.
 */
export function rootLevelLabel(user: RootCarrier): string | null {
  if (!user?.is_root) return null
  return user.root_level === 2 ? 'Root 2 · Soporte' : 'Root 1 · Administrador principal'
}
