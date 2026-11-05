import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { emparejarPorNombre } from "./emparejar-nombre";
import { COMPETIDORES, type EstadoComp, type FilaComp, type ResultadoComp } from "../../comparar-competidores/competidores";
import { buscarListado, leerCompetidor, leerMisProductos, normalizarEan, type MiProducto, type SuProducto } from "./leer";

// Leer varias webs a la vez cabe de sobra, pero alguna puede ir lenta: Vercel Hobby permite hasta 300 s
export const maxDuration = 300;

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const KV_KEY = "comparar-competidores-config";
const CONFIG_PATH = path.join(process.cwd(), "data", "comparar-competidores-config.json");
// Las marcas son las del comparador de Cosméticos24h, y de su última revisión salen los precios de Cosméticos24h
const KV_KEY_C24 = "comparar-precios-config";
const CONFIG_PATH_C24 = path.join(process.cwd(), "data", "comparar-precios-config.json");

type Config = {
  // Por marca (slug) y competidor (id): listado de la marca en su web ("" = no la vende)
  enlaces: Record<string, Record<string, string>>;
  // Por marca (slug) y competidor: el enlace se encontró solo (no lo ha puesto nadie a mano)
  auto: Record<string, Record<string, boolean>>;
  resultados: Record<string, ResultadoComp>;
};

type MarcaC24 = { nombre: string; slug: string; miToken?: string };
type ComparacionC24 = { miUrl: string; suUrl: string; nombre: string; suPrecio: number; suPvp?: number; ean?: string; porEan?: boolean; porParecido?: "referencia" | "nombre" };
type ConfigC24 = { marcas: MarcaC24[]; resultados: { slug: string; revisadoEn?: string; comparaciones: ComparacionC24[] }[] };

const vacia = (): Config => ({ enlaces: {}, auto: {}, resultados: {} });

async function leerJson<T>(clave: string, ruta: string): Promise<T | null> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<T>(clave)) ?? null;
  }
  try { return JSON.parse(await fs.readFile(ruta, "utf-8")); } catch { return null; }
}

async function leerConfig(): Promise<Config> {
  return { ...vacia(), ...(await leerJson<Config>(KV_KEY, CONFIG_PATH)) };
}

async function guardarConfig(config: Config) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, config);
    return;
  }
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function leerC24(): Promise<ConfigC24> {
  const c = await leerJson<ConfigC24>(KV_KEY_C24, CONFIG_PATH_C24);
  return { marcas: c?.marcas ?? [], resultados: c?.resultados ?? [] };
}

// Lo que ve la página: la configuración y la lista de marcas
async function respuesta(config: Config) {
  const c24 = await leerC24();
  return NextResponse.json({ ...config, marcas: c24.marcas.map(m => ({ nombre: m.nombre, slug: m.slug })) });
}

