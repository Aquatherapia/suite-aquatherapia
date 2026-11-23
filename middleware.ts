import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, tokenValido } from "./lib/acceso";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // La revisión diaria la lanza Vercel Cron sin cookie: la ruta comprueba su propia clave (lib/acceso.ts)
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Sin contraseña configurada (en local) no se pide acceso
  if (!process.env.SITE_PASSWORD) return NextResponse.next();

  // La cookie lleva un token firmado con caducidad, no la contraseña.
  // Las cookies antiguas (con la contraseña dentro) ya no valen: hay que volver a entrar una vez.
  if (await tokenValido(req.cookies.get(COOKIE_SESION)?.value, "sesion")) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(loginUrl);
  if (req.cookies.has(COOKIE_SESION)) res.cookies.delete(COOKIE_SESION);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
