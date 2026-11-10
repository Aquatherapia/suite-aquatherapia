import { NextRequest, NextResponse, after } from "next/server";
import { lanzarPaso } from "./autorizar";
import { guardarEstado, leerEstado, nuevaPasada, pasadaCortada, pasadaEnCurso } from "./revision";
import { claveProblema, type Estado, type ProblemaVista } from "../../revisar-fichas/tipos";

// Lo que ve la página: todos los problemas (los del feed y los de abrir cada ficha) y cómo va la revisión
async function vista(estado?: Estado) {
  const e = estado ?? await leerEstado();
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

// Una pasada que Vercel cortó a medias (se perdió la cadena de pasos) se retoma desde donde iba
async function retomar(req: NextRequest, e: Estado) {
  e.pasada!.actualizado = new Date().toISOString();
  await guardarEstado(e);
  const id = e.pasada!.id;
  after(() => lanzarPaso(req.nextUrl.origin, id));
}

export async function GET(req: NextRequest) {
  const e = await leerEstado();
  if (pasadaCortada(e)) await retomar(req, e);
  return NextResponse.json(await vista(e));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action !== "revisar") return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });

  const e = await leerEstado();
  if (pasadaEnCurso(e)) return NextResponse.json(await vista(e));
  if (pasadaCortada(e)) { await retomar(req, e); return NextResponse.json(await vista(e)); }
  e.pasada = nuevaPasada("manual");
  await guardarEstado(e);

  // Se arranca la cadena de pasos (la misma que lanza Vercel Cron cada mañana)
  const id = e.pasada.id;
  after(() => lanzarPaso(req.nextUrl.origin, id));
  return NextResponse.json(await vista(e));
}
