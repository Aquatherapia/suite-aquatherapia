import { NextRequest, NextResponse, after } from "next/server";
import { cabeceraClave } from "./autorizar";
import { guardarEstado, leerEstado, nuevaPasada, pasadaEnCurso } from "./revision";
import { claveProblema, type ProblemaVista } from "../../revisar-fichas/tipos";

// Lo que ve la página: todos los problemas (los del feed y los de abrir cada ficha) y cómo va la revisión
async function vista() {
  const e = await leerEstado();
  const desde = e.nuevosDesde;
  const problemas: ProblemaVista[] = [...(e.feed?.problemas ?? []), ...Object.values(e.html).flat()].map(p => {
    const visto = e.vistos[claveProblema(p)];
    return desde && visto && visto >= desde ? { ...p, nuevo: true } : p;
  });
  return {
    problemas,
    feed: e.feed ? { fecha: e.feed.fecha, fichas: e.feed.fichas, filas: e.feed.filas } : null,
    pasada: e.pasada ?? null,
    enCurso: pasadaEnCurso(e),
    hayNuevos: !!desde,
  };
}

export async function GET() {
  return NextResponse.json(await vista());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action !== "revisar") return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });

  const e = await leerEstado();
  if (pasadaEnCurso(e)) return NextResponse.json(await vista());
  e.pasada = nuevaPasada("manual");
  await guardarEstado(e);

  // Se arranca la cadena de pasos (la misma que lanza Vercel Cron cada mañana)
  const url = `${req.nextUrl.origin}/api/cron/revisar-fichas?id=${encodeURIComponent(e.pasada.id)}`;
  after(() => fetch(url, { headers: cabeceraClave(), cache: "no-store" }).then(() => {}).catch(() => {}));
  return NextResponse.json(await vista());
}
