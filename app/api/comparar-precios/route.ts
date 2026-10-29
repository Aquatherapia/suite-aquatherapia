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
  esPack?: boolean;    // true si es un pack/estuche
  manual?: boolean;    // true si el enlace lo puso el usuario a mano
  verificado?: boolean; // true si el usuario ha confirmado a mano que es el mismo producto
  nombreEditado?: boolean; // true si el nombre mostrado lo ha escrito el usuario a mano
  porEan?: boolean;    // true si se emparejó por EAN (mismo código de barras en las dos webs)
  ean?: string;        // EAN con el que se emparejó
};

type SoloEllos = {
  titulo: string;
  precio: number;
  url: string;
  esPack: boolean;
};

// Producto MÍO que no se ha podido emparejar con ninguno suyo
type MiSinEmparejar = {
  nombre: string;
  url: string;
  precio: number;
  esPack: boolean;
};

type ResultadoMarca = {
  marca: string;
  slug: string;
  error?: string;
  comparaciones: Comparacion[];
  soloEllos: SoloEllos[];
  misSinEmparejar: MiSinEmparejar[];
  misProductos: number;
  susProductos: number;
  // Cuándo se revisó ESTA marca (la revisión es marca a marca).
  // Opcional: los resultados guardados antes de existir este campo no lo tienen.
  revisadoEn?: string;
  // Productos suyos cuyo EAN aún no se ha leído (se leen en la siguiente revisión)
  eanPendientes?: number;
};

type Excluido = {
  suUrl: string;
  titulo: string;
  tipo?: "comparacion" | "soloEllos"; // de dónde se ocultó
  miPrecio?: number;                   // si era comparación
  suPrecio?: number;                   // precio en Cosméticos24h
  miUrl?: string;                      // si era comparación
  motivo?: string;                     // por qué se ocultó (elegido por el usuario)
};

// Enlace manual: fuerza que TU producto (miUrl) se compare con el suyo (suUrl)
type Mapeo = { miUrl: string; suUrl: string };

// Nombre editado a mano por el usuario (guarda el original para poder restaurarlo)
type NombreManual = { suUrl: string; nombre: string; original: string };

type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  // Por marca (slug): productos de Cosméticos24h que el usuario ha ocultado a mano
  excluidos: Record<string, Excluido[]>;
  // Por marca (slug): enlaces manuales tuyo↔suyo (tienen prioridad sobre el automático)
  mapeos: Record<string, Mapeo[]>;
  // Por marca (slug): suUrl de los productos que el usuario ha comprobado a mano que son el mismo
  verificados: Record<string, string[]>;
  // Por marca (slug): nombres editados a mano (con el original para poder restaurarlo)
  nombres: Record<string, NombreManual[]>;
  // Caché de EAN de Cosméticos24h por suUrl ([] = leído y sin EAN válido).
  // Leer el EAN cuesta una petición por producto, así que se guarda y no se repite.
  eans: Record<string, string[]>;
};

