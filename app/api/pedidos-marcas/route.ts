import { NextRequest, NextResponse } from "next/server";

// Seguimiento de los pedidos a las marcas: un estado por producto (esperando, llegó mal, no enviaron el correcto).
// Al marcar «recibido» se borra. Se guarda en Vercel KV, en un hash: id del producto → datos.
const CLAVE = "pedidos-marcas-seguimiento";
const ESTADOS = ["esperando", "mal", "incorrecto"];

export type Seguimiento = { estado: string; fecha: string; marca: string; producto: string; propiedad: string; ean: string };

async function kv() {
  return (await import("@vercel/kv")).kv;
}

async function todos() {
  return ((await (await kv()).hgetall<Record<string, Seguimiento>>(CLAVE)) ?? {}) as Record<string, Seguimiento>;
}

export async function GET() {
  try {
    return NextResponse.json({ seguimiento: await todos() });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer el seguimiento: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}

// POST { cambios: [{ id, estado: "esperando"|"mal"|"incorrecto"|"recibido"|null, marca, producto, propiedad, ean }] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cambios: (Partial<Seguimiento> & { id?: string })[] = Array.isArray(body.cambios) ? body.cambios.slice(0, 500) : [];
  if (!cambios.length) return NextResponse.json({ error: "No hay cambios" }, { status: 400 });
  try {
    const db = await kv();
    const poner: Record<string, Seguimiento> = {};
    const quitar: string[] = [];
    for (const c of cambios) {
      const id = String(c.id ?? "").slice(0, 300);
      if (!id) continue;
      if (c.estado && ESTADOS.includes(c.estado)) {
        poner[id] = {
          estado: c.estado, fecha: new Date().toISOString(),
          marca: String(c.marca ?? "").slice(0, 120), producto: String(c.producto ?? "").slice(0, 300),
          propiedad: String(c.propiedad ?? "").slice(0, 120), ean: String(c.ean ?? "").slice(0, 40),
        };
      } else quitar.push(id); // «recibido» o sin estado: fuera del seguimiento
    }
    if (Object.keys(poner).length) await db.hset(CLAVE, poner);
    if (quitar.length) await db.hdel(CLAVE, ...quitar);
    return NextResponse.json({ seguimiento: await todos() });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
