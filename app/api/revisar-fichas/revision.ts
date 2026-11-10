// Revisor de fichas de nuestra web.
// - Del feed (/es/feed_detalles, una fila por formato de cada ficha activa) salen, en segundos, los fallos de precio,
//   EAN, descripción e imagen, y las fichas activas que no están en el sitemap.
// - Abriendo cada ficha del sitemap salen la meta description, el title, las desactivadas que siguen en Google
//   y las que no abren. Son unas 4.500 fichas: se abren despacio (pocas a la vez) en varios pasos seguidos de
//   unos 4 minutos, porque cada llamada a Vercel corta a los 300 s.
import fs from "fs/promises";
import path from "path";
import { esPack } from "../comparar-competidores/leer";
import { claveProblema, type Estado, type Pasada, type Problema } from "../../revisar-fichas/tipos";

const MI_WEB = "https://www.latiendadecosmeticos.com";
const FEED = `${MI_WEB}/es/feed_detalles`;
const SITEMAP = `${MI_WEB}/sitemap.xml`;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const KV_KEY = "revisar-fichas";
const RUTA = path.join(process.cwd(), "data", "revisar-fichas.json");

// Fichas abiertas a la vez y pausa entre tandas: con 10 a la vez nuestra web cortaba (comparador, 29/10)
// y, más deprisa de 4-5 por segundo, responde 429 (demasiadas peticiones)
const A_LA_VEZ = 3;
const PAUSA_MS = 400;
// Tiempo de cada paso antes de pasar al siguiente (Vercel corta a los 300 s)
export const PASO_MS = 200_000;
// Una pasada que no da señales en este tiempo se da por muerta y se puede lanzar otra
export const PASADA_MUERTA_MS = 8 * 60_000;

// IVA de la cosmética: el precio_coste del feed va sin IVA
const IVA = 0.21;

const vacio = (): Estado => ({ html: {}, vistos: {} });

export async function leerEstado(): Promise<Estado> {
  let e: Partial<Estado> | null = null;
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    e = await kv.get<Estado>(KV_KEY);
  } else {
    try { e = JSON.parse(await fs.readFile(RUTA, "utf-8")); } catch { e = null; }
  }
  return { ...vacio(), ...(e ?? {}) };
}

export async function guardarEstado(e: Estado) {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, e);
    return;
  }
  await fs.mkdir(path.dirname(RUTA), { recursive: true });
  await fs.writeFile(RUTA, JSON.stringify(e));
}

export function pasadaEnCurso(e: Estado): boolean {
  const p = e.pasada;
  return !!p && !p.fin && Date.now() - new Date(p.actualizado).getTime() < PASADA_MUERTA_MS;
}

async function pedir(url: string, ms: number): Promise<Response> {
  return fetch(url, { headers: UA, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(ms) });
}

