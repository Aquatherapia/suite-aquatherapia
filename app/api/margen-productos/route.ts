import { NextRequest, NextResponse } from "next/server";
import { actualizar, leerGuardado } from "./margen";

// GET: lo último guardado (o null si nunca se ha leído el feed). POST {action:"actualizar"}: vuelve a leer el feed (~1 min).
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ datos: await leerGuardado().catch(() => null) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action !== "actualizar") return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  try {
    return NextResponse.json({ datos: await actualizar() });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer el feed de la web: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
