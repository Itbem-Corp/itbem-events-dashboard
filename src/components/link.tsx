'use client'

import { beginNavigationProgress } from '@/lib/navigation-progress'
import * as Headless from '@headlessui/react'
import NextLink, { type LinkProps } from 'next/link'
import React, { forwardRef } from 'react'

type NavigateEvent = Parameters<NonNullable<LinkProps['onNavigate']>>[0]

function isSameDocumentTarget(href: LinkProps['href']) {
  if (typeof window === 'undefined' || typeof href !== 'string') return false

  const currentUrl = new URL(window.location.href)
  const targetUrl = new URL(href, currentUrl)

  return (
    targetUrl.origin === currentUrl.origin &&
    targetUrl.pathname === currentUrl.pathname &&
    targetUrl.search === currentUrl.search
  )
}

export const Link = forwardRef(function Link(
  { onNavigate, ...props }: LinkProps & React.ComponentPropsWithoutRef<'a'>,
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  function handleNavigate(event: NavigateEvent) {
    let prevented = false

    onNavigate?.({
      preventDefault() {
        prevented = true
        event.preventDefault()
      },
    })

    if (!prevented && !isSameDocumentTarget(props.href)) beginNavigationProgress()
  }

  return (
    <Headless.DataInteractive>
      <NextLink {...props} onNavigate={handleNavigate} ref={ref} />
    </Headless.DataInteractive>
  )
})