function configVacia(): Config {
  return { marcas: [], ultimaRevision: null, resultados: [], excluidos: {}, mapeos: {}, verificados: {}, nombres: {}, eans: {} };
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<Config>(KV_KEY);
    if (!data) return configVacia();
    return { ...configVacia(), ...data, excluidos: data.excluidos ?? {}, mapeos: data.mapeos ?? {}, verificados: data.verificados ?? {}, nombres: data.nombres ?? {}, eans: data.eans ?? {} };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
    return {
      marcas: parsed.marcas ?? [],
      ultimaRevision: parsed.ultimaRevision ?? null,
      resultados: parsed.resultados ?? [],
      excluidos: parsed.excluidos ?? {},
      mapeos: parsed.mapeos ?? {},
      verificados: parsed.verificados ?? {},
      nombres: parsed.nombres ?? {},
      eans: parsed.eans ?? {},
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

// ── EAN ────────────────────────────────────────────────────────────────
// Se comparan sin ceros a la izquierda (así un UPC-12 casa con su EAN-13).
// Menos de 7 cifras no es un EAN: suele ser un código interno (p. ej. en packs).
function normalizarEan(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 7 && d.length <= 14 ? d : null;
}

// Lee el EAN (gtin13 del JSON-LD o del microdato) de una ficha de la tienda propia
function eanDesdeHtml(html: string): string | null {
  const m = html.match(/"gtin(?:8|12|13|14)?"\s*:\s*"(\d+)"/) ?? html.match(/itemprop="gtin(?:8|12|13|14)?"[^>]*>\s*(\d+)/);
  return m ? normalizarEan(m[1]) : null;
}

// Lee los EAN de los productos suyos que aún no están en la caché.
// Una petición por producto (el listado de la colección no trae el barcode),
// pocas a la vez y parando antes del límite de tiempo: lo que falte se lee en la siguiente revisión.
async function leerSusEans(urls: string[], cache: Record<string, string[]>, limiteMs: number): Promise<number> {
  const pendientes = urls.filter(u => !(u in cache));
  let cortado = false;
  for (let i = 0; i < pendientes.length && !cortado; i += 4) {
    if (Date.now() > limiteMs) break;
    await Promise.all(pendientes.slice(i, i + 4).map(async url => {
      try {
        const res = await fetch(`${url}.json`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        if (res.status === 429) { cortado = true; return; }
        if (!res.ok) return;
        const data = await res.json();
        const eans = (data.product?.variants ?? [])
          .map((v: { barcode?: string | null }) => normalizarEan(v.barcode))
          .filter((e: string | null): e is string => !!e);
        cache[url] = Array.from(new Set<string>(eans));
      } catch { /* se reintenta en la siguiente revisión */ }
    }));
  }
  return urls.filter(u => !(u in cache)).length;
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

type MiProducto = { nombre: string; url: string; precio: number; tok: Set<string>; esPack: boolean; ean: string | null };

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
      const esPack = EXCLUIR.some(w => nombre.toLowerCase().includes(w));
      return { nombre, url, precio, tok: tokens(nombre, miToken), esPack, ean: eanDesdeHtml(html) };
    } catch {
      return null;
    }
  });
  return productos.filter((p): p is MiProducto => p !== null);
}

type SuProducto = { titulo: string; url: string; precio: number; tachado?: number; esPack: boolean; tok: Set<string> };

