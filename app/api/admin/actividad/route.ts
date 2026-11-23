import { NextRequest, NextResponse } from "next/server";
import { leerActividad } from "../../../../lib/actividad";

// Registro de actividad (solo administradores: lo controla el middleware). ?desde=0 para paginar.
export async function GET(req: NextRequest) {
  const desde = Math.max(0, Number(req.nextUrl.searchParams.get("desde") ?? "0") || 0);
  return NextResponse.json({ movimientos: await leerActividad(desde, 300) });
}
