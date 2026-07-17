'use client'

import { Logo } from '@/app/logo'
import { Heading } from '@/components/heading'
import { Strong, Text, TextLink } from '@/components/text'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

export default function Register() {
  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-ink dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Acceso por invitación</Heading>

      <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
        <InformationCircleIcon className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Solo por invitación</p>
          <p className="mt-1 text-sm text-blue-700 dark:text-blue-300/80">
            El registro está restringido. Contacta al administrador para obtener acceso.
          </p>
        </div>
      </div>

      <Text>
        ¿Ya tienes una cuenta?{' '}
        <TextLink href="/login">
          <Strong>Iniciar sesión</Strong>
        </TextLink>
      </Text>
    </div>
  )
}