// Lee los productos de una marca en Cosméticos24h (API Shopify pública)
async function leerSusProductos(slug: string, nombreMarca: string): Promise<SuProducto[] | { error: string }> {
  const url = `https://cosmeticos24h.com/collections/${slug}/products.json?limit=250`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!res.ok) return { error: `Cosméticos24h HTTP ${res.status}` };
  const data = await res.json();
  return (data.products ?? []).map((p: {
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
      tok: tokens(p.title as string, nombreMarca),
    };
  });
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
    delete config.mapeos[body.slug];
    delete config.verificados[body.slug];
    delete config.nombres[body.slug];
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Ocultar a mano un producto (p. ej. un match erróneo entre productos distintos)
  if (body.action === "excluir") {
    const { slug, item } = body as { slug: string; item: Excluido };
    if (!slug || !item?.suUrl) {
      return NextResponse.json({ error: "Faltan datos para ocultar el producto." }, { status: 400 });
    }
    const lista = config.excluidos[slug] ?? [];
    if (!lista.some(e => e.suUrl === item.suUrl)) {
      lista.push({ ...item, titulo: item.titulo ?? item.suUrl });
    }
    config.excluidos[slug] = lista;
    // Quitarlo también del resultado actual para que desaparezca sin re-revisar
    const r = config.resultados.find(x => x.slug === slug);
    if (r) {
      r.comparaciones = r.comparaciones.filter(c => c.suUrl !== item.suUrl);
      r.soloEllos = r.soloEllos.filter(s => s.url !== item.suUrl);
    }
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Cambiar el motivo por el que un producto está oculto
  if (body.action === "motivo") {
    const { slug, suUrl, motivo } = body as { slug: string; suUrl: string; motivo: string };
    const e = (config.excluidos[slug] ?? []).find(x => x.suUrl === suUrl);
    if (e) { e.motivo = motivo; await guardarConfig(config); }
    return NextResponse.json(config);
  }

  // Volver a mostrar un producto oculto (reaparece en la siguiente revisión)
  if (body.action === "incluir") {
    const { slug, suUrl } = body as { slug: string; suUrl: string };
    config.excluidos[slug] = (config.excluidos[slug] ?? []).filter(e => e.suUrl !== suUrl);
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Marcar a mano que el usuario ha comprobado que es el mismo producto
  if (body.action === "verificar") {
    const { slug, suUrl } = body as { slug: string; suUrl: string };
    if (!slug || !suUrl) return NextResponse.json({ error: "Faltan datos para verificar el producto." }, { status: 400 });
    const lista = config.verificados[slug] ?? [];
    if (!lista.includes(suUrl)) lista.push(suUrl);
    config.verificados[slug] = lista;
    const c = config.resultados.find(x => x.slug === slug)?.comparaciones.find(x => x.suUrl === suUrl);
    if (c) c.verificado = true;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Quitar la verificación a mano de un producto
  if (body.action === "desverificar") {
    const { slug, suUrl } = body as { slug: string; suUrl: string };
    config.verificados[slug] = (config.verificados[slug] ?? []).filter(u => u !== suUrl);
    const c = config.resultados.find(x => x.slug === slug)?.comparaciones.find(x => x.suUrl === suUrl);
    if (c) c.verificado = false;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Editar a mano el nombre mostrado de un producto (guarda el original por si se quiere restaurar)
  if (body.action === "renombrar") {
    const { slug, suUrl, nombre } = body as { slug: string; suUrl: string; nombre: string };
    if (!slug || !suUrl || !nombre?.trim()) {
      return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
    }
    const c = config.resultados.find(x => x.slug === slug)?.comparaciones.find(x => x.suUrl === suUrl);
    if (!c) return NextResponse.json({ error: "Producto no encontrado en el resultado actual." }, { status: 404 });
    const lista = config.nombres[slug] ?? [];
    const original = lista.find(n => n.suUrl === suUrl)?.original ?? c.nombre;
    config.nombres[slug] = [...lista.filter(n => n.suUrl !== suUrl), { suUrl, nombre: nombre.trim(), original }];
    c.nombre = nombre.trim();
    c.nombreEditado = true;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Restaurar el nombre original (detectado automáticamente)
  if (body.action === "restaurarNombre") {
    const { slug, suUrl } = body as { slug: string; suUrl: string };
    const lista = config.nombres[slug] ?? [];
    const entrada = lista.find(n => n.suUrl === suUrl);
    config.nombres[slug] = lista.filter(n => n.suUrl !== suUrl);
    const c = config.resultados.find(x => x.slug === slug)?.comparaciones.find(x => x.suUrl === suUrl);
    if (c && entrada) { c.nombre = entrada.original; c.nombreEditado = false; }
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Enlazar a mano TU producto (miUrl) con el suyo (suUrl de Cosméticos24h).
  // Actualiza el resultado al momento sin re-escanear toda tu web.
  if (body.action === "mapear") {
    const marca = config.marcas.find(m => m.slug === body.slug);
    let { miUrl, suUrl } = body as { miUrl: string; suUrl: string };
    // Fila que se estaba editando (para poder cambiar las DOS urls a la vez sin dejarla duplicada)
    const { miUrlPrevio, suUrlPrevio } = body as { miUrlPrevio?: string; suUrlPrevio?: string };
    const previoMi = (miUrlPrevio || "").trim();
    const previoSu = (suUrlPrevio || "").trim();
    if (!marca) return NextResponse.json({ error: "Marca no encontrada." }, { status: 400 });
    miUrl = (miUrl || "").trim();
    suUrl = (suUrl || "").trim().split("?")[0].replace(/\/$/, "");
    // Normalizar la URL de Cosméticos24h que pega el usuario
    const mSu = suUrl.match(/cosmeticos24h\.com\/products\/([^/?#]+)/i);
    if (!miUrl || !mSu) {
      return NextResponse.json({ error: "Pega la URL del producto en Cosméticos24h (…/products/…)." }, { status: 400 });
    }
    suUrl = `https://cosmeticos24h.com/products/${mSu[1]}`;
    if (!/latiendadecosmeticos\.com/i.test(miUrl)) {
      return NextResponse.json({ error: "La URL de tu producto debe ser de latiendadecosmeticos.com" }, { status: 400 });
    }

    // Buscar el producto suyo en la colección de la marca
    const sus = await leerSusProductos(marca.slug, marca.nombre);
    if ("error" in sus) return NextResponse.json({ error: sus.error }, { status: 502 });
    const sp = sus.find(s => s.url === suUrl);
    if (!sp) {
      return NextResponse.json({ error: `Ese producto no está en la colección "${marca.slug}" de Cosméticos24h. ¿Es de otra marca o slug distinto?` }, { status: 404 });
    }

    // Precio/nombre de TU producto: primero del resultado guardado; si no, leyendo la ficha
    const r = config.resultados.find(x => x.slug === marca.slug);
    let miPrecio: number | undefined, miEsPack = false;
    const enComp = r?.comparaciones.find(c => c.miUrl === miUrl);
    const enSin = r?.misSinEmparejar?.find(m => m.url === miUrl);
    if (enComp) miPrecio = enComp.miPrecio;
    else if (enSin) { miPrecio = enSin.precio; miEsPack = enSin.esPack; }
    else {
      try {
        const html = await fetchTexto(miUrl);
        const p = precioDesdeHtml(html);
        if (p !== null) miPrecio = p;
        const slug = (miUrl.split("/es/")[1] ?? "").replace(/-p\d+$/, "");
        miEsPack = EXCLUIR.some(w => slug.replace(/-/g, " ").toLowerCase().includes(w));
      } catch { /* se queda sin precio */ }
    }
    if (miPrecio == null) {
      return NextResponse.json({ error: "No pude leer el precio de tu producto. Revisa la URL de tu web." }, { status: 502 });
    }

    // Guardar el enlace (reemplaza cualquiera previo de ese producto tuyo o suyo, y el de la fila editada)
    const esViejo = (u: string, esMi: boolean) =>
      (esMi ? u === miUrl || (!!previoMi && u === previoMi) : u === suUrl || (!!previoSu && u === previoSu));
    const lista = (config.mapeos[marca.slug] ?? []).filter(f => !esViejo(f.miUrl, true) && !esViejo(f.suUrl, false));
    lista.push({ miUrl, suUrl });
    config.mapeos[marca.slug] = lista;
    // Que no quede oculto ese producto suyo
    config.excluidos[marca.slug] = (config.excluidos[marca.slug] ?? []).filter(e => e.suUrl !== suUrl);

    // Actualizar el resultado al momento
    if (r) {
      const nombre = (miUrl.split("/es/")[1] ?? "").replace(/-p\d+$/, "").replace(/-/g, " ");
      r.comparaciones = r.comparaciones.filter(c => !esViejo(c.miUrl, true) && !esViejo(c.suUrl, false));
      r.soloEllos = r.soloEllos.filter(s => s.url !== suUrl);
      r.misSinEmparejar = (r.misSinEmparejar ?? []).filter(m => !esViejo(m.url, true));
      const nombreOverride = (config.nombres[marca.slug] ?? []).find(n => n.suUrl === suUrl)?.nombre;
      r.comparaciones.push({
        nombre: nombreOverride || sp.titulo || nombre, miPrecio, suPrecio: sp.precio, suPrecioTachado: sp.tachado,
        diff: Math.round((miPrecio - sp.precio) * 100) / 100,
        confianza: 1, miUrl, suUrl, esPack: sp.esPack || miEsPack, manual: true,
        verificado: (config.verificados[marca.slug] ?? []).includes(suUrl),
        nombreEditado: !!nombreOverride,
      });
      r.comparaciones.sort((a, b) => b.diff - a.diff);
    }
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Deshacer un enlace manual (vuelve al emparejamiento automático en la próxima revisión)
  if (body.action === "desmapear") {
    const { slug, miUrl } = body as { slug: string; miUrl: string };
    config.mapeos[slug] = (config.mapeos[slug] ?? []).filter(f => f.miUrl !== miUrl);
    const r = config.resultados.find(x => x.slug === slug);
    if (r) r.comparaciones = r.comparaciones.filter(c => !(c.manual && c.miUrl === miUrl));
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
    // Margen de seguridad respecto a maxDuration (60 s) para guardar a tiempo
    const limiteEans = Date.now() + 45_000;

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
        const verificados = new Set(config.verificados[marca.slug] ?? []);
        const nombresOverride = new Map((config.nombres[marca.slug] ?? []).map(n => [n.suUrl, n.nombre]));
        const mapeos = config.mapeos[marca.slug] ?? [];
        const forzadoPorMi = new Map(mapeos.map(f => [f.miUrl, f.suUrl]));
        const forzadoSu = new Set(mapeos.map(f => f.suUrl));
        const forzadoMi = new Set(mapeos.map(f => f.miUrl));

        // 1) Sus productos (cosmeticos24h) — incluidos ocultos, para el backfill
        const suProdsAll = await leerSusProductos(marca.slug, marca.nombre);
        if ("error" in suProdsAll) {
          nuevos.push({ marca: marca.nombre, slug: marca.slug, error: suProdsAll.error, comparaciones: [], soloEllos: [], misSinEmparejar: [], misProductos: 0, susProductos: 0, revisadoEn: new Date().toISOString() });
          continue;
        }
        const suPorUrl = new Map(suProdsAll.map(s => [s.url, s]));

        // 2) Mis productos (tienda propia)
        const mis = await leerMisProductos(marca.miToken, sitemapXml);
        const miPorUrl = new Map(mis.map(m => [m.url, m]));

        // 2a) EAN de sus productos (de la caché; los nuevos se leen ahora)
        const eanPendientes = await leerSusEans(suProdsAll.map(s => s.url), config.eans, limiteEans);
        const susEans = (url: string) => config.eans[url] ?? [];

        // 2b) Rellenar datos de los ocultos "antiguos" (sin precio/tipo)
        for (const ex of config.excluidos[marca.slug] ?? []) {
          if (ex.suPrecio != null && ex.tipo != null) continue;
          const sp = suPorUrl.get(ex.suUrl);
          if (!sp) continue;
          ex.suPrecio = sp.precio;
          let mejor = -1, mejorJ = 0;
          for (let j = 0; j < mis.length; j++) {
            if (mis[j].esPack !== sp.esPack) continue;
            const jj = jaccard(sp.tok, mis[j].tok);
            if (jj > mejorJ) { mejorJ = jj; mejor = j; }
          }
          if (mejorJ >= UMBRAL && mejor >= 0) {
            ex.tipo = "comparacion"; ex.miPrecio = mis[mejor].precio; ex.miUrl = mis[mejor].url;
          } else {
            ex.tipo = "soloEllos";
          }
        }

        const comparaciones: Comparacion[] = [];
        const soloEllos: SoloEllos[] = [];
        const miUsados = new Set<string>();

        // 3a) Enlaces manuales primero (prioridad sobre el automático)
        for (const f of mapeos) {
          const s = suPorUrl.get(f.suUrl);
          const mp = miPorUrl.get(f.miUrl);
          if (!s || !mp) continue; // producto ya no disponible; se ignora
          miUsados.add(mp.url);
          comparaciones.push({
            nombre: nombresOverride.get(s.url) ?? s.titulo, miPrecio: mp.precio, suPrecio: s.precio, suPrecioTachado: s.tachado,
            diff: Math.round((mp.precio - s.precio) * 100) / 100,
            confianza: 1, miUrl: mp.url, suUrl: s.url, esPack: s.esPack, manual: true,
            verificado: verificados.has(s.url), nombreEditado: nombresOverride.has(s.url),
          });
        }

        // 3b) Emparejamiento por EAN: mismo código de barras = mismo producto
        const miPorEan = new Map<string, MiProducto>();
        for (const m of mis) if (m.ean && !forzadoMi.has(m.url) && !miPorEan.has(m.ean)) miPorEan.set(m.ean, m);
        const suPorEan = new Set<string>();
        const miPorEanUsados = new Set<string>();
        for (const s of suProdsAll) {
          if (ocultos.has(s.url) || forzadoSu.has(s.url)) continue;
          const ean = susEans(s.url).find(e => miPorEan.has(e) && !miPorEanUsados.has(miPorEan.get(e)!.url));
          if (!ean) continue;
          const mp = miPorEan.get(ean)!;
          miUsados.add(mp.url);
          miPorEanUsados.add(mp.url);
          suPorEan.add(s.url);
          comparaciones.push({
            nombre: nombresOverride.get(s.url) ?? s.titulo, miPrecio: mp.precio, suPrecio: s.precio, suPrecioTachado: s.tachado,
            diff: Math.round((mp.precio - s.precio) * 100) / 100,
            confianza: 1, miUrl: mp.url, suUrl: s.url, esPack: s.esPack || mp.esPack, porEan: true, ean,
            verificado: verificados.has(s.url), nombreEditado: nombresOverride.has(s.url),
          });
        }

        // 3c) Por nombre, solo para lo que no casó por EAN (saltando ocultos y los ya forzados)
        for (const s of suProdsAll) {
          if (ocultos.has(s.url) || forzadoSu.has(s.url) || suPorEan.has(s.url)) continue;
          const sEans = susEans(s.url);
          // Del mismo tipo (pack con pack, suelto con suelto) y sin usar los míos ya forzados o casados por EAN.
          // Si los dos tienen EAN y no coincide, son productos distintos aunque se llamen parecido.
          let mejor = -1, mejorJ = 0;
          for (let j = 0; j < mis.length; j++) {
            if (mis[j].esPack !== s.esPack || forzadoMi.has(mis[j].url) || miPorEanUsados.has(mis[j].url)) continue;
            if (sEans.length > 0 && mis[j].ean && !sEans.includes(mis[j].ean!)) continue;
            const jj = jaccard(s.tok, mis[j].tok);
            if (jj > mejorJ) { mejorJ = jj; mejor = j; }
          }
          if (mejorJ >= UMBRAL && mejor >= 0) {
            const mp = mis[mejor];
            miUsados.add(mp.url);
            comparaciones.push({
              nombre: nombresOverride.get(s.url) ?? s.titulo, miPrecio: mp.precio, suPrecio: s.precio, suPrecioTachado: s.tachado,
              diff: Math.round((mp.precio - s.precio) * 100) / 100,
              confianza: Math.round(mejorJ * 100) / 100,
              miUrl: mp.url, suUrl: s.url, esPack: s.esPack,
              verificado: verificados.has(s.url), nombreEditado: nombresOverride.has(s.url),
            });
          } else {
            soloEllos.push({ titulo: s.titulo, precio: s.precio, url: s.url, esPack: s.esPack });
          }
        }

        // 3d) Mis productos que no se emparejaron con ninguno suyo
        const misSinEmparejar: MiSinEmparejar[] = mis
          .filter(m => !miUsados.has(m.url))
          .map(m => ({ nombre: m.nombre, url: m.url, precio: m.precio, esPack: m.esPack }));

        // Ordenar: tú más caro primero; el resto por nombre
        comparaciones.sort((a, b) => b.diff - a.diff);
        soloEllos.sort((a, b) => Number(a.esPack) - Number(b.esPack));
        misSinEmparejar.sort((a, b) => a.nombre.localeCompare(b.nombre));

        void forzadoPorMi; // (reservado por si luego hace falta el sentido inverso)
        nuevos.push({
          marca: marca.nombre, slug: marca.slug,
          comparaciones, soloEllos, misSinEmparejar,
          misProductos: mis.length, susProductos: suProdsAll.length,
          revisadoEn: new Date().toISOString(),
          eanPendientes,
        });
      } catch (e) {
        nuevos.push({ marca: marca.nombre, slug: marca.slug, error: String(e), comparaciones: [], soloEllos: [], misSinEmparejar: [], misProductos: 0, susProductos: 0, revisadoEn: new Date().toISOString() });
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
