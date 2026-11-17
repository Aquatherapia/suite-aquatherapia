import { NextRequest, NextResponse } from "next/server";

// Últimos archivos subidos en «Pedidos a las marcas» (ventas y stock, ya leídos y recortados a las columnas que se usan),
// para que la lista siga ahí al recargar o desde otro ordenador. Se guardan por partes para no mandar demasiado de golpe.
// Hash: "ventas:meta" | "stock:meta" → { nombre, fecha, partes };  "ventas:0", "stock:0", "stock:1"… → filas
const CLAVE = "pedidos-marcas-archivos";
type Meta = { nombre: string; fecha: string; partes: number };

async function kv() {
  return (await import("@vercel/kv")).kv;
}

export const maxDuration = 30;

export async function GET() {
  try {
    const db = await kv();
    const out: Record<string, { nombre: string; fecha: string; filas: string[][] } | null> = { ventas: null, stock: null };
    for (const campo of ["ventas", "stock"] as const) {
      const meta = await db.hget<Meta>(CLAVE, `${campo}:meta`);
      if (!meta) continue;
      const partes = meta.partes > 0 ? ((await db.hmget<Record<string, string[][]>>(CLAVE, ...Array.from({ length: meta.partes }, (_, i) => `${campo}:${i}`))) ?? {}) : {};
      const filas = Array.from({ length: meta.partes }, (_, i) => partes[`${campo}:${i}`] ?? []).flat();
      out[campo] = { nombre: meta.nombre, fecha: meta.fecha, filas };
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `No se pudieron leer los archivos guardados: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}

// POST { campo: "ventas"|"stock", nombre, parte, partes, filas }  (la última parte escribe la meta y deja el archivo listo)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const campo = b.campo === "ventas" || b.campo === "stock" ? b.campo : "";
  const parte = Number(b.parte), partes = Number(b.partes);
  if (!campo || !Number.isInteger(parte) || !Number.isInteger(partes) || parte < 0 || partes < 1 || partes > 40 || parte >= partes || !Array.isArray(b.filas))
    return NextResponse.json({ error: "Datos del archivo no válidos" }, { status: 400 });
  const filas = (b.filas as unknown[]).slice(0, 5000).map(f => (Array.isArray(f) ? f.slice(0, 40).map(c => String(c ?? "").slice(0, 400)) : []));
  try {
    const db = await kv();
    await db.hset(CLAVE, { [`${campo}:${parte}`]: filas });
    if (parte === partes - 1) await db.hset(CLAVE, { [`${campo}:meta`]: { nombre: String(b.nombre ?? "").slice(0, 200), fecha: new Date().toISOString(), partes } satisfies Meta });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo guardar el archivo: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
