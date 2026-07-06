import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Vercel Hobby permite hasta 60s (gratis). Leer las fichas de una marca
// puede tardar más de los 10s por defecto, así que lo subimos.
export const maxDuration = 60;

const CONFIG_PATH = path.join(process.cwd(), "data", "comparar-precios-config.json");
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const KV_KEY = "comparar-precios-config";

const MI_WEB = "https://www.latiendadecosmeticos.com";
const SITEMAP = `${MI_WEB}/sitemap.xml`;

// Palabras que indican pack/lote: se excluyen de la comparación de precios
const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "box", "programa", "rutina"];

type Marca = {
  nombre: string;
  slug: string;    // colección en cosmeticos24h (/collections/{slug})
  miToken: string; // texto que aparece en el slug de TUS URLs (normalmente = slug)
};

type Comparacion = {
  nombre: string;
  miPrecio: number;
  suPrecio: number;
  suPrecioTachado?: number;
  diff: number;        // miPrecio - suPrecio (positivo = tú más caro)
  confianza: number;   // 0-1, calidad del emparejamiento por nombre
  miUrl: string;
  suUrl: string;
};

type SoloEllos = {
  titulo: string;
  precio: number;
  url: string;
  esPack: boolean;
};

type ResultadoMarca = {
  marca: string;
  slug: string;
  error?: string;
  comparaciones: Comparacion[];
  soloEllos: SoloEllos[];
  misProductos: number;
  susProductos: number;
};

type Excluido = { suUrl: string; titulo: string };

type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  // Por marca (slug): productos de Cosméticos24h que el usuario ha ocultado a mano
  excluidos: Record<string, Excluido[]>;
};

function configVacia(): Config {
  return { marcas: [], ultimaRevision: null, resultados: [], excluidos: {} };
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<Config>(KV_KEY);
    if (!data) return configVacia();
    return { ...configVacia(), ...data, excluidos: data.excluidos ?? {} };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
    return {
      marcas: parsed.marcas ?? [],
      ultimaRevision: parsed.ultimaRevision ?? null,
      resultados: parsed.resultados ?? [],
      excluidos: parsed.excluidos ?? {},
    };
  } catch {
    return configVacia();
  }
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

// ── Emparejamiento por nombre ──────────────────────────────────────────
const STOP = new Set([
  "de", "la", "el", "los", "las", "para", "con", "sin", "y", "a", "en",
  "pack", "profesional", "prof", "ml", "spf",
]);

function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(s: string, tokenMarca: string): Set<string> {
  let t = normalizar(s).replace(/[^a-z0-9 ]/g, " ");
  t = t.replace(/\b\d+\s*ml\b/g, " ").replace(/\b\d+\s*spf\b/g, " ");
  const marcaToks = normalizar(tokenMarca).split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of t.split(/\s+/)) {
    if (!w || w.length < 3 || STOP.has(w) || marcaToks.includes(w) || /^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const UMBRAL = 0.34;

// ── Utilidades de red ──────────────────────────────────────────────────
async function fetchTexto(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Lee el precio (JSON-LD) de una ficha de la tienda propia
function precioDesdeHtml(html: string): number | null {
  const m = html.match(/"price":\s*"?([0-9]+\.?[0-9]*)/);
  return m ? parseFloat(m[1]) : null;
}

// Ejecuta tareas con concurrencia limitada
async function enLotes<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limite) {
    const lote = items.slice(i, i + limite);
    out.push(...await Promise.all(lote.map(fn)));
  }
  return out;
}

type MiProducto = { nombre: string; url: string; precio: number; tok: Set<string> };

// Enumera y lee los productos de una marca en la tienda propia
async function leerMisProductos(miToken: string, sitemapXml: string): Promise<MiProducto[]> {
  const tokLower = normalizar(miToken);
  const urls = new Set<string>();
  const re = /<loc>([^<]+-p\d+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sitemapXml)) !== null) {
    const url = m[1];
    const slug = url.split("/es/")[1] ?? "";
    if (normalizar(slug).includes(tokLower)) urls.add(url);
  }

  const lista = Array.from(urls).slice(0, 300); // cota de seguridad
  const productos = await enLotes(lista, 10, async (url): Promise<MiProducto | null> => {
    try {
      const html = await fetchTexto(url);
      const precio = precioDesdeHtml(html);
      if (precio === null) return null;
      const slug = (url.split("/es/")[1] ?? "").replace(/-p\d+$/, "");
      const nombre = slug.replace(/-/g, " ");
      return { nombre, url, precio, tok: tokens(nombre, miToken) };
    } catch {
      return null;
    }
  });
  return productos.filter((p): p is MiProducto => p !== null);
}

