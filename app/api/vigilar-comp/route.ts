import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "box", "programa"];

type Plataforma = "shopify" | "prestashop" | "woocommerce";

type EntradaConfig = {
  id: string;
  competidor: string;
  url: string;
  plataforma: Plataforma;
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

type ResultadoEntrada = {
  id: string;
  competidor: string;
  url: string;
  descuentos: Descuento[];
  error?: string;
};

type Config = {
  entradas: EntradaConfig[];
  ultimaRevision: string | null;
  resultados: ResultadoEntrada[];
  previos: Record<string, Record<string, number>>;
};

function configVacia(): Config {
  return { entradas: [], ultimaRevision: null, resultados: [], previos: {} };
}

function parsePrice(str: string): number {
  const cleaned = str.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<Config>("vigilar-comp-config");
    return data ?? configVacia();
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const CONFIG_PATH = path.join(process.cwd(), "data", "vigilar-comp-config.json");
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return configVacia();
  }
}

async function guardarConfig(config: Config) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set("vigilar-comp-config", config);
    return;
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const CONFIG_PATH = path.join(process.cwd(), "data", "vigilar-comp-config.json");
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9",
};

async function scrapeShopify(url: string): Promise<Descuento[]> {
  const base = url.replace(/\/products\.json.*$/, "").replace(/\/$/, "");
  const apiUrl = base + "/products.json?limit=250";
  const res = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const origin = new URL(url).origin;
  const descuentos: Descuento[] = [];

  for (const product of data.products ?? []) {
    const titulo = product.title as string;
    if (EXCLUIR.some(e => titulo.toLowerCase().includes(e))) continue;
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
      descuentos.push({
        titulo, precio: mejorPrecio, precioOriginal: mejorOriginal, descuento: mejorPct,
        url: `${origin}/products/${product.handle}`, nuevo: false,
        imagenUrl: product.images?.[0]?.src ?? undefined,
      });
    }
  }
  return descuentos.sort((a, b) => b.descuento - a.descuento);
}

async function scrapePrestaShop(url: string): Promise<Descuento[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const root = parse(await res.text());
  const cards = root.querySelectorAll(".js-product-miniature, article.product-miniature");
  const descuentos: Descuento[] = [];

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

    if (!titulo || !productUrl) continue;
    if (EXCLUIR.some(e => titulo.toLowerCase().includes(e))) continue;
    descuentos.push({ titulo, precio, precioOriginal: original, descuento: pct, url: productUrl, nuevo: false, imagenUrl });
  }
  return descuentos.sort((a, b) => b.descuento - a.descuento);
}

async function scrapeWooCommerce(url: string): Promise<Descuento[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const root = parse(await res.text());
  const cards = root.querySelectorAll("li.product, .type-product");
  const descuentos: Descuento[] = [];

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

    if (!titulo || !productUrl) continue;
    if (EXCLUIR.some(e => titulo.toLowerCase().includes(e))) continue;
    descuentos.push({ titulo, precio, precioOriginal: original, descuento: pct, url: productUrl, nuevo: false, imagenUrl });
  }
  return descuentos.sort((a, b) => b.descuento - a.descuento);
}

export async function GET() {
  return NextResponse.json(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  if (body.action === "addEntrada") {
    const { competidor, url, plataforma } = body;
    config.entradas.push({ id: Date.now().toString(), competidor, url: url.trim(), plataforma });
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "deleteEntrada") {
    config.entradas = config.entradas.filter(e => e.id !== body.id);
    config.resultados = config.resultados.filter(r => r.id !== body.id);
    delete config.previos[body.id];
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "revisar") {
    const resultados: ResultadoEntrada[] = [];
    const nuevasPrevias: Record<string, Record<string, number>> = {};

    for (const entrada of config.entradas) {
      const previos = config.previos[entrada.id] ?? {};
      try {
        let descuentos: Descuento[] = [];
        if (entrada.plataforma === "shopify") descuentos = await scrapeShopify(entrada.url);
        else if (entrada.plataforma === "prestashop") descuentos = await scrapePrestaShop(entrada.url);
        else if (entrada.plataforma === "woocommerce") descuentos = await scrapeWooCommerce(entrada.url);

        descuentos = descuentos.map(d => ({
          ...d,
          nuevo: previos[d.url] === undefined || previos[d.url] !== d.descuento,
        }));

        nuevasPrevias[entrada.id] = Object.fromEntries(descuentos.map(d => [d.url, d.descuento]));
        resultados.push({ id: entrada.id, competidor: entrada.competidor, url: entrada.url, descuentos });
      } catch (e) {
        resultados.push({ id: entrada.id, competidor: entrada.competidor, url: entrada.url, descuentos: [], error: String(e) });
        nuevasPrevias[entrada.id] = previos;
      }
    }

    config.ultimaRevision = new Date().toISOString();
    config.resultados = resultados;
    config.previos = nuevasPrevias;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
