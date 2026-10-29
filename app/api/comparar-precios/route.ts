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
const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "coffret", "box", "programa", "rutina"];

type Marca = {
  nombre: string;
  slug: string;    // colección en cosmeticos24h (/collections/{slug})
  miToken: string; // texto que aparece en el slug de TUS URLs (normalmente = slug)
  descuentoMax?: number | null; // % máximo de descuento sobre el PVP puesto a mano (si falta, el de Boardfy)
};

type Comparacion = {
  nombre: string;
  miPrecio: number;
  suPrecio: number;
  suPrecioTachado?: number;
  miPvp?: number;      // PVP sin descuento en tu web
  suPvp?: number;      // PVP sin descuento en Cosméticos24h (precio tachado, o el de venta si no hay oferta)
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
  descatalogado?: boolean; // tu ficha está marcada como descatalogada en tu web
  stock?: number;          // unidades que quedan (solo se guarda si está descatalogada)
};

type SoloEllos = {
  titulo: string;
  precio: number;
  tachado?: number;
  url: string;
  esPack: boolean;
  ean?: string;
};

// Producto MÍO que no se ha podido emparejar con ninguno suyo
type MiSinEmparejar = {
  nombre: string;
  url: string;
  precio: number;
  pvp?: number;
  esPack: boolean;
  sinEan?: boolean; // true si tu ficha no tiene EAN
  ean?: string;
  formato?: string; // formato de la ficha (50 ml, 30 ml…) cuando tiene varios
  descatalogado?: boolean;
  stock?: number;   // unidades que quedan (solo si está descatalogada)
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
  misFallidas?: number; // fichas nuestras que no se pudieron leer en esta revisión
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
  // Por marca (slug): enlaces manuales tuyo↔suyo. Ya no se usan (se compara solo por EAN); se conservan guardados
  mapeos: Record<string, Mapeo[]>;
  // Por marca (slug): suUrl de los productos que el usuario ha comprobado a mano que son el mismo
  verificados: Record<string, string[]>;
  // Por marca (slug): nombres editados a mano (con el original para poder restaurarlo)
  nombres: Record<string, NombreManual[]>;
  // Caché de EAN de Cosméticos24h por suUrl: uno por variante, en su orden (null = sin EAN válido).
  // Leer el EAN cuesta una petición por producto, así que se guarda y no se repite.
  eanVariantes: Record<string, (string | null)[]>;
  // Descuento extra que Cosméticos24h aplica en el carrito (p. ej. «5% de DESCUENTO OTOÑO5»).
  // Se detecta en su web al revisar, salvo que se haya puesto a mano.
  cupon?: Cupon;
};

// desde: primera vez que se vio este código en su web; hasta: fecha de fin, puesta a mano (su web no la publica)
type Cupon = {
  pct: number | null; codigo?: string; directo?: boolean; manual?: boolean; detectadoEn?: string; desde?: string; hasta?: string;
  promo?: PromoCupon; // lo que dice su página de promociones sobre este cupón
};
type PromoCupon = { texto: string; inicio?: string; fin?: string; excluidas: string[] };

// Cupón recién detectado: conserva desde/hasta si es el mismo código que ya había
async function cuponDetectado(d: { pct: number; codigo?: string; directo: boolean } | null, antes?: Cupon): Promise<Cupon> {
  const ahora = new Date().toISOString();
  const mismo = !!d && !!antes?.codigo && antes.codigo === d.codigo;
  let promo: PromoCupon | undefined;
  if (d?.codigo) {
    try { promo = (await leerPromoCupon(d.codigo)) ?? undefined; } catch { promo = mismo ? antes!.promo : undefined; }
  }
  return { pct: d?.pct ?? null, codigo: d?.codigo, directo: d?.directo, detectadoEn: ahora, desde: d ? (mismo ? antes!.desde ?? ahora : ahora) : undefined, hasta: mismo ? antes!.hasta : undefined, promo };
}

function configVacia(): Config {
  return { marcas: [], ultimaRevision: null, resultados: [], excluidos: {}, mapeos: {}, verificados: {}, nombres: {}, eanVariantes: {} };
}

