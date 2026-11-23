import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION } from "../../../lib/acceso";
import { registrar } from "../../../lib/actividad";
import { quien } from "../../../lib/usuarios";

// Salir: borra la cookie de este navegador
export async function POST(req: NextRequest) {
  const yo = quien(req);
  if (yo.usuario) await registrar({ u: yo.usuario, n: yo.nombre, que: "Salir" });
  const res = NextResponse.redirect(new URL("/login?salir=1", req.url), { status: 303 });
  res.cookies.delete(COOKIE_SESION);
  return res;
}
