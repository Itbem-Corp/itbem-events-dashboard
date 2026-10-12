import { Avatar } from '@/components/avatar'
import { Link } from '@/components/link'
import { BrandMark } from '@/components/product/brand-mark'
import { SidebarHeader } from '@/components/sidebar'
import { OrganizationSwitcherTrigger } from '@/components/workspace/organization-switcher-trigger'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import type { AccessProfile } from '@/lib/access-profile'
import type { TenantConfig } from '@/lib/tenant-config'
import { useProductShell } from '@/products/core/product-context'
import { memo } from 'react'

type ApplicationWorkspaceHeaderProps = {
  accessProfile: AccessProfile
  canSwitchOrganizations: boolean
  currentClient: OrganizationOption | null
  tenant: Omit<TenantConfig, 'clientId'>
  /** Products may limit the workspace block to roots and Owner/Admin. */
  showWorkspaceBlock?: boolean
  /** The landing route for the brand link. */
  homeHref?: string
  onOpenSwitcher: () => void
  onSwitcherIntent: () => void
}

export const ApplicationWorkspaceHeader = memo(function ApplicationWorkspaceHeader({
  accessProfile,
  canSwitchOrganizations,
  currentClient,
  tenant,
  showWorkspaceBlock = true,
  homeHref = '/',
  onOpenSwitcher,
  onSwitcherIntent,
}: ApplicationWorkspaceHeaderProps) {
  const accessibleShell = Boolean(useProductShell()?.accessibleShell)
  const sidebarAccent = tenant.code === 'itbem' ? '#f1f3f5' : tenant.accent
  const smallText = accessibleShell ? 'text-xs' : 'text-[10px]'

  return (
    <SidebarHeader className="gap-3 border-border-subtle bg-gradient-to-b from-surface-interactive to-transparent pb-4">
      <Link
        href={homeHref}
        aria-label={`${tenant.name} — ir al inicio`}
        className="group flex items-center gap-3 rounded-xl px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
      >
        <BrandMark
          code={tenant.code}
          name={tenant.name}
          accent={sidebarAccent}
          size="md"
          priority
          className="transition-transform group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-[-0.02em] text-ink">
            {tenant.name}
          </span>
          <span className={`block ${smallText} font-medium tracking-[0.16em] text-ink-muted uppercase`}>
            {tenant.productLabel}
          </span>
        </span>
      </Link>

      {showWorkspaceBlock && (
        <>
          <p className={`px-2 ${smallText} font-semibold tracking-[0.16em] text-ink-muted uppercase`}>
            Espacio de trabajo
          </p>
          {canSwitchOrganizations ? (
            <OrganizationSwitcherTrigger
              accessProfile={accessProfile}
              currentClient={currentClient}
              onOpen={onOpenSwitcher}
              onOpenIntent={onSwitcherIntent}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-interactive px-3 py-2.5">
              <Avatar
                src={currentClient?.logo}
                initials={currentClient?.name?.substring(0, 2).toUpperCase() || tenant.name.substring(0, 2)}
                className="bg-(--tenant-accent) text-white"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {currentClient?.name || tenant.name}
                </p>
                <p className={`${smallText} tracking-[0.14em] text-ink-muted uppercase`}>Organización asignada</p>
              </div>
            </div>
          )}
        </>
      )}
    </SidebarHeader>
  )
})
