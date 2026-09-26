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

export function Alert({
  size = 'md',
  className,
  children,
  ...props
}: { size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<
  Headless.DialogProps,
  'as' | 'className'
>) {
  return (
    <Headless.Dialog {...props} className="fixed inset-0 z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-[rgb(15_23_42_/_32%)] px-2 py-2 backdrop-blur-[2px] transition-opacity duration-200 ease-out focus:outline-0 motion-reduce:transition-none data-closed:opacity-0 data-enter:ease-out data-leave:duration-150 data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-[rgb(2_6_12_/_62%)]"
      />

      <div className="fixed inset-0 w-screen overflow-y-auto overscroll-contain px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-0 sm:pt-0 sm:pb-0">
        <div className="grid min-h-full grid-rows-[1fr_auto_1fr] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel
            transition
            className={clsx(
              className,
              sizes[size],
              'row-start-2 max-h-[calc(100dvh-3rem)] w-full overflow-y-auto overscroll-contain rounded-2xl bg-surface-raised p-5 shadow-[0_24px_72px_var(--app-shadow-strong)] ring-1 ring-border-subtle sm:max-h-[calc(100dvh-4rem)] sm:p-6 forced-colors:outline',
              'will-change-[opacity,transform] transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:data-closed:scale-100 motion-reduce:data-closed:opacity-100 data-closed:translate-y-2 data-closed:scale-[0.98] data-closed:opacity-0 data-enter:ease-[cubic-bezier(0.16,1,0.3,1)] data-leave:duration-150 data-leave:ease-in'
            )}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}

export function AlertTitle({
  className,
  ...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'as' | 'className'>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={clsx(
        className,
        'text-center text-base/6 font-semibold text-balance text-ink sm:text-left sm:text-sm/6 sm:text-wrap'
      )}
    />
  )
}

export function AlertDescription({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps<typeof Text>, 'as' | 'className'>) {
  return (
    <Headless.Description
      as={Text}
      {...props}
      className={clsx(className, 'mt-2 text-center text-pretty sm:text-left')}
    />
  )
}

export function AlertBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-4')} />
}

export function AlertActions({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:mt-4 sm:flex-row sm:*:w-auto'
      )}
    />
  )
}
