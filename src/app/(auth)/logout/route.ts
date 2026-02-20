import { NextResponse } from "next/server";

export async function GET() {
  const logoutUri = process.env.COGNITO_LOGOUT_REDIRECT_URI;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const domain = process.env.COGNITO_DOMAIN;

  if (!logoutUri || !clientId || !domain) {
    throw new Error("Faltan variables de entorno para el Logout");
  }

  // 1. Construimos la URL de Cognito
  const cognitoLogoutUrl = `${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;

  const response = NextResponse.redirect(cognitoLogoutUrl);

  // 2. Borrado de cookies con atributos explícitos
  const cookieOptions = {
    path: "/",         // 👈 FUNDAMENTAL: Debe coincidir con el path donde se creó
    maxAge: 0,         // Expira inmediatamente
    expires: new Date(0), // Refuerzo para navegadores antiguos
  };

  response.cookies.set("session", "", cookieOptions);
  response.cookies.set("access_token", "", cookieOptions);
  response.cookies.set("refresh_token", "", cookieOptions);

  return response;
}