// ── Handlers ───────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  if (body.action === "addMarca") {
    const { nombre, slug, miToken } = body as { nombre: string; slug: string; miToken?: string };
    if (!config.marcas.find(x => x.slug === slug)) {
      config.marcas.push({ nombre, slug, miToken: (miToken || slug).trim() });
      await guardarConfig(config);
    }
    return NextResponse.json(config);
  }

  if (body.action === "deleteMarca") {
    config.marcas = config.marcas.filter(x => x.slug !== body.slug);
    config.resultados = config.resultados.filter(r => r.slug !== body.slug);
    delete config.excluidos[body.slug];
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Ocultar a mano un producto (p. ej. un match erróneo entre productos distintos)
  if (body.action === "excluir") {
    const { slug, suUrl, titulo } = body as { slug: string; suUrl: string; titulo: string };
    const lista = config.excluidos[slug] ?? [];
    if (!lista.some(e => e.suUrl === suUrl)) lista.push({ suUrl, titulo: titulo ?? suUrl });
    config.excluidos[slug] = lista;
    // Quitarlo también del resultado actual para que desaparezca sin re-revisar
    const r = config.resultados.find(x => x.slug === slug);
    if (r) {
      r.comparaciones = r.comparaciones.filter(c => c.suUrl !== suUrl);
      r.soloEllos = r.soloEllos.filter(s => s.url !== suUrl);
    }
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Volver a mostrar un producto oculto (reaparece en la siguiente revisión)
  if (body.action === "incluir") {
    const { slug, suUrl } = body as { slug: string; suUrl: string };
    config.excluidos[slug] = (config.excluidos[slug] ?? []).filter(e => e.suUrl !== suUrl);
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "revisar") {
    // La revisión es SIEMPRE marca a marca (una sola): evita esperas largas
    // y no satura la web propia. Sin slug se rechaza a propósito.
    if (!body.slug) {
      return NextResponse.json({ error: "Revisa las marcas de una en una (falta el slug de la marca)." }, { status: 400 });
    }
    const objetivo: Marca[] = config.marcas.filter(m => m.slug === body.slug);

    let sitemapXml = "";
    try {
      sitemapXml = await fetchTexto(SITEMAP);
    } catch (e) {
      return NextResponse.json({ error: `No se pudo leer el sitemap: ${e}` }, { status: 502 });
    }

    const nuevos: ResultadoMarca[] = [];
    for (const marca of objetivo) {
      try {
        const ocultos = new Set((config.excluidos[marca.slug] ?? []).map(e => e.suUrl));
        // 1) Sus productos (cosmeticos24h)
        const suUrl = `https://cosmeticos24h.com/collections/${marca.slug}/products.json?limit=250`;
        const suRes = await fetch(suUrl, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        if (!suRes.ok) {
          nuevos.push({ marca: marca.nombre, slug: marca.slug, error: `Cosméticos24h HTTP ${suRes.status}`, comparaciones: [], soloEllos: [], misProductos: 0, susProductos: 0 });
          continue;
        }
        const suData = await suRes.json();
        const suProds = (suData.products ?? []).filter((p: { handle: string }) =>
          !ocultos.has(`https://cosmeticos24h.com/products/${p.handle}`)
        ).map((p: {
          title: string; handle: string;
          variants?: { price?: string; compare_at_price?: string }[];
        }) => {
          const v = p.variants?.[0] ?? {};
          return {
            titulo: p.title as string,
            url: `https://cosmeticos24h.com/products/${p.handle}`,
            precio: parseFloat(v.price ?? "0"),
            tachado: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
            esPack: EXCLUIR.some(w => (p.title as string).toLowerCase().includes(w)),
            tok: tokens(p.title as string, marca.nombre),
          };
        });

        // 2) Mis productos (tienda propia)
        const mis = await leerMisProductos(marca.miToken, sitemapXml);

        // 3) Emparejar cada producto suyo con el mejor mío
        const comparaciones: Comparacion[] = [];
        const soloEllos: SoloEllos[] = [];
        const misUsados = new Set<number>();

        for (const s of suProds) {
          let mejor = -1, mejorJ = 0;
          for (let j = 0; j < mis.length; j++) {
            const jj = jaccard(s.tok, mis[j].tok);
            if (jj > mejorJ) { mejorJ = jj; mejor = j; }
          }
          if (mejorJ >= UMBRAL && mejor >= 0 && !s.esPack) {
            const mp = mis[mejor];
            misUsados.add(mejor);
            comparaciones.push({
              nombre: s.titulo,
              miPrecio: mp.precio,
              suPrecio: s.precio,
              suPrecioTachado: s.tachado,
              diff: Math.round((mp.precio - s.precio) * 100) / 100,
              confianza: Math.round(mejorJ * 100) / 100,
              miUrl: mp.url,
              suUrl: s.url,
            });
          } else {
            soloEllos.push({ titulo: s.titulo, precio: s.precio, url: s.url, esPack: s.esPack });
          }
        }

        // Tú más caro primero
        comparaciones.sort((a, b) => b.diff - a.diff);
        soloEllos.sort((a, b) => Number(a.esPack) - Number(b.esPack));

        nuevos.push({
          marca: marca.nombre, slug: marca.slug,
          comparaciones, soloEllos,
          misProductos: mis.length, susProductos: suProds.length,
        });
      } catch (e) {
        nuevos.push({ marca: marca.nombre, slug: marca.slug, error: String(e), comparaciones: [], soloEllos: [], misProductos: 0, susProductos: 0 });
      }
    }

    // Fusionar: reemplaza solo las marcas revisadas, conserva el resto
    const revisadas = new Set(nuevos.map(r => r.slug));
    config.resultados = [
      ...config.resultados.filter(r => !revisadas.has(r.slug)),
      ...nuevos,
    ];
    config.ultimaRevision = new Date().toISOString();
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
