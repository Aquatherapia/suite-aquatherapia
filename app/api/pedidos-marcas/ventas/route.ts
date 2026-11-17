import { NextRequest, NextResponse } from "next/server";

// Histórico de ventas para los pedidos a las marcas, en Vercel KV:
// - «pm-hist-productos»: hash clave del producto → { e, n, p, m, d: { AAAAMMDD: unidades } }
// - «pm-hist-pedidos»: hash ID del pedido → AAAAMMDD (para no contar dos veces un pedido que sale en dos informes)
// Así, cada día basta con subir el informe corto: lo nuevo se suma a lo guardado.
const PRODUCTOS = "pm-hist-productos";
const PEDIDOS = "pm-hist-pedidos";
const DIAS_GUARDADOS = 200;

type HistProducto = { e: string; n: string; p: string; m: string; d: Record<string, number> };
type Linea = { k: string; e: string; n: string; p: string; m: string; q: number };

export const maxDuration = 60;

async function kv() {
  return (await import("@vercel/kv")).kv;
}

const hoyMenos = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
const txt = (v: unknown, n: number) => String(v ?? "").slice(0, n);

async function leer() {
  const db = await kv();
  const [productos, pedidos] = await Promise.all([
    db.hgetall<Record<string, HistProducto>>(PRODUCTOS),
    db.hgetall<Record<string, string | number>>(PEDIDOS),
  ]);
  const dias = Object.values(pedidos ?? {}).map(String).sort();
  return {
    productos: (productos ?? {}) as Record<string, HistProducto>,
    ids: Object.keys(pedidos ?? {}),
    desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "", pedidos: dias.length,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await leer());
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer el histórico de ventas: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}

// POST { pedidos: { [id]: { dia: "AAAAMMDD", lineas: Linea[] } } }  (solo los que aún no están guardados)
// POST { accion: "borrar" }  vacía el histórico
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    const db = await kv();
    if (b.accion === "borrar") {
      await db.del(PRODUCTOS, PEDIDOS);
      return NextResponse.json(await leer());
    }
    const entrada = (b.pedidos && typeof b.pedidos === "object" ? b.pedidos : {}) as Record<string, { dia: string; lineas: Linea[] }>;
    const ids = Object.keys(entrada).slice(0, 20000);
    const minimo = hoyMenos(DIAS_GUARDADOS);
    // Quita los que ya están guardados (por si dos personas suben el mismo informe a la vez)
    const ya = new Set<string>();
    for (let i = 0; i < ids.length; i += 1000) {
      const trozo = ids.slice(i, i + 1000);
      const r = (await db.hmget<Record<string, string>>(PEDIDOS, ...trozo)) ?? {};
      for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) ya.add(k);
    }
    const suma: Record<string, Omit<HistProducto, "d"> & { d: Record<string, number> }> = {};
    const nuevos: Record<string, string> = {};
    for (const id of ids) {
      const ped = entrada[id];
      const dia = txt(ped?.dia, 8);
      if (ya.has(id) || !/^\d{8}$/.test(dia) || dia < minimo || !Array.isArray(ped.lineas)) continue;
      nuevos[txt(id, 40)] = dia;
      for (const l of ped.lineas.slice(0, 200)) {
        const k = txt(l.k, 300);
        const q = Number(l.q);
        if (!k || !(q > 0)) continue;
        const s = (suma[k] ??= { e: txt(l.e, 40), n: txt(l.n, 300), p: txt(l.p, 120), m: txt(l.m, 120), d: {} });
        s.d[dia] = (s.d[dia] ?? 0) + q;
      }
    }
    const claves = Object.keys(suma);
    for (let i = 0; i < claves.length; i += 300) {
      const trozo = claves.slice(i, i + 300);
      const antes = (await db.hmget<Record<string, HistProducto>>(PRODUCTOS, ...trozo)) ?? {};
      const escribir: Record<string, HistProducto> = {};
      for (const k of trozo) {
        const a = antes[k];
        const d: Record<string, number> = {};
        for (const [dia, n] of Object.entries(a?.d ?? {})) if (dia >= minimo) d[dia] = n;
        for (const [dia, n] of Object.entries(suma[k].d)) d[dia] = (d[dia] ?? 0) + n;
        escribir[k] = { ...suma[k], d };
      }
      await db.hset(PRODUCTOS, escribir);
    }
    const idsNuevos = Object.keys(nuevos);
    for (let i = 0; i < idsNuevos.length; i += 2000) {
      await db.hset(PEDIDOS, Object.fromEntries(idsNuevos.slice(i, i + 2000).map(k => [k, nuevos[k]])));
    }
    return NextResponse.json({ ...(await leer()), añadidos: idsNuevos.length });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo guardar el histórico de ventas: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