async function texto(url: string, ms: number): Promise<string> {
  const r = await fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} al leer ${url}`);
  return r.text();
}

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// EAN-8, UPC-12, EAN-13 o GTIN-14 con el dígito de control correcto
export function eanValido(v: string): boolean {
  const d = v.trim();
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false;
  const c = d.padStart(14, "0").split("").map(Number);
  const suma = c.slice(0, 13).reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === c[13];
}

const limpiarNombre = (t: string) => t.replace(/\s*®/g, "").replace(/\s+/g, " ").trim();
const sinHtml = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

export type DatosWeb = { problemas: Problema[]; fichas: number; filas: number; urls: string[]; enSitemap: Set<string>; marcaDe: Map<string, string>; nombreDe: Map<string, string> };

// Lee el feed y el sitemap. Devuelve los problemas del feed y la lista de fichas que hay que abrir
// (las del sitemap y las activas que faltan en él), siempre en el mismo orden.
export async function leerWeb(): Promise<DatosWeb> {
  const [feedTxt, sitemap] = await Promise.all([texto(FEED, 90_000), texto(SITEMAP, 60_000)]);
  const lineas = feedTxt.split(/\r?\n/);
  const cab = lineas[0].split("\t").map(c => c.trim().toLowerCase());
  const col = (k: string) => cab.indexOf(k);
  const i = {
    link: col("link"), gtin: col("gtin"), titulo: col("title"), desc: col("description"), pvp: col("price"),
    oferta: col("sale_price"), marca: col("brand"), imagen: col("image link"), coste: col("precio_coste"),
  };
  if (i.link < 0 || i.titulo < 0 || i.pvp < 0) throw new Error("El feed de nuestra web no tiene el formato esperado");

  const enSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+-p\d+)<\/loc>/gi)].map(m => m[1].trim()));
  const problemas: Problema[] = [];
  const marcaDe = new Map<string, string>();
  const nombreDe = new Map<string, string>();
  const porEan = new Map<string, Set<string>>();
  const filasEan: { ean: string; url: string; nombre: string; marca: string }[] = [];
  const fichas = new Set<string>();
  let filas = 0;

  for (const linea of lineas.slice(1)) {
    const c = linea.split("\t");
    const url = c[i.link]?.trim();
    if (!url) continue;
    filas++;
    fichas.add(url);
    const nombre = limpiarNombre(c[i.titulo] ?? "");
    const marca = i.marca >= 0 ? (c[i.marca] ?? "").trim() : "";
    if (marca) marcaDe.set(url, marca);
    if (!nombreDe.has(url)) nombreDe.set(url, nombre);
    const p = (tipo: Problema["tipo"], detalle?: string) => problemas.push({ tipo, url, nombre, marca, detalle });

    const pvp = num(c[i.pvp]);
    const oferta = i.oferta >= 0 ? num(c[i.oferta]) : null;
    const precio = oferta && oferta > 0 ? oferta : pvp;
    const coste = i.coste >= 0 ? num(c[i.coste]) : null;
    const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

    if (!precio || precio <= 0) p("precio-cero");
    else {
      if (pvp && oferta && oferta > pvp + 0.005) p("oferta-mayor-pvp", `PVP ${eur(pvp)} · precio ${eur(oferta)}`);
      // El precio de la web lleva IVA y el coste no: se compara el precio sin IVA (21 %) con el coste.
      // precio_coste ya lleva restado el descuento de la marca («Descuento sobre el precio de coste» del programa):
      // p. ej. 43,00 € con un 8,44 % → 39,37 €.
      const sinIva = precio / (1 + IVA);
      if (coste && coste > 0 && sinIva <= coste + 0.005) p("bajo-coste", `Precio ${eur(precio)} (${eur(sinIva)} sin IVA) · coste ${eur(coste)} · pierde ${eur(coste - sinIva)}`);
    }

    const ean = i.gtin >= 0 ? (c[i.gtin] ?? "").trim() : "";
    if (!esPack(nombre)) {
      if (!ean) p("sin-ean", "Sin EAN");
      else if (!eanValido(ean)) p("sin-ean", `«${ean}» no es un EAN válido`);
    }
    if (ean && eanValido(ean)) {
      const k = ean.replace(/^0+/, "");
      porEan.set(k, (porEan.get(k) ?? new Set()).add(url));
      filasEan.push({ ean: k, url, nombre, marca });
    }

    if (i.desc >= 0 && sinHtml(c[i.desc] ?? "").length < 80) p("sin-descripcion");
    if (i.imagen >= 0 && !(c[i.imagen] ?? "").trim()) p("sin-imagen");
  }

  // Un mismo EAN en fichas distintas (en la misma ficha es normal: el feed repite la fila por formato)
  for (const f of filasEan) {
    const urls = porEan.get(f.ean)!;
    if (urls.size > 1) problemas.push({ tipo: "ean-repetido", url: f.url, nombre: f.nombre, marca: f.marca, detalle: `EAN ${f.ean}, también en ${urls.size - 1} ficha${urls.size > 2 ? "s" : ""} más` });
  }

  for (const url of fichas) {
    if (!enSitemap.has(url)) problemas.push({ tipo: "fuera-sitemap", url, nombre: nombreDe.get(url) ?? url, marca: marcaDe.get(url) });
  }

  // Se abren las fichas del sitemap y las activas que no están en él
  const urls = [...new Set([...enSitemap, ...fichas])].sort();
  return { problemas: unicos(problemas), fichas: fichas.size, filas, urls, enSitemap, marcaDe, nombreDe };
}

function unicos(ps: Problema[]): Problema[] {
  const vistos = new Set<string>();
  return ps.filter(p => { const k = claveProblema(p); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// Abre una ficha y devuelve sus problemas, o null si no se ha podido comprobar
// (la web no responde, va saturada o pide que se vaya más despacio): entonces se deja lo de la vez anterior.
async function revisarFicha(url: string, enSitemap: boolean, enFeed: boolean, marca?: string, nombreFeed?: string): Promise<Problema[] | null> {
  let r: Response | null = null;
  for (let n = 0; n < 4; n++) {
    if (n > 0) {
      const pide = Number(r?.headers.get("retry-after"));
      await new Promise(res => setTimeout(res, Number.isFinite(pide) && pide > 0 ? Math.min(pide, 20) * 1000 : 3_000 * n));
    }
    try { r = await pedir(url, 15_000); } catch { r = null; }
    if (r && r.status !== 429 && r.status < 500) break;
  }
  if (!r || r.status === 429 || r.status >= 500) return null;
  const base = { url, marca, nombre: nombreFeed ?? nombreDesdeUrl(url) };
  if (r.status >= 300 && r.status < 400) {
    if (!enSitemap) return [];
    const destino = r.headers.get("location") ?? "";
    return [{ ...base, tipo: "no-abre", detalle: `Redirige${destino ? ` a ${new URL(destino, url).pathname}` : ""}` }];
  }
  if (!r.ok) return [{ ...base, tipo: "no-abre", detalle: `Error ${r.status}` }];

  const html = await r.text();
  const titulo = sinHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const nombre = nombreFeed ?? (titulo || base.nombre);
  const out: Problema[] = [];
  if (html.includes("ha sido descatalogado")) {
    const robots = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i)?.[1] ?? "";
    if (enSitemap) out.push({ ...base, nombre, tipo: "desactivada-en-google", detalle: /noindex/i.test(robots) ? "En el sitemap (con noindex)" : "En el sitemap y se deja indexar" });
    return out;
  }
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim() ?? "";
  if (!meta) out.push({ ...base, nombre, tipo: "sin-meta" });
  if (!titulo) out.push({ ...base, nombre, tipo: "sin-titulo" });
  const precio = html.match(/"price":\s*"?([0-9]+\.?[0-9]*)/)?.[1];
  if (precio !== undefined && parseFloat(precio) <= 0) out.push({ ...base, nombre, tipo: "precio-cero", detalle: "La ficha se ve a 0 €" });
  // Se vende en la web pero no sale en el feed: Google Shopping y Boardfy no la ven
  else if (!enFeed) out.push({ ...base, nombre, tipo: "fuera-feed" });
  return out;
}

const motivo = (err: unknown) => {
  if (!(err instanceof Error)) return String(err);
  const causa = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  return `${err.message}${causa ? ` (${causa.code ?? causa.message})` : ""}`;
};

const nombreDesdeUrl = (url: string) => {
  const s = (url.split("/es/")[1] ?? url).replace(/-p\d+$/, "").replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Un paso de la pasada: lee feed y sitemap y abre fichas desde donde se quedó hasta agotar el tiempo.
// Devuelve true si quedan fichas por abrir.
export async function paso(id: string): Promise<boolean> {
  const limite = Date.now() + PASO_MS;
  const e = await leerEstado();
  if (!e.pasada || e.pasada.id !== id || e.pasada.fin) return false; // otra pasada la ha sustituido

  let web: DatosWeb;
  try { web = await leerWeb(); }
  catch (err) {
    e.pasada = { ...e.pasada, actualizado: new Date().toISOString(), fin: new Date().toISOString(), error: `No se pudo leer nuestra web: ${motivo(err)}` };
    await guardarEstado(e);
    return false;
  }
  const ahora = new Date().toISOString();
  // El feed se apunta en el primer paso de cada pasada
  if (e.pasada.hechas === 0) {
    e.feed = { fecha: ahora, fichas: web.fichas, filas: web.filas, problemas: web.problemas };
    for (const p of web.problemas) e.vistos[claveProblema(p)] ??= ahora;
  }
  e.pasada.total = web.urls.length;
  // Se guarda ya: los problemas del feed salen en la página sin esperar a abrir las fichas
  e.pasada.actualizado = ahora;
  await guardarEstado(e);

  let k = e.pasada.hechas;
  let ultimoGuardado = Date.now();
  while (k < web.urls.length && Date.now() < limite) {
    const tanda = web.urls.slice(k, k + A_LA_VEZ);
    const res = await Promise.all(tanda.map(u => revisarFicha(u, web.enSitemap.has(u), web.nombreDe.has(u), web.marcaDe.get(u), web.nombreDe.get(u)).catch(() => null)));
    tanda.forEach((u, j) => {
      const ps = res[j];
      if (ps === null) { e.pasada!.sinComprobar = (e.pasada!.sinComprobar ?? 0) + 1; return; }
      if (ps.length) {
        e.html[u] = ps;
        for (const p of ps) e.vistos[claveProblema(p)] ??= new Date().toISOString();
      } else delete e.html[u];
    });
    k += tanda.length;
    e.pasada.hechas = k;
    // Se guarda cada minuto, para que la página enseñe el avance
    if (Date.now() - ultimoGuardado > 60_000) {
      e.pasada.actualizado = new Date().toISOString();
      await guardarEstado(e);
      ultimoGuardado = Date.now();
    }
    await new Promise(res => setTimeout(res, PAUSA_MS));
  }

  e.pasada.actualizado = new Date().toISOString();
  const quedan = k < web.urls.length;
  if (!quedan) {
    // Fin de la pasada: fuera las fichas que ya no existen y los problemas que ya no están
    const todas = new Set(web.urls);
    for (const u of Object.keys(e.html)) if (!todas.has(u)) delete e.html[u];
    const actuales = new Set([...(e.feed?.problemas ?? []), ...Object.values(e.html).flat()].map(claveProblema));
    for (const key of Object.keys(e.vistos)) if (!actuales.has(key)) delete e.vistos[key];
    // Desde la segunda pasada completa, lo visto por primera vez en esta pasada cuenta como «nuevo»
    e.completas = (e.completas ?? 0) + 1;
    e.nuevosDesde = e.completas > 1 ? e.pasada.inicio : undefined;
    e.pasada.fin = e.pasada.actualizado;
  }
  await guardarEstado(e);
  return quedan;
}

export function nuevaPasada(origen: Pasada["origen"]): Pasada {
  const ahora = new Date().toISOString();
  return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, origen, inicio: ahora, actualizado: ahora, total: 0, hechas: 0 };
}
