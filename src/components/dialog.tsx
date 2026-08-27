import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'
import { Text } from './text'

const sizes = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
}

export function Dialog({
  size = 'lg',
  className,
  children,
  ...props
}: { size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<
  Headless.DialogProps,
  'as' | 'className'
>) {
  return (
    <Headless.Dialog {...props} className="relative z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-[rgb(15_23_42_/_24%)] px-2 py-2 backdrop-blur-[2px] transition duration-100 focus:outline-0 motion-reduce:transition-none data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-[rgb(2_6_12_/_58%)]"
      />

      <div className="fixed inset-0 w-screen overflow-y-auto overscroll-contain px-2 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-0 sm:pt-0 sm:pb-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel
            transition
            className={clsx(
              className,
              sizes[size],
              'row-start-2 max-h-[calc(100dvh-1.5rem)] w-full min-w-0 overflow-y-auto overscroll-contain rounded-t-3xl bg-[var(--app-surface-raised)] p-(--gutter) shadow-[0_24px_80px_var(--app-shadow-strong)] ring-1 ring-[var(--app-border-subtle)] [--gutter:--spacing(8)] sm:mb-auto sm:max-h-[calc(100dvh-4rem)] sm:rounded-2xl forced-colors:outline',
              'transition duration-100 will-change-transform motion-reduce:transition-none motion-reduce:data-closed:translate-y-0 motion-reduce:data-closed:scale-100 motion-reduce:data-closed:opacity-100 data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95'
            )}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}

export function DialogTitle({
  className,
  ...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'as' | 'className'>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={clsx(className, 'text-lg/6 font-semibold text-balance text-[var(--app-text-primary)] sm:text-base/6')}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps<typeof Text>, 'as' | 'className'>) {
  return <Headless.Description as={Text} {...props} className={clsx(className, 'mt-2 text-pretty')} />
}

export function DialogBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-6')} />
}

export function DialogActions({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto'
      )}
    />
  )
}
