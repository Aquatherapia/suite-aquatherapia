import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { COOKIE_SESION, DURACION_SESION, crearToken, rutaInterna } from "../../../lib/acceso";
import { MAX_FALLOS, apuntarFallo, borrarFallos, fallos, ipDe } from "../../../lib/intentos";

// Compara en tiempo constante (los hash tienen siempre la misma longitud)
const igual = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

function volverAlLogin(req: NextRequest, next: string, error: "1" | "2") {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", next);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = rutaInterna(String(form.get("next") ?? "/"));
  const expected = process.env.SITE_PASSWORD;
  const ip = ipDe(req);

  // Demasiados fallos seguidos: ni se mira la clave hasta que pase el bloqueo
  if (expected && (await fallos(ip)) >= MAX_FALLOS) return volverAlLogin(req, next, "2");

  if (!expected || !igual(password, expected)) {
    const n = expected ? await apuntarFallo(ip) : 0;
    await new Promise(r => setTimeout(r, 800)); // frena los intentos seguidos
    return volverAlLogin(req, next, n >= MAX_FALLOS ? "2" : "1");
  }

  await borrarFallos(ip);
  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(COOKIE_SESION, await crearToken("sesion", DURACION_SESION), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SESION,
  });
  return res;
}
