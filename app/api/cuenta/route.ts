import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, DURACION_SESION, crearToken } from "../../../lib/acceso";
import { registrar } from "../../../lib/actividad";
import { MIN_CONTRASENA, cifrar, comprobar, guardarUsuarios, leerUsuarios, quien } from "../../../lib/usuarios";

// Mi cuenta: quién soy y cambiar mi contraseña
export async function GET(req: NextRequest) {
  const yo = quien(req);
  return NextResponse.json({ usuario: yo.usuario, nombre: yo.nombre, rol: yo.rol });
}

export async function POST(req: NextRequest) {
  const yo = quien(req);
  const body = await req.json().catch(() => ({})) as { actual?: string; nueva?: string };
  const usuarios = await leerUsuarios();
  const u = usuarios[yo.usuario];
  if (!u) return NextResponse.json({ error: "Primero crea tu usuario en Administración." }, { status: 400 });
  if (!(await comprobar(body.actual ?? "", u.hash))) return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
  if ((body.nueva ?? "").length < MIN_CONTRASENA) return NextResponse.json({ error: `La contraseña nueva tiene que tener al menos ${MIN_CONTRASENA} caracteres.` }, { status: 400 });

  u.hash = await cifrar(body.nueva!);
  u.version += 1; // cierra mis sesiones en otros dispositivos
  await guardarUsuarios(usuarios);
  await registrar({ u: u.usuario, n: u.nombre, que: "Mi cuenta", det: "cambió su contraseña" });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, await crearToken("sesion", DURACION_SESION, { u: u.usuario, v: u.version, r: u.rol, n: u.nombre }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_SESION,
  });
  return res;
}
