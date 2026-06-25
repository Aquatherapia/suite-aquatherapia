import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "box", "programa"];

type EntradaCompetidor = {
  id: string;
  nombre: string;
  url: string;
};

type Marca = {
  id: string;
  nombre: string;
  competidores: EntradaCompetidor[];
};

type Descuento = {
  titulo: string;
  precio: number;
  precioOriginal: number;
  descuento: number;
  url: string;
  nuevo: boolean;
  imagenUrl?: string;
};

type ResultadoCompetidor = {
  compId: string;
  nombre: string;
  url: string;
  descuentos: Descuento[];
  error?: string;
};

type ResultadoMarca = {
  marcaId: string;
  nombre: string;
  competidores: ResultadoCompetidor[];
};

type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  previos: Record<string, Record<string, number>>;
};

function configVacia(): Config {
  return { marcas: [], ultimaRevision: null, resultados: [], previos: {} };
}

function parsePrice(str: string): number {
  const cleaned = str.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<Config>("vigilar-comp-config")) ?? configVacia();
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "vigilar-comp-config.json"), "utf-8"));
  } catch { return configVacia(); }
}

async function guardarConfig(config: Config) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set("vigilar-comp-config", config);
    return;
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const p = path.join(process.cwd(), "data", "vigilar-comp-config.json");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(config, null, 2));
}

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9",
};

function filtrar(titulo: string) {
  return EXCLUIR.some(e => titulo.toLowerCase().includes(e));
}

function extraerWooCommerce(root: ReturnType<typeof parse>): Descuento[] {
  const cards = root.querySelectorAll("li.product, .type-product");
  const result: Descuento[] = [];
  for (const card of cards) {
    const insEl = card.querySelector("ins bdi, ins .woocommerce-Price-amount");
    const delEl = card.querySelector("del bdi, del .woocommerce-Price-amount");
    if (!insEl || !delEl) continue;
    const precio = parsePrice(insEl.text);
    const original = parsePrice(delEl.text);
    if (original <= precio || precio <= 0) continue;
    const pct = Math.round((1 - precio / original) * 100);
    if (pct <= 0) continue;
    const titulo = card.querySelector(".woocommerce-loop-product__title, h2, h3")?.text.trim() ?? "";
    const productUrl = card.querySelector("a.woocommerce-LoopProduct-link, a[href]")?.getAttribute("href") ?? "";
    const imgEl = card.querySelector("img");
    const imagenUrl = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || undefined;
    if (!titulo || !productUrl || filtrar(titulo)) continue;
    result.push({ titulo, precio, precioOriginal: original, descuento: pct, url: productUrl, nuevo: false, imagenUrl });
  }
  return result;
}

function extraerPrestaShop(root: ReturnType<typeof parse>): Descuento[] {
  const cards = root.querySelectorAll(".js-product-miniature, article.product-miniature");
  const result: Descuento[] = [];
  for (const card of cards) {
    const priceEl = card.querySelector(".product-miniature__price, .price");
    const regularEl = card.querySelector(".product-miniature__regular-price, .regular-price");
    if (!priceEl || !regularEl) continue;
    const precio = parsePrice(priceEl.text);
    const original = parsePrice(regularEl.text);
    if (original <= precio || precio <= 0 || original <= 0) continue;
    const pct = Math.round((1 - precio / original) * 100);
    if (pct <= 0) continue;
    const titulo = card.querySelector(".product-miniature__name, .product-title, h2, h3")?.text.trim() ?? "";
    const productUrl = card.querySelector("a.product-miniature__link, a[href]")?.getAttribute("href") ?? "";
    const imgEl = card.querySelector("img");
    const imagenUrl = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || undefined;
    if (!titulo || !productUrl || filtrar(titulo)) continue;
    result.push({ titulo, precio, precioOriginal: original, descuento: pct, url: productUrl, nuevo: false, imagenUrl });
  }
  return result;
}

function extraerGenerico(root: ReturnType<typeof parse>): Descuento[] {
  // Tries common sale/regular price patterns used by many e-commerce themes
  const result: Descuento[] = [];
  const cards = root.querySelectorAll(
    ".product-item, .product-card, .product, [class*='product-'], article[class*='product']"
  );
  for (const card of cards) {
    // Try sale+original selector variants
    const saleEl = card.querySelector(
      ".sale-price, .price-sale, .special-price, [class*='sale-price'], [class*='price--sale'], ins"
    );
    const origEl = card.querySelector(
      ".regular-price, .old-price, .price-old, .original-price, [class*='old-price'], [class*='price--regular'], del, s, strike"
    );
    if (!saleEl || !origEl) continue;
    const precio = parsePrice(saleEl.text);
    const original = parsePrice(origEl.text);
    if (original <= precio || precio <= 0 || original <= 0) continue;
    const pct = Math.round((1 - precio / original) * 100);
    if (pct <= 0 || pct > 90) continue;
    const titulo = card.querySelector("h2, h3, h4, .product-name, .product-title, [class*='title']")?.text.trim() ?? "";
    const productUrl = card.querySelector("a[href]")?.getAttribute("href") ?? "";
    const imgEl = card.querySelector("img");
    const imagenUrl = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || undefined;
    if (!titulo || !productUrl || filtrar(titulo)) continue;
    result.push({ titulo, precio, precioOriginal: original, descuento: pct, url: productUrl, nuevo: false, imagenUrl });
  }
  return result;
}

