import { NextRequest, NextResponse } from "next/server";

// 1. Definimos rutas que son públicas (Login, Landing page, etc.)
const publicRoutes = ["/login", "/auth", "/logout"];
// Nota: Agregué "/" por si tienes una Landing Page pública.
// Si "/" es tu dashboard, quítalo de aquí.

export function middleware(req: NextRequest) {
  // Leemos la cookie
  const session = req.cookies.get("session");

  // Verificamos si la ruta actual es pública
  // (startsWith ayuda a cubrir /auth/callback, /auth/login, etc.)
  const isPublicRoute = publicRoutes.some(route =>
      req.nextUrl.pathname === route || (req.nextUrl.pathname.startsWith("/auth") && req.nextUrl.pathname !== "/auth/logout")
  );

  // CASO A: El usuario NO tiene sesión y quiere entrar a ruta PRIVADA
  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // CASO B: El usuario SÍ tiene sesión y quiere entrar a LOGIN (Pública)
  // Lo mandamos directo al dashboard para que no se loguee dos veces
  if (session && isPublicRoute && req.nextUrl.pathname !== "/" && req.nextUrl.pathname !== "/logout") {    // Nota: Si "/" es pública (landing), no redirigimos ahí.
    // Si "/" es dashboard, el CASO B debe ajustarse.

    // Asumamos que si intenta ir a login/auth con sesión, va al dashboard
    if (req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/auth")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (si tienes carpeta de imágenes públicas)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|images).*)",
  ],
};