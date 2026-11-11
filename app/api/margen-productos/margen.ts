// Lee el feed de nuestra web y guarda, de cada formato de producto, lo necesario para calcular su margen.
// El feed pesa más de 5 MB y tarda casi un minuto: se lee al pulsar «Actualizar» (o si no hay nada guardado)
// y se guarda comprimido (KV o data/margen-productos.json).
import fs from "fs/promises";
import path from "path";
import { gunzipSync, gzipSync } from "zlib";
import type { Datos, Fila } from "../../margen-productos/tipos";

const FEED = "https://www.latiendadecosmeticos.com/es/feed_detalles";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const KV_KEY = "margen-productos";
const RUTA = path.join(process.cwd(), "data", "margen-productos.json");

export async function leerGuardado(): Promise<Datos | null> {
  let z: string | null = null;
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    z = await kv.get<string>(KV_KEY);
  } else {
    try { z = await fs.readFile(RUTA, "utf-8"); } catch { z = null; }
  }
  return z ? JSON.parse(gunzipSync(Buffer.from(z, "base64")).toString("utf-8")) : null;
}

async function guardar(d: Datos) {
  const z = gzipSync(JSON.stringify(d)).toString("base64");
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, z);
    return;
  }
  await fs.mkdir(path.dirname(RUTA), { recursive: true });
  await fs.writeFile(RUTA, z);
}

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Marcas en mayúsculas en el feed («MARIA NILA») → «Maria Nila»
const marcaBonita = (m: string) => m === m.toUpperCase() ? m.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : m;

export async function actualizar(): Promise<Datos> {
  let r = await fetch(FEED, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(150_000) });
  if (r.status >= 500) {
    await new Promise(res => setTimeout(res, 5_000));
    r = await fetch(FEED, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(150_000) });
  }
  if (!r.ok) throw new Error(`El feed de la web respondió ${r.status}`);
  const lineas = (await r.text()).split(/\r?\n/);
  const cab = lineas[0].split("\t").map(c => c.trim().toLowerCase());
  const col = (k: string) => cab.indexOf(k);
  const i = { id: col("id"), marca: col("brand"), titulo: col("title"), ean: col("gtin"), pvp: col("price"), oferta: col("sale_price"), coste: col("precio_coste"), link: col("link"), stock: col("availability") };
  if (i.titulo < 0 || i.pvp < 0 || i.coste < 0) throw new Error("El feed de la web no tiene el formato esperado (falta el precio o el coste)");

  const vistos = new Set<string>();
  const filas: Fila[] = [];
  for (const l of lineas.slice(1)) {
    const c = l.split("\t");
    if (c.length < cab.length) continue;
    const id = c[i.id]?.trim() || `${c[i.link]}|${c[i.ean]}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const pvp = num(c[i.pvp]);
    const oferta = num(c[i.oferta]);
    const venta = oferta > 0 ? oferta : pvp;
    if (venta <= 0) continue; // regalos y muestras a 0 €: no tienen margen
    filas.push([
      marcaBonita((c[i.marca] ?? "").trim()) || "Sin marca",
      (c[i.titulo] ?? "").replace(/\s*®/g, "").replace(/\s+/g, " ").trim(),
      (c[i.ean] ?? "").trim(), pvp, venta, Math.max(0, num(c[i.coste])),
      (c[i.link] ?? "").trim(), (c[i.stock] ?? "").trim() === "in stock" ? 1 : 0,
    ]);
  }
  filas.sort((a, b) => a[0].localeCompare(b[0], "es") || a[1].localeCompare(b[1], "es"));
  const d: Datos = { fecha: new Date().toISOString(), filas };
  await guardar(d);
  return d;
}