async function scrapeShopify(url: string): Promise<Descuento[]> {
  const base = url.replace(/\/products\.json.*$/, "").replace(/\/$/, "");
  const apiUrl = base + "/products.json?limit=250";
  const res = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const origin = new URL(url).origin;
  const result: Descuento[] = [];
  for (const product of data.products ?? []) {
    const titulo = product.title as string;
    if (filtrar(titulo)) continue;
    let mejorPct = 0, mejorPrecio = 0, mejorOriginal = 0;
    for (const v of product.variants ?? []) {
      const precio = parseFloat(v.price ?? "0");
      const original = parseFloat(v.compare_at_price ?? "0");
      if (original > precio && precio > 0) {
        const pct = Math.round((1 - precio / original) * 100);
        if (pct > mejorPct) { mejorPct = pct; mejorPrecio = precio; mejorOriginal = original; }
      }
    }
    if (mejorPct > 0) {
      result.push({
        titulo, precio: mejorPrecio, precioOriginal: mejorOriginal, descuento: mejorPct,
        url: `${origin}/products/${product.handle}`, nuevo: false,
        imagenUrl: product.images?.[0]?.src ?? undefined,
      });
    }
  }
  return result.sort((a, b) => b.descuento - a.descuento);
}

async function scrapeUrl(url: string): Promise<Descuento[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Detect Shopify and use its JSON API
  if (html.includes("cdn.shopify.com") || html.includes("Shopify.theme")) {
    return scrapeShopify(url);
  }

  const root = parse(html);

  const woo = extraerWooCommerce(root);
  if (woo.length > 0) return woo.sort((a, b) => b.descuento - a.descuento);

  const ps = extraerPrestaShop(root);
  if (ps.length > 0) return ps.sort((a, b) => b.descuento - a.descuento);

  const gen = extraerGenerico(root);
  return gen.sort((a, b) => b.descuento - a.descuento);
}

export async function GET() {
  return NextResponse.json(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  if (body.action === "addMarca") {
    config.marcas.push({ id: Date.now().toString(), nombre: body.nombre, competidores: [] });
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "deleteMarca") {
    config.marcas = config.marcas.filter(m => m.id !== body.marcaId);
    config.resultados = config.resultados.filter(r => r.marcaId !== body.marcaId);
    for (const key of Object.keys(config.previos)) {
      if (key.startsWith(body.marcaId + "::")) delete config.previos[key];
    }
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "addCompetidor") {
    const marca = config.marcas.find(m => m.id === body.marcaId);
    if (marca) {
      marca.competidores.push({ id: Date.now().toString(), nombre: body.nombre, url: body.url.trim() });
      await guardarConfig(config);
    }
    return NextResponse.json(config);
  }

  if (body.action === "deleteCompetidor") {
    const marca = config.marcas.find(m => m.id === body.marcaId);
    if (marca) {
      marca.competidores = marca.competidores.filter(c => c.id !== body.compId);
      delete config.previos[`${body.marcaId}::${body.compId}`];
      await guardarConfig(config);
    }
    return NextResponse.json(config);
  }

  if (body.action === "revisar") {
    const resultados: ResultadoMarca[] = [];
    const nuevasPrevias: Record<string, Record<string, number>> = {};

    for (const marca of config.marcas) {
      const compResultados: ResultadoCompetidor[] = [];
      for (const comp of marca.competidores) {
        const key = `${marca.id}::${comp.id}`;
        const previos = config.previos[key] ?? {};
        try {
          let descuentos = await scrapeUrl(comp.url);
          descuentos = descuentos.map(d => ({
            ...d,
            nuevo: previos[d.url] === undefined || previos[d.url] !== d.descuento,
          }));
          nuevasPrevias[key] = Object.fromEntries(descuentos.map(d => [d.url, d.descuento]));
          compResultados.push({ compId: comp.id, nombre: comp.nombre, url: comp.url, descuentos });
        } catch (e) {
          compResultados.push({ compId: comp.id, nombre: comp.nombre, url: comp.url, descuentos: [], error: String(e) });
          nuevasPrevias[key] = previos;
        }
      }
      resultados.push({ marcaId: marca.id, nombre: marca.nombre, competidores: compResultados });
    }

    config.ultimaRevision = new Date().toISOString();
    config.resultados = resultados;
    config.previos = { ...config.previos, ...nuevasPrevias };
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
