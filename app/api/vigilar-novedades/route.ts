import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

type Marca = {
  id: string;
  nombre: string;
  url: string;
};

type Producto = {
  titulo: string;
  url: string;
  imagenUrl?: string;
  precio?: number;
  nuevo: boolean;
  created?: string; // fecha de alta (solo Shopify)
};

type ResultadoMarca = {
  marcaId: string;
  nombre: string;
  url: string;
  total: number;
  nuevos: number;
  productos: Producto[]; // solo los nuevos (para mostrar)
  error?: string;
};

type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  previos: Record<string, string[]>; // marcaId -> URLs vistas alguna vez
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
    return (await kv.get<Config>("vigilar-novedades-config")) ?? configVacia();
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  try {
    return JSON.parse(
      await fs.readFile(path.join(process.cwd(), "data", "vigilar-novedades-config.json"), "utf-8")
    );
  } catch {
    return configVacia();
  }
}

async function guardarConfig(config: Config) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set("vigilar-novedades-config", config);
    return;
  }
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const p = path.join(process.cwd(), "data", "vigilar-novedades-config.json");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(config, null, 2));
}

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9",
};

function absolutizar(href: string, base: string): string {
  if (!href) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── Shopify: lista TODOS los productos vía products.json (incluye fecha de alta) ──
async function scrapeShopifyAll(url: string): Promise<Producto[]> {
  const base = url.replace(/\/products\.json.*$/, "").replace(/\/$/, "");
  const apiUrl = base + "/products.json?limit=250";
  const res = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const origin = new URL(url).origin;
  const productos: Producto[] = [];
  for (const p of data.products ?? []) {
    const precio = parseFloat(p.variants?.[0]?.price ?? "0") || undefined;
    productos.push({
      titulo: p.title as string,
      url: `${origin}/products/${p.handle}`,
      imagenUrl: p.images?.[0]?.src ?? undefined,
      precio,
      nuevo: false,
      created: p.created_at || p.published_at,
    });
  }
  // Más recientes primero (si hay fecha)
  productos.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
  return productos;
}

// ── Genérico (Woo / PrestaShop / temas comunes): extrae TODOS los productos ──
function scrapeHTML(root: ReturnType<typeof parse>, base: string): Producto[] {
  const cards = root.querySelectorAll(
    "li.product, .type-product, .js-product-miniature, article.product-miniature, .product-item, .product-card, [class*='product-miniature'], [class*='product-item']"
  );
  const result: Producto[] = [];
  const vistos = new Set<string>();
  for (const card of cards) {
    const a = card.querySelector("a[href]");
    const href = a?.getAttribute("href");
    if (!href) continue;
    const abs = absolutizar(href, base);
    if (vistos.has(abs)) continue;
    const titulo =
      card
        .querySelector(
          "h2, h3, h4, .product-name, .product-title, .product-miniature__name, .woocommerce-loop-product__title, [class*='title'], [class*='name']"
        )
        ?.text.trim() ||
      a?.getAttribute("title")?.trim() ||
      a?.text.trim() ||
      "";
    if (!titulo) continue;
    vistos.add(abs);
    const img = card.querySelector("img");
    const imagenUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || undefined;
    const priceEl = card.querySelector(".price, .product-price, [class*='price']");
    const precio = priceEl ? parsePrice(priceEl.text) || undefined : undefined;
    result.push({
      titulo,
      url: abs,
      imagenUrl: imagenUrl ? absolutizar(imagenUrl, base) : undefined,
      precio,
      nuevo: false,
    });
  }
  return result;
}

async function scrapeProductos(url: string): Promise<Producto[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (html.includes("cdn.shopify.com") || html.includes("Shopify.theme")) {
    return scrapeShopifyAll(url);
  }
  return scrapeHTML(parse(html), url);
}

export async function GET() {
  return NextResponse.json(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  if (body.action === "addMarca") {
    config.marcas.push({
      id: Date.now().toString(),
      nombre: String(body.nombre || "").trim(),
      url: String(body.url || "").trim(),
    });
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "deleteMarca") {
    config.marcas = config.marcas.filter((m) => m.id !== body.marcaId);
    config.resultados = config.resultados.filter((r) => r.marcaId !== body.marcaId);
    delete config.previos[body.marcaId];
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "revisar") {
    const nuevasPrevias: Record<string, string[]> = {};

    const resultados = await Promise.all(
      config.marcas.map(async (marca): Promise<ResultadoMarca> => {
        const previos = config.previos[marca.id] ?? [];
        const esPrimera = previos.length === 0;
        // En la primera revisión no hay con qué comparar: si la web da fecha de
        // alta (Shopify), mostramos los añadidos en los últimos 45 días.
        const hace45 = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
        try {
          const productos = await scrapeProductos(marca.url);
          const setPrevios = new Set(previos);
          const marcados = productos.map((p) => ({
            ...p,
            nuevo: esPrimera
              ? !!p.created && p.created >= hace45
              : !setPrevios.has(p.url),
          }));
          // Guardar la unión de todas las URLs vistas (para no re-marcar)
          const union = new Set(previos);
          for (const p of productos) union.add(p.url);
          nuevasPrevias[marca.id] = [...union];

          const nuevos = marcados.filter((p) => p.nuevo);
          return {
            marcaId: marca.id,
            nombre: marca.nombre,
            url: marca.url,
            total: productos.length,
            nuevos: nuevos.length,
            productos: nuevos, // solo los nuevos para mostrar
          };
        } catch (e) {
          nuevasPrevias[marca.id] = previos;
          return {
            marcaId: marca.id,
            nombre: marca.nombre,
            url: marca.url,
            total: 0,
            nuevos: 0,
            productos: [],
            error: String(e),
          };
        }
      })
    );

    config.ultimaRevision = new Date().toISOString();
    config.resultados = resultados;
    config.previos = { ...config.previos, ...nuevasPrevias };
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
