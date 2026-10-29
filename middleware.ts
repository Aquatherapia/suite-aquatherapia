import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "suite_auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // La revisión diaria la lanza Vercel Cron sin cookie: la ruta comprueba su propia clave
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const expected = process.env.SITE_PASSWORD;

  if (!expected || cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