async function leerConfig(): Promise<Config> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<Config>(KV_KEY);
    if (!data) return configVacia();
    return { ...configVacia(), ...data, excluidos: data.excluidos ?? {}, mapeos: data.mapeos ?? {}, verificados: data.verificados ?? {}, nombres: data.nombres ?? {}, eanVariantes: data.eanVariantes ?? {} };
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
      eanVariantes: parsed.eanVariantes ?? {},
      cupon: parsed.cupon,
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

// ── Normalización ──────────────────────────────────────────────────────
function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Utilidades de red ──────────────────────────────────────────────────
async function fetchTexto(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Su página de promociones (https://cosmeticos24h.com/pages/promociones) explica cada cupón:
// «Cupón Otoño5 · Del 11 hasta el 30 de Septiembre. … a todo el catálogo web excepto en las firmas Eberlin, Sothys y Atache.»
// De ahí salen las fechas y las marcas en las que no se aplica.
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
async function leerPromoCupon(codigo: string): Promise<PromoCupon | null> {
  const html = await fetchTexto("https://cosmeticos24h.com/pages/promociones");
  const texto = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(h\d|p|div|li|br|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n");
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const lineas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const i = lineas.findIndex(l => norm(l).includes(norm(codigo)) && /cup[oó]n/i.test(l));
  if (i < 0) return null;
  const bloque = lineas.slice(i + 1, i + 3).join(" ");
  const m = bloque.match(/del\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?\s+(?:hasta\s+el|al)\s+(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
  const anio = new Date().getFullYear();
  const fecha = (d: string, mes: string) => {
    const n = MESES.indexOf(norm(mes));
    return n < 0 ? undefined : `${anio}-${String(n + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
  };
  const exc = bloque.match(/excepto\s+(?:en\s+)?(?:las\s+|los\s+)?(?:firmas|marcas)\s+([^.]+)/i);
  return {
    texto: bloque.slice(0, 400),
    inicio: m ? fecha(m[1], m[2] ?? m[4]) : undefined,
    fin: m ? fecha(m[3], m[4]) : undefined,
    excluidas: exc ? exc[1].split(/,|\sy\s/).map(x => x.trim()).filter(Boolean) : [],
  };
}

// Cupón de carrito que anuncia Cosméticos24h en la barra superior de su web
// (p. ej. «¡5% de DESCUENTO! OTOÑO5, directo en tu carrito»). null si no anuncia ninguno.
async function detectarCupon(): Promise<{ pct: number; codigo?: string; directo: boolean } | null> {
  const html = await fetchTexto("https://cosmeticos24h.com/");
  const texto = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = texto.match(/(\d{1,2}(?:[.,]\d)?)\s*%\s*de\s+descuento[!¡\s]*([A-ZÑ0-9]{4,})?/i);
  if (!m) return null;
  const pct = parseFloat(m[1].replace(",", "."));
  if (!(pct > 0 && pct <= 50)) return null;
  // «directo en tu carrito»: se aplica solo, sin que el cliente tenga que escribir el código
  const despues = texto.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 80);
  const directo = /directo\s+en\s+(?:tu\s+|el\s+)?carrito|autom[aá]tic/i.test(despues);
  return { pct, codigo: m[2] && /\d/.test(m[2]) ? m[2] : undefined, directo };
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
// Se guarda un EAN por variante (tono/formato), en el mismo orden que las variantes del listado.
async function leerSusEans(urls: string[], cache: Record<string, (string | null)[]>, limiteMs: number): Promise<number> {
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
        cache[url] = (data.product?.variants ?? []).map((v: { barcode?: string | null }) => normalizarEan(v.barcode));
      } catch { /* se reintenta en la siguiente revisión */ }
    }));
  }
  return urls.filter(u => !(u in cache)).length;
}

// Lee el PVP sin descuento de una ficha de la tienda propia.
// La ficha solo enseña el precio final; el original va en un bloque oculto (unit_price_original).
// Sin él, el PVP es el mismo precio de venta.
function pvpDesdeHtml(html: string): number | null {
  const m = html.match(/class="unit_price_original">\s*([0-9]+\.?[0-9]*)/);
  return m ? parseFloat(m[1]) : null;
}

// PVP de Cosméticos24h: el precio tachado si hay oferta; si no, el de venta
function suPvp(s: { precio: number; tachado?: number }): number {
  return s.tachado && s.tachado > s.precio ? s.tachado : s.precio;
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

// Una ficha con varios formatos (50 ml / 30 ml) da un MiProducto por formato: mismo url, cada uno con su precio.
// La web solo publica el EAN del primer formato (el que sale marcado); los demás van sin EAN.
type MiProducto = {
  nombre: string; url: string; precio: number; pvp: number; esPack: boolean; ean: string | null; propiedades: string[];
  formato?: string; clave: string; descatalogado?: boolean | null; stock?: number | null;
};

// Combinaciones de propiedades (tono, formato…) de la ficha, para preguntar a la web por su estado.
// Con una sola lista (lo normal) se devuelve cada valor; con varias, el primero de cada una.
function propiedadesDesdeHtml(html: string): string[] {
  const listas: string[][] = [];
  const vistos = new Set<string>();
  const re = /<ul[^>]*data-title="([^"]*)"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (vistos.has(m[1])) continue; // la misma lista sale también en el módulo flotante
    vistos.add(m[1]);
    const ids = [...m[2].matchAll(/<li[^>]*class="[^"]*(?:unidad|color)[^"]*"[^>]*>\s*<a[^>]*data-id="(\d+)"/gi)].map(x => x[1]);
    if (ids.length) listas.push(ids);
  }
  if (listas.length === 0) return [];
  if (listas.length === 1) return listas[0].slice(0, 6);
  return [listas.map(l => l[0]).join(",")];
}

// Formatos de la ficha cuando solo hay una lista de propiedades (lo normal: «Formato»): id y texto de cada uno
function formatosDesdeHtml(html: string): { id: string; titulo: string }[] {
  const listas = new Map<string, { id: string; titulo: string }[]>();
  const re = /<ul[^>]*data-title="([^"]*)"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (listas.has(m[1])) continue;
    const items = [...m[2].matchAll(/<li[^>]*class="[^"]*(?:unidad|color)[^"]*"[^>]*>\s*<a([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map(x => ({ id: x[1].match(/data-id="(\d+)"/)?.[1] ?? "", titulo: (x[1].match(/title="([^"]*)"/)?.[1] ?? x[2].replace(/<[^>]+>/g, "")).trim() }))
      .filter(x => x.id);
    if (items.length) listas.set(m[1], items);
  }
  if (listas.size !== 1) return [];
  // Solo formatos de tamaño (50 ml, 30 ml…); los tonos siguen como hasta ahora, una fila por ficha
  const items = [...listas.values()][0].slice(0, 6);
  return items.every(x => TAMANO.test(x.titulo)) ? items : [];
}

const TAMANO = /(\d+(?:[.,]\d+)?)\s*(ml|gr|g|uds?|unidades|l)\b/i;

// Precio, PVP y estado de un formato, preguntando a la web (lo mismo que hace la ficha al elegir formato)
async function estadoVariante(url: string, propiedades: string): Promise<{ precio: number; pvp: number | null; descatalogado: boolean; stock: number | null } | null> {
  const id = url.match(/-p(\d+)$/)?.[1];
  if (!id) return null;
  try {
    const res = await fetch(`${MI_WEB}/es/productos/actualizar`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" },
      body: new URLSearchParams({ id_producto: id, propiedades }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json() as { descatalogado?: string | number; stock?: string | number; precios?: { precio?: number | string; precio_anterior?: number | string } };
    const precio = Number(j.precios?.precio);
    if (!Number.isFinite(precio) || precio <= 0) return null;
    const pvp = Number(j.precios?.precio_anterior);
    return { precio: Math.round(precio * 100) / 100, pvp: Number.isFinite(pvp) && pvp > 0 ? pvp : null, descatalogado: String(j.descatalogado) === "1", stock: stockDe(j.stock) };
  } catch {
    return null;
  }
}

// Unidades en stock según la web. Las fichas que se pueden vender sin stock dan un número enorme (9998):
// solo tiene sentido mirarlo en las descatalogadas, que ya no se reponen.
function stockDe(v: unknown): number | null {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
}

// Tamaño de un formato para comparar entre webs: «Tarro 30 ml» y «30 ml» → "30ml"
function tamano(t: string): string {
  const m = t.toLowerCase().replace(",", ".").match(TAMANO);
  return m ? m[1] + m[2].replace(/^gr$/, "g").replace(/^(uds?|unidades)$/, "ud") : normalizar(t);
}

// ¿Está descatalogada la ficha? La propia web lo dice al pedir el estado de cada variante
// (lo mismo que pinta «Producto descatalogado» en la ficha). Cuenta como descatalogada si lo están
// todas sus variantes. null si no se pudo saber.
async function descatalogadoEnMiWeb(url: string, combinaciones: string[]): Promise<{ descatalogado: boolean; stock: number | null } | null> {
  if (combinaciones.length === 0) return null;
  const estados = await Promise.all(combinaciones.map(p => varianteDescatalogada(url, p)));
  if (estados.some(e => e === null)) return null;
  const descatalogado = estados.every(e => e!.descatalogado);
  const stocks = estados.map(e => e!.stock);
  return { descatalogado, stock: stocks.some(x => x === null) ? null : stocks.reduce((a, b) => a! + b!, 0) };
}

async function varianteDescatalogada(url: string, propiedades: string): Promise<{ descatalogado: boolean; stock: number | null } | null> {
  const id = url.match(/-p(\d+)$/)?.[1];
  if (!id) return null;
  try {
    const res = await fetch(`${MI_WEB}/es/productos/actualizar`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" },
      body: new URLSearchParams({ id_producto: id, propiedades }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json() as { descatalogado?: string | number; stock?: string | number };
    return { descatalogado: String(j.descatalogado) === "1", stock: stockDe(j.stock) };
  } catch {
    return null;
  }
}

// Enumera y lee los productos de una marca en la tienda propia
async function leerMisProductos(miToken: string, sitemapXml: string): Promise<{ productos: MiProducto[]; fallidas: number }> {
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
  const productos = await enLotes(lista, 10, async (url): Promise<MiProducto[] | null> => {
    try {
      // Un segundo intento si la web tarda o falla: si no, la ficha desaparece de la comparación
      const html = await fetchTexto(url).catch(() => new Promise<string>(r => setTimeout(r, 800)).then(() => fetchTexto(url)));
      const precio = precioDesdeHtml(html);
      if (precio === null) return null;
      const slug = (url.split("/es/")[1] ?? "").replace(/-p\d+$/, "");
      const nombre = slug.replace(/-/g, " ");
      const esPack = EXCLUIR.some(w => nombre.toLowerCase().includes(w));
      const ean = eanDesdeHtml(html);
      const formatos = formatosDesdeHtml(html);
      if (formatos.length >= 2) {
        // El precio del JSON-LD es el más bajo de todos los formatos: se pide el de cada uno
        const estados = await Promise.all(formatos.map(f => estadoVariante(url, f.id)));
        if (estados.every(e => e !== null)) {
          return formatos.map((f, i): MiProducto => ({
            nombre: `${nombre} · ${f.titulo}`, url, precio: estados[i]!.precio, pvp: estados[i]!.pvp ?? estados[i]!.precio, esPack,
            ean: i === 0 ? ean : null, propiedades: [f.id], formato: f.titulo, clave: `${url}#${f.id}`, descatalogado: estados[i]!.descatalogado, stock: estados[i]!.stock,
          }));
        }
      }
      return [{ nombre, url, precio, pvp: pvpDesdeHtml(html) ?? precio, esPack, ean, propiedades: propiedadesDesdeHtml(html), clave: url }];
    } catch {
      return null;
    }
  });
  return { productos: productos.flatMap(p => p ?? []), fallidas: productos.filter(p => p === null).length };
}