export async function GET() {
  return respuesta(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  // Enlace del listado de una marca en un competidor, puesto a mano ("" = no la vende)
  if (body.action === "enlace") {
    const { slug, comp, url } = body as { slug: string; comp: string; url: string };
    const limpio = (url ?? "").trim();
    if (limpio && !/^https?:\/\//.test(limpio)) return NextResponse.json({ error: "El enlace tiene que empezar por https://" });
    config.enlaces[slug] = { ...(config.enlaces[slug] ?? {}), [comp]: limpio };
    config.auto[slug] = { ...(config.auto[slug] ?? {}), [comp]: false };
    await guardarConfig(config);
    return respuesta(config);
  }

  if (body.action === "revisar") {
    const inicio = Date.now();
    const limite = inicio + 200_000;
    const c24 = await leerC24();
    const marca = c24.marcas.find(m => m.slug === body.slug);
    if (!marca) return NextResponse.json({ error: "Esa marca no está en el comparador de Cosméticos24h" });

    let mios: MiProducto[];
    try { mios = (await leerMisProductos(marca)).filter(m => !m.esPack); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }); }
    if (!mios.length) return NextResponse.json({ error: `No hay productos de ${marca.nombre} en el feed de nuestra web` });

    const filas: FilaComp[] = mios.map(m => ({ nombre: m.nombre, url: m.url, ean: m.ean ?? undefined, formato: m.formato, precio: m.precio, pvp: m.pvp, precios: {} }));
    const filaDe = new Map(mios.map((m, i) => [m.clave, filas[i]]));
    const enlaces = { ...(config.enlaces[marca.slug] ?? {}) };
    const auto = { ...(config.auto[marca.slug] ?? {}) };
    const estados: Record<string, EstadoComp> = {};

    // Cosméticos24h: de la última revisión de su comparador (ya emparejada por EAN o por parecido)
    const r24 = c24.resultados.find(r => r.slug === marca.slug);
    if (r24) {
      let n = 0;
      for (const c of r24.comparaciones) {
        const ean = normalizarEan(c.ean);
        const m = (ean && mios.find(x => x.ean === ean)) || mios.filter(x => x.url === c.miUrl).length === 1 && mios.find(x => x.url === c.miUrl) || null;
        if (!m || !c.suPrecio) continue;
        filaDe.get(m.clave)!.precios.c24 = { precio: c.suPrecio, pvp: c.suPvp && c.suPvp > c.suPrecio + 0.005 ? c.suPvp : undefined, url: c.suUrl, titulo: c.nombre, por: c.porParecido ?? "ean" };
        n++;
      }
      estados.c24 = { url: `https://cosmeticos24h.com/collections/${marca.slug}`, leidos: r24.comparaciones.length, emparejados: n };
    } else {
      estados.c24 = { error: "Revisa antes la marca en el comparador de Cosméticos24h" };
    }

    // El resto: se leen todos a la vez
    await Promise.all(COMPETIDORES.filter(c => c.tipo !== "c24").map(async comp => {
      try {
        // Sin enlace todavía: se busca el listado de la marca en su web
        if (enlaces[comp.id] === undefined) {
          const encontrado = await buscarListado(comp, marca);
          enlaces[comp.id] = encontrado ?? "";
          auto[comp.id] = true;
        }
        const enlace = enlaces[comp.id];
        if (!enlace) { estados[comp.id] = { url: "" , auto: auto[comp.id] }; return; }
        const suyos = await leerCompetidor(comp, enlace, limite);
        estados[comp.id] = { url: enlace, auto: auto[comp.id], leidos: suyos.length, emparejados: emparejar(comp.id, suyos, mios, filaDe, marca) };
      } catch (e) {
        estados[comp.id] = { url: enlaces[comp.id], auto: auto[comp.id], error: e instanceof Error ? e.message : String(e) };
      }
    }));

    config.enlaces[marca.slug] = enlaces;
    config.auto[marca.slug] = auto;
    config.resultados[marca.slug] = { revisadoEn: new Date().toISOString(), filas, competidores: estados, c24RevisadoEn: r24?.revisadoEn };
    await guardarConfig(config);
    return respuesta(config);
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}

// Empareja los productos de un competidor con los nuestros: primero por EAN y, lo que quede, por referencia o nombre. Devuelve cuántos de los nuestros han encontrado pareja.
function emparejar(comp: string, suyos: SuProducto[], mios: MiProducto[], filaDe: Map<string, FilaComp>, marca: MarcaC24): number {
  const usados = new Set<string>();
  const suyosUsados = new Set<string>();
  const poner = (m: MiProducto, s: SuProducto, i: number, por: "ean" | "referencia" | "nombre") => {
    const v = s.variantes[i];
    filaDe.get(m.clave)!.precios[comp] = { precio: v.precio, pvp: v.pvp && v.pvp > v.precio + 0.005 ? v.pvp : undefined, url: s.url, titulo: v.titulo ? `${s.titulo} · ${v.titulo}` : s.titulo, por };
    usados.add(m.clave); suyosUsados.add(`${s.url}#${i}`);
  };
  const porEan = new Map(mios.filter(m => m.ean).map(m => [m.ean!, m]));
  for (const s of suyos) s.variantes.forEach((v, i) => {
    const m = v.ean ? porEan.get(v.ean) : undefined;
    if (m && !usados.has(m.clave)) poner(m, s, i, "ean");
  });
  const libres = suyos.filter(s => s.variantes.some((_, i) => !suyosUsados.has(`${s.url}#${i}`)));
  for (const p of emparejarPorNombre(libres, mios.filter(m => !usados.has(m.clave)), { nombre: marca.nombre, slug: marca.slug, miToken: marca.miToken ?? marca.slug })) {
    if (usados.has(p.mp.clave) || suyosUsados.has(`${p.s.url}#${p.i}`)) continue;
    poner(p.mp, p.s, p.i, p.por);
  }
  return usados.size;
}
