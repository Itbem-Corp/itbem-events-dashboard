'use client'

import { Logo } from '@/app/logo'
import { Heading } from '@/components/heading'
import { Strong, Text, TextLink } from '@/components/text'
import { useEffect } from 'react'

export default function ForgotPassword() {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN

  useEffect(() => {
    if (cognitoDomain) {
      // Redirect to Cognito's hosted UI forgot-password flow
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? ''
      const redirectUri = encodeURIComponent(
        `${window.location.origin}/api/auth/callback/cognito`
      )
      window.location.href = `https://${cognitoDomain}/forgotPassword?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}`
    }
  }, [cognitoDomain])

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Recuperar contraseña</Heading>

      {cognitoDomain ? (
        <Text>Redirigiendo al portal de recuperación de contraseña...</Text>
      ) : (
        <>
          <Text>
            Para recuperar tu contraseña, contacta al administrador del sistema o
            escribe a{' '}
            <strong className="text-zinc-200">soporte@eventapp.mx</strong>
          </Text>
        </>
      )}

      <Text>
        ¿Recordaste tu contraseña?{' '}
        <TextLink href="/login">
          <Strong>Iniciar sesión</Strong>
        </TextLink>
      </Text>
    </div>
  )
}
