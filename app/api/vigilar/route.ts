import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "vigilar-config.json");
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

type Marca = { nombre: string; slug: string };

type Descuento = {
  titulo: string;
  precio: number;
  precioOriginal: number;
  descuento: number;
  url: string;
  nuevo: boolean;
  imagenUrl?: string;
};

type ResultadoMarca = {
  marca: string;
  slug: string;
  error?: string;
  descuentos: Descuento[];
};

type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  urlsPrevias: Record<string, Record<string, number>>;
};

const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "box", "programa", "rutina"];

function configVacia(): Config {
  return { marcas: [], ultimaRevision: null, resultados: [], urlsPrevias: {} };
}

function normalizarPrevias(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return Object.fromEntries((raw as string[]).map(u => [u, -1]));
  return raw as Record<string, number>;
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<Config>("vigilar-config");
    return data ?? configVacia();
  }

  // Fallback: archivo local (desarrollo)
  try {
    const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
    let urlsPrevias: Record<string, Record<string, number>> = {};
    const rawUrls = parsed.urlsPrevias ?? {};
    if (rawUrls.cosmeticos24h) {
      for (const [slug, val] of Object.entries(rawUrls.cosmeticos24h as Record<string, unknown>)) {
        urlsPrevias[slug] = normalizarPrevias(val);
      }
    } else {
      for (const [slug, val] of Object.entries(rawUrls)) {
        urlsPrevias[slug] = normalizarPrevias(val);
      }
    }
    let resultados: ResultadoMarca[] = parsed.resultados ?? [];
    if (resultados.length > 0 && "porCompetidor" in resultados[0]) {
      resultados = resultados.map((r: { marca: string; slug: string; porCompetidor?: Record<string, { descuentos?: Descuento[]; error?: string }> }) => ({
        marca: r.marca, slug: r.slug,
        descuentos: r.porCompetidor?.cosmeticos24h?.descuentos ?? [],
        error: r.porCompetidor?.cosmeticos24h?.error,
      }));
    }
    return { marcas: parsed.marcas ?? [], ultimaRevision: parsed.ultimaRevision ?? null, resultados, urlsPrevias };
  } catch {
    return configVacia();
  }
}

async function guardarConfig(config: Config) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set("vigilar-config", config);
    return;
  }
  // Fallback: archivo local
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  return NextResponse.json(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  if (body.action === "addMarca") {
    const { nombre, slug } = body as { nombre: string; slug: string };
    if (!config.marcas.find(m => m.slug === slug)) {
      config.marcas.push({ nombre, slug });
      await guardarConfig(config);
    }
    return NextResponse.json(config);
  }

  if (body.action === "deleteMarca") {
    config.marcas = config.marcas.filter(m => m.slug !== body.slug);
    config.resultados = config.resultados.filter(r => r.slug !== body.slug);
    delete config.urlsPrevias[body.slug];
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "revisar") {
    const resultados: ResultadoMarca[] = [];
    const nuevasUrlsPrevias: Record<string, Record<string, number>> = {};

    for (const marca of config.marcas) {
      const prevSlug = config.urlsPrevias[marca.slug] ?? {};
      try {
        const url = `https://cosmeticos24h.com/collections/${marca.slug}/products.json?limit=250`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        if (!res.ok) {
          resultados.push({ marca: marca.nombre, slug: marca.slug, error: `HTTP ${res.status}`, descuentos: [] });
          nuevasUrlsPrevias[marca.slug] = prevSlug;
          continue;
        }
        const data = await res.json();
        const descuentos: Descuento[] = [];
        for (const product of data.products ?? []) {
          const titulo = product.title as string;
          if (EXCLUIR.some(p => titulo.toLowerCase().includes(p))) continue;
          let mejorPct = 0, mejorPrecio = 0, mejorOriginal = 0;
          for (const variant of product.variants ?? []) {
            const precio = parseFloat(variant.price ?? "0");
            const original = parseFloat(variant.compare_at_price ?? "0");
            if (original > precio && precio > 0) {
              const pct = Math.round((1 - precio / original) * 100);
              if (pct > mejorPct) { mejorPct = pct; mejorPrecio = precio; mejorOriginal = original; }
            }
          }
          if (mejorPct > 0) {
            const productUrl = `https://cosmeticos24h.com/products/${product.handle}`;
            const pctAnterior = prevSlug[productUrl];
            const imagenUrl = product.images?.[0]?.src ?? undefined;
            descuentos.push({
              titulo, precio: mejorPrecio, precioOriginal: mejorOriginal,
              descuento: mejorPct, url: productUrl,
              nuevo: pctAnterior === undefined || pctAnterior !== mejorPct,
              imagenUrl,
            });
          }
        }
        descuentos.sort((a, b) => b.descuento - a.descuento);
        nuevasUrlsPrevias[marca.slug] = Object.fromEntries(descuentos.map(d => [d.url, d.descuento]));
        resultados.push({ marca: marca.nombre, slug: marca.slug, descuentos });
      } catch (e) {
        resultados.push({ marca: marca.nombre, slug: marca.slug, error: String(e), descuentos: [] });
        nuevasUrlsPrevias[marca.slug] = prevSlug;
      }
    }

    config.ultimaRevision = new Date().toISOString();
    config.resultados = resultados;
    config.urlsPrevias = nuevasUrlsPrevias;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
