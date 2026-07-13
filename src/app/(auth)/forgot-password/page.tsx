import { Logo } from '@/app/logo'
import { Heading } from '@/components/heading'
import { Strong, Text, TextLink } from '@/components/text'
import { buildCognitoForgotPasswordUrl } from '@/lib/cognito-oauth'
import { redirect } from 'next/navigation'

export default function ForgotPassword() {
  const forgotPasswordUrl = buildCognitoForgotPasswordUrl()
  if (forgotPasswordUrl) redirect(forgotPasswordUrl)

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Recuperar contraseña</Heading>

      <Text>
        La recuperación de contraseña no está disponible en este entorno. Contacta al administrador del sistema o
        escribe a <strong className="text-zinc-200">soporte@eventapp.mx</strong>
      </Text>

      <Text>
        ¿Recordaste tu contraseña?{' '}
        <TextLink href="/login">
          <Strong>Iniciar sesión</Strong>
        </TextLink>
      </Text>
    </div>
  )
}
