import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { COOKIE_SESION, DURACION_SESION, crearToken, rutaInterna, type Sesion } from "../../../lib/acceso";
import { MAX_FALLOS, apuntarFallo, borrarFallos, fallos, ipDe } from "../../../lib/intentos";
import { comprobar, guardarUsuarios, leerUsuarios, normalizar } from "../../../lib/usuarios";
import { registrar } from "../../../lib/actividad";

// Compara en tiempo constante (los hash tienen siempre la misma longitud)
const igual = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

function volverAlLogin(req: NextRequest, next: string, error: "1" | "2", usuario: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", next);
  url.searchParams.set("error", error);
  if (usuario) url.searchParams.set("u", usuario);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const usuario = normalizar(String(form.get("usuario") ?? ""));
  const password = String(form.get("password") ?? "");
  let next = rutaInterna(String(form.get("next") ?? "/"));
  const clave = process.env.SITE_PASSWORD;
  const ip = ipDe(req);

  // Demasiados fallos seguidos: ni se mira la clave hasta que pase el bloqueo
  if (clave && (await fallos(ip)) >= MAX_FALLOS) return volverAlLogin(req, next, "2", usuario);

  // Quién entra. Mientras no haya ningún usuario dado de alta, se entra como «admin» con la clave
  // de la web (SITE_PASSWORD) para crear los usuarios en Administración.
  let sesion: Sesion | null = null;
  let nombre = "";
  if (clave) {
    const usuarios = await leerUsuarios();
    if (!Object.keys(usuarios).length) {
      if (usuario === "admin" && igual(password, clave)) {
        sesion = { u: "admin", v: 0, r: "admin", n: "Administración (arranque)" };
        nombre = "Administración (arranque)";
        next = "/admin";
      }
    } else {
      const u = usuarios[usuario];
      const ok = await comprobar(password, u?.hash); // se calcula siempre, exista o no
      if (u && ok && u.activo) {
        sesion = { u: u.usuario, v: u.version, r: u.rol, n: u.nombre };
        nombre = u.nombre;
        u.ultimoAcceso = new Date().toISOString();
        await guardarUsuarios(usuarios).catch(() => {});
      }
    }
  }

  if (!clave || !sesion) {
    const n = clave ? await apuntarFallo(ip) : 0;
    await new Promise(r => setTimeout(r, 800)); // frena los intentos seguidos
    return volverAlLogin(req, next, n >= MAX_FALLOS ? "2" : "1", usuario);
  }

  await borrarFallos(ip);
  await registrar({ u: sesion.u, n: nombre, que: "Entrar" });
  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(COOKIE_SESION, await crearToken("sesion", DURACION_SESION, sesion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SESION,
  });
  return res;
}
