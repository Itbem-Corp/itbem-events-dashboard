import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  // 1. Si no hay código, vuelta al login
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  try {
    // 2. Intercambiar código por tokens
    const tokenRes = await fetch(
        `${process.env.COGNITO_DOMAIN}/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: process.env.COGNITO_CLIENT_ID!,
            client_secret: process.env.COGNITO_CLIENT_SECRET!,
            code,
            redirect_uri: process.env.COGNITO_REDIRECT_URI!,
          }),
        }
    );

    if (!tokenRes.ok) {
      console.error("Cognito Error:", await tokenRes.text());
      return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
    }

    const tokens = await tokenRes.json();

    // 3. Redirigir al DASHBOARD (No a la raíz)
    const res = NextResponse.redirect(new URL("/", req.url));

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };

    // 4. Guardar ID Token (Sesión principal)
    // Nota: Usamos id_token porque contiene los claims de identidad (email, sub)
    res.cookies.set("session", tokens.id_token, {
      ...cookieOptions,
      maxAge: 60 * 60, // 1 hora (lo que dura el token de Cognito)
    });

    // 5. Guardar Refresh Token (Para futura renovación)
    // Este dura 30 días por defecto en Cognito
    if (tokens.refresh_token) {
      res.cookies.set("refresh_token", tokens.refresh_token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 30, // 30 días
      });
    }

    return res;

  } catch (error) {
    console.error("Callback Error:", error);
    return NextResponse.redirect(new URL("/login?error=server_error", req.url));
  }
}