type Variante = { titulo: string; precio: number; tachado?: number };
type SuProducto = { titulo: string; url: string; precio: number; tachado?: number; esPack: boolean; variantes: Variante[] };

// Lee los productos de una marca en Cosméticos24h (API Shopify pública)
async function leerSusProductos(slug: string): Promise<SuProducto[] | { error: string }> {
  const url = `https://cosmeticos24h.com/collections/${slug}/products.json?limit=250`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!res.ok) return { error: `Cosméticos24h HTTP ${res.status}` };
  const data = await res.json();
  return (data.products ?? []).map((p: {
    title: string; handle: string;
    variants?: { title?: string; price?: string; compare_at_price?: string }[];
  }) => {
    const variantes: Variante[] = (p.variants ?? []).map(v => ({
      titulo: v.title ?? "",
      precio: parseFloat(v.price ?? "0"),
      tachado: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
    }));
    const v = variantes[0] ?? { titulo: "", precio: 0 };
    return {
      titulo: p.title as string,
      url: `https://cosmeticos24h.com/products/${p.handle}`,
      precio: v.precio,
      tachado: v.tachado,
      esPack: EXCLUIR.some(w => (p.title as string).toLowerCase().includes(w)),
      variantes,
    };
  });
}

// Variantes suyas (tono/formato) con el mismo EAN que algún producto mío
function variantesConEan(eans: (string | null)[], miPorEan: Map<string, MiProducto>): { i: number; ean: string; mp: MiProducto }[] {
  const out: { i: number; ean: string; mp: MiProducto }[] = [];
  for (let i = 0; i < eans.length; i++) {
    const ean = eans[i];
    const mp = ean ? miPorEan.get(ean) : undefined;
    if (ean && mp) out.push({ i, ean, mp });
  }
  return out;
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

  // Descuento máximo de la marca (null = volver al de Boardfy)
  if (body.action === "descuento") {
    const { slug, descuentoMax } = body as { slug: string; descuentoMax: number | null };
    const m = config.marcas.find(x => x.slug === slug);
    if (!m) return NextResponse.json({ error: "Marca no encontrada." }, { status: 404 });
    if (descuentoMax == null) delete m.descuentoMax;
    else if (!(descuentoMax >= 0 && descuentoMax <= 90)) return NextResponse.json({ error: "El descuento debe estar entre 0 y 90 %." }, { status: 400 });
    else m.descuentoMax = Math.round(descuentoMax * 10) / 10;
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  // Cupón de carrito de Cosméticos24h puesto a mano (null = volver a detectarlo en su web)
  if (body.action === "cupon-hasta") {
    const { hasta } = body as { hasta: string | null };
    if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
    config.cupon = { ...(config.cupon ?? { pct: null }), hasta: hasta || undefined };
    await guardarConfig(config);
    return NextResponse.json(config);
  }

  if (body.action === "cupon") {
    const { pct } = body as { pct: number | null };
    if (pct == null) {
      try {
        const d = await detectarCupon();
        config.cupon = await cuponDetectado(d, config.cupon);
      } catch {
        config.cupon = { pct: null };
      }
    } else if (!(pct >= 0 && pct <= 50)) {
      return NextResponse.json({ error: "El cupón debe estar entre 0 y 50 %." }, { status: 400 });
    } else {
      config.cupon = { pct: Math.round(pct * 10) / 10, codigo: config.cupon?.codigo, directo: config.cupon?.directo, desde: config.cupon?.desde, hasta: config.cupon?.hasta, promo: config.cupon?.promo, manual: true };
    }
    await guardarConfig(config);
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

    // El cupón de carrito puede cambiar (campañas): se vuelve a mirar en cada revisión
    if (!config.cupon?.manual) {
      try {
        const d = await detectarCupon();
        config.cupon = await cuponDetectado(d, config.cupon);
      } catch { /* si su portada no responde, se conserva el último */ }
    }

    const nuevos: ResultadoMarca[] = [];
    for (const marca of objetivo) {
      try {
        const ocultos = new Set((config.excluidos[marca.slug] ?? []).map(e => e.suUrl));
        const verificados = new Set(config.verificados[marca.slug] ?? []);
        const nombresOverride = new Map((config.nombres[marca.slug] ?? []).map(n => [n.suUrl, n.nombre]));

        // 1) Sus productos (cosmeticos24h) — incluidos ocultos, para el backfill
        const suProdsAll = await leerSusProductos(marca.slug);
        if ("error" in suProdsAll) {
          nuevos.push({ marca: marca.nombre, slug: marca.slug, error: suProdsAll.error, comparaciones: [], soloEllos: [], misSinEmparejar: [], misProductos: 0, susProductos: 0, revisadoEn: new Date().toISOString() });
          continue;
        }
        const suPorUrl = new Map(suProdsAll.map(s => [s.url, s]));

        // 2) Mis productos (tienda propia)
        const { productos: mis, fallidas: misFallidas } = await leerMisProductos(marca.miToken, sitemapXml);

        // 2a) EAN de sus productos (de la caché; los nuevos se leen ahora)
        const eanPendientes = await leerSusEans(suProdsAll.map(s => s.url), config.eanVariantes, limiteEans);
        const susEans = (url: string) => config.eanVariantes[url] ?? [];
        const miPorEan = new Map<string, MiProducto>();
        for (const m of mis) if (m.ean && !miPorEan.has(m.ean)) miPorEan.set(m.ean, m);

        // 2b) Rellenar datos de los ocultos "antiguos" (sin precio/tipo)
        for (const ex of config.excluidos[marca.slug] ?? []) {
          if (ex.suPrecio != null && ex.tipo != null) continue;
          const sp = suPorUrl.get(ex.suUrl);
          if (!sp) continue;
          ex.suPrecio = sp.precio;
          const match = variantesConEan(susEans(sp.url), miPorEan)[0];
          if (match) {
            ex.tipo = "comparacion"; ex.miPrecio = match.mp.precio; ex.miUrl = match.mp.url;
          } else {
            ex.tipo = "soloEllos";
          }
        }

        const comparaciones: Comparacion[] = [];
        const soloEllos: SoloEllos[] = [];
        const miUsados = new Set<string>(); // por clave (ficha, o ficha#formato)
        const miDeFila = new Map<Comparacion, MiProducto>();
        const formatosDe = new Map<string, MiProducto[]>();
        for (const m of mis) if (m.formato) formatosDe.set(m.url, [...(formatosDe.get(m.url) ?? []), m]);

        const anadirFila = (s: SuProducto, i: number, ean: string | undefined, mp: MiProducto) => {
          const v = s.variantes[i] ?? s.variantes[0] ?? { titulo: "", precio: s.precio, tachado: s.tachado };
          // El formato va siempre en el nombre: su variante, el formato de nuestra ficha o el tamaño que lleva nuestra URL (…-50-ml-…)
          const tamanoUrl = !TAMANO.test(s.titulo) ? mp.nombre.match(TAMANO)?.[0] : undefined;
          const tono = v.titulo && v.titulo !== "Default Title" && s.variantes.length > 1 ? ` · ${v.titulo}` : mp.formato ? ` · ${mp.formato}` : tamanoUrl ? ` · ${tamanoUrl.replace(/\s+/g, " ")}` : "";
          miUsados.add(mp.clave);
          const c: Comparacion = {
            nombre: nombresOverride.get(s.url) ?? s.titulo + tono, miPrecio: mp.precio, suPrecio: v.precio, suPrecioTachado: v.tachado,
            miPvp: mp.pvp, suPvp: suPvp(v),
            diff: Math.round((mp.precio - v.precio) * 100) / 100,
            confianza: 1, miUrl: mp.url, suUrl: s.url, esPack: s.esPack || mp.esPack, porEan: ean != null, ean,
            verificado: verificados.has(s.url), nombreEditado: nombresOverride.has(s.url),
          };
          comparaciones.push(c);
          miDeFila.set(c, mp);
        };

        // 3) Solo se compara lo que tiene el mismo EAN en las dos webs.
        // Se usa el precio de la variante (tono/formato) que lleva ese EAN.
        // Un producto suyo con varios tonos puede casar con varias fichas mías (una fila por cada una).
        // Si la ficha mía tiene varios formatos, los que no tienen EAN se emparejan por tamaño
        // con las variantes del mismo producto suyo (50 ml con 50 ml, 30 ml con 30 ml).
        for (const s of suProdsAll) {
          if (ocultos.has(s.url)) continue;
          const matches = variantesConEan(susEans(s.url), miPorEan).filter(m => !miUsados.has(m.mp.clave));
          if (matches.length === 0) {
            soloEllos.push({ titulo: s.titulo, precio: s.precio, tachado: s.tachado, url: s.url, esPack: s.esPack, ean: susEans(s.url).find(e => e) ?? undefined });
            continue;
          }
          const variantesUsadas = new Set<number>();
          for (const { i, ean, mp: mpEan } of matches) {
            // El EAN dice qué producto es; el tamaño de su variante, qué formato nuestro (la web solo publica
            // un EAN por ficha y a veces es el de otro formato)
            const tamSuyo = TAMANO.test(s.variantes[i]?.titulo ?? "") ? tamano(s.variantes[i].titulo) : null;
            const mp = (mpEan.formato && tamSuyo && tamano(mpEan.formato) !== tamSuyo
              && (formatosDe.get(mpEan.url) ?? []).find(h => !miUsados.has(h.clave) && tamano(h.formato ?? "") === tamSuyo)) || mpEan;
            if (miUsados.has(mp.clave)) continue;
            anadirFila(s, i, ean, mp);
            variantesUsadas.add(i);
          }
          for (const { mp } of matches) {
            for (const hermano of formatosDe.get(mp.url) ?? []) {
              if (miUsados.has(hermano.clave)) continue;
              const j = s.variantes.findIndex((v, k) => !variantesUsadas.has(k) && tamano(v.titulo) === tamano(hermano.formato ?? ""));
              if (j < 0) continue;
              anadirFila(s, j, susEans(s.url)[j] ?? undefined, hermano);
              variantesUsadas.add(j);
            }
          }
        }

        // 4) Mis productos que no tienen el mismo EAN que ninguno suyo
        const misSinEmparejarMp = mis.filter(m => !miUsados.has(m.clave));
        const misSinEmparejar: MiSinEmparejar[] = misSinEmparejarMp
          .map(m => ({ nombre: m.nombre, url: m.url, precio: m.precio, pvp: m.pvp, esPack: m.esPack, sinEan: !m.ean, ean: m.ean ?? undefined, formato: m.formato, descatalogado: m.descatalogado ?? undefined, stock: m.descatalogado && m.stock != null ? m.stock : undefined }));
        for (const c of comparaciones) {
          const mp = miDeFila.get(c);
          if (mp?.descatalogado) { c.descatalogado = true; if (mp.stock != null) c.stock = mp.stock; }
        }

        // 5) Fichas mías descatalogadas (una consulta por ficha, si queda tiempo).
        // Las de varios formatos ya lo saben por formato.
        if (Date.now() < limiteEans + 8_000) {
          const misPorUrl = new Map(mis.map(m => [m.url, m]));
          const urlsMias = [...new Set([...comparaciones.filter(c => !miDeFila.get(c)?.formato).map(c => c.miUrl), ...misSinEmparejarMp.filter(m => !m.formato).map(m => m.url)])];
          const estados = new Map<string, { descatalogado: boolean; stock: number | null } | null>();
          await enLotes(urlsMias, 5, async url => {
            estados.set(url, await descatalogadoEnMiWeb(url, misPorUrl.get(url)?.propiedades ?? []));
          });
          for (const c of comparaciones) {
            const e = miDeFila.get(c)?.formato ? null : estados.get(c.miUrl);
            if (e?.descatalogado) { c.descatalogado = true; if (e.stock != null) c.stock = e.stock; }
          }
          misSinEmparejar.forEach((m, i) => {
            const e = misSinEmparejarMp[i].formato ? null : estados.get(m.url);
            if (e?.descatalogado) { m.descatalogado = true; if (e.stock != null) m.stock = e.stock; }
          });
        }

        // Ordenar: tú más caro primero; el resto por nombre
        comparaciones.sort((a, b) => b.diff - a.diff);
        soloEllos.sort((a, b) => Number(a.esPack) - Number(b.esPack));
        misSinEmparejar.sort((a, b) => a.nombre.localeCompare(b.nombre));

        nuevos.push({
          marca: marca.nombre, slug: marca.slug,
          comparaciones, soloEllos, misSinEmparejar,
          misProductos: mis.length, susProductos: suProdsAll.length,
          revisadoEn: new Date().toISOString(),
          eanPendientes, misFallidas,
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
