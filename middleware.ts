import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { COOKIE_SESION, leerSesion, type Sesion } from "./lib/acceso";
import { usuariosConCache, type Usuarios } from "./lib/usuarios-kv";
import { detalleDe, herramientaDe, registrar } from "./lib/actividad";

// Cabeceras con quién hace la petición. Las pone solo el middleware: las que vengan de fuera se borran.
const CABECERAS = ["x-suite-usuario", "x-suite-rol", "x-suite-nombre"];

function limpias(req: NextRequest): Headers {
  const h = new Headers(req.headers);
  for (const c of CABECERAS) h.delete(c);
  return h;
}

// Comprueba que la sesión sigue valiendo: usuario activo y misma versión (baja o contraseña nueva la cierran).
// Sin usuarios dados de alta todavía, vale la sesión de arranque («admin» con la clave de la web).
async function quienEs(s: Sesion): Promise<{ rol: string; nombre: string } | null> {
  if (s.r === "sistema" && s.u === "sistema") return { rol: "sistema", nombre: "Revisión automática" };
  const comprobar = (usuarios: Usuarios) => {
    if (!Object.keys(usuarios).length) return s.u === "admin" && s.v === 0 ? { rol: "admin", nombre: "Administración (arranque)" } : null;
    const u = usuarios[s.u];
    return u && u.activo && u.version === s.v ? { rol: u.rol as string, nombre: u.nombre } : null;
  };
  const usuarios = await usuariosConCache();
  if (usuarios === null) return { rol: s.r, nombre: s.n ?? s.u }; // en local, sin KV: vale lo firmado
  // Antes de rechazar, se relee la lista por si acaba de cambiar (usuario nuevo, contraseña nueva…)
  return comprobar(usuarios) ?? comprobar((await usuariosConCache(true)) ?? {});
}

// Lo que cambia algo (POST, PUT, PATCH, DELETE) queda en el registro de actividad, con la acción y los
// datos principales si el cuerpo es un JSON pequeño. Los archivos subidos no se leen.
async function apuntar(req: NextRequest, usuario: string, nombre: string) {
  let cuerpo: unknown = null;
  const tipo = req.headers.get("content-type") ?? "";
  const largo = Number(req.headers.get("content-length") ?? "0");
  if (tipo.includes("application/json") && largo > 0 && largo < 50_000) {
    try { cuerpo = await req.clone().json(); } catch { /* sin detalle */ }
  }
  await registrar({ u: usuario, n: nombre, que: herramientaDe(req.nextUrl.pathname), det: detalleDe(req.method, cuerpo) });
}

export async function middleware(req: NextRequest, evento: NextFetchEvent) {
  const { pathname, search } = req.nextUrl;
  const headers = limpias(req);

  // La revisión diaria la lanza Vercel Cron sin cookie: la ruta comprueba su propia clave (lib/acceso.ts)
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/api/cron/")) {
    return NextResponse.next({ request: { headers } });
  }

  // Sin contraseña configurada (en local) no se pide acceso
  if (!process.env.SITE_PASSWORD) return NextResponse.next({ request: { headers } });

  // La cookie lleva un token firmado con caducidad, no la contraseña. Las antiguas ya no valen.
  const sesion = await leerSesion(req.cookies.get(COOKIE_SESION)?.value);
  const yo = sesion && (await quienEs(sesion));

  if (!sesion || !yo) {
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "La sesión ha caducado. Vuelve a entrar." }, { status: 401 });
      if (req.cookies.has(COOKIE_SESION)) res.cookies.delete(COOKIE_SESION);
      return res;
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(loginUrl);
    if (req.cookies.has(COOKIE_SESION)) res.cookies.delete(COOKIE_SESION);
    return res;
  }

  // Administración, solo para administradores
  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && yo.rol !== "admin") {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Solo para administradores" }, { status: 403 })
      : NextResponse.redirect(new URL("/", req.url));
  }

  headers.set("x-suite-usuario", sesion.u);
  headers.set("x-suite-rol", yo.rol);
  headers.set("x-suite-nombre", encodeURIComponent(yo.nombre));

  const cambia = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const propio = pathname.startsWith("/api/admin") || pathname.startsWith("/api/cuenta") || pathname === "/api/logout";
  if (cambia && pathname.startsWith("/api/") && !propio && sesion.u !== "sistema") {
    evento.waitUntil(apuntar(req, sesion.u, yo.nombre));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
