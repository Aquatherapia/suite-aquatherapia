// Lectura de precios de nuestra web (feed) y de cada competidor, y búsqueda del listado de una marca en sus webs.
import { parse } from "node-html-parser";
import { normalizar, TAMANO } from "../comparar-precios/emparejar";
import type { Competidor } from "../../comparar-competidores/competidores";

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
const FEED = "https://www.latiendadecosmeticos.com/es/feed_detalles";

// Palabras que indican pack/lote (como en el comparador de Cosméticos24h)
const EXCLUIR = ["pack", "set", "kit", "lote", "duo", "dúo", "trio", "trío", "estuche", "bundle", "caja", "cofre", "coffret", "box", "programa", "rutina"];
export const esPack = (t: string) => EXCLUIR.some(w => new RegExp(`\\b${w}\\b`, "i").test(t));

// Se comparan sin ceros a la izquierda. Menos de 7 cifras no es un EAN (suele ser un código interno).
export function normalizarEan(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 7 && d.length <= 14 ? d : null;
}

async function pedir(url: string, init?: RequestInit, ms = 25_000): Promise<Response> {
  return fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(ms) });
}

export async function enLotes<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limite) out.push(...await Promise.all(items.slice(i, i + limite).map(fn)));
  return out;
}

const soloLetras = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "");

// ── Nuestra web ────────────────────────────────────────────────────────
export type MiProducto = { nombre: string; url: string; ean: string | null; formato?: string; precio: number; pvp: number; esPack: boolean; clave: string };

// Productos de una marca según el feed de nuestra web: una fila por formato/tono de cada ficha activa
export async function leerMisProductos(marca: { nombre: string; slug: string; miToken?: string }): Promise<MiProducto[]> {
  const res = await pedir(FEED, undefined, 60_000);
  if (!res.ok) throw new Error(`No se pudo leer el feed de nuestra web (HTTP ${res.status})`);
  const lineas = (await res.text()).split(/\r?\n/);
  const cab = lineas[0].split("\t").map(c => c.trim().toLowerCase());
  const col = (k: string) => cab.indexOf(k);
  const [iLink, iGtin, iTitulo, iPvp, iOferta, iMarca] = [col("link"), col("gtin"), col("title"), col("price"), col("sale_price"), col("brand")];
  if ([iLink, iTitulo, iPvp].some(i => i < 0)) throw new Error("El feed de nuestra web no tiene el formato esperado");
  const claveMarca = soloLetras(marca.nombre);
  const token = (marca.miToken ?? marca.slug).toLowerCase();
  const porUrl = new Map<string, { titulo: string; ean: string | null; precio: number; pvp: number }[]>();
  for (const linea of lineas.slice(1)) {
    const c = linea.split("\t");
    const url = c[iLink]?.trim();
    if (!url) continue;
    const suMarca = iMarca >= 0 ? soloLetras(c[iMarca] ?? "") : "";
    if (suMarca ? suMarca !== claveMarca : !url.toLowerCase().includes(token)) continue;
    const pvp = parseFloat((c[iPvp] ?? "").replace(",", "."));
    const oferta = iOferta >= 0 ? parseFloat((c[iOferta] ?? "").replace(",", ".")) : NaN;
    const precio = Number.isFinite(oferta) && oferta > 0 ? oferta : pvp;
    if (!Number.isFinite(precio) || precio <= 0) continue;
    porUrl.set(url, [...(porUrl.get(url) ?? []), { titulo: (c[iTitulo] ?? "").trim(), ean: iGtin >= 0 ? normalizarEan(c[iGtin]) : null, precio, pvp: Number.isFinite(pvp) && pvp > 0 ? pvp : precio }]);
  }
  const quitarMarca = (t: string) => t.replace(/\s*®/g, "").replace(new RegExp(`\\s+-\\s+${marca.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
  const out: MiProducto[] = [];
  for (const [url, filas] of porUrl) {
    filas.forEach((f, i) => {
      const variante = filas.length > 1 && f.titulo.includes(" - ") ? f.titulo.slice(f.titulo.lastIndexOf(" - ") + 3).trim() : null;
      const nombre = quitarMarca(f.titulo);
      out.push({
        nombre, url, ean: f.ean, precio: f.precio, pvp: f.pvp, esPack: esPack(nombre),
        formato: variante && TAMANO.test(variante) ? variante : (nombre.match(TAMANO)?.[0] ?? undefined),
        clave: filas.length > 1 ? `${url}#${f.ean ?? i}` : url,
      });
    });
  }
  return out;
}

// ── Competidores ───────────────────────────────────────────────────────
export type Variante = { titulo: string; precio: number; pvp?: number; ean: string | null };
export type SuProducto = { titulo: string; url: string; esPack: boolean; variantes: Variante[] };

// Categoría de WooCommerce de un enlace: el último tramo de la ruta («/comprar/eberlin» → «eberlin»)
const ultimoTramo = (url: string) => new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
const precioWoo = (v: string | undefined, decimales: number) => (v ? Number(v) / 10 ** decimales : 0);
// En WooCommerce el SKU a veces es el EAN («3700109214090-1»)
const eanDeSku = (sku: string | undefined) => { const m = (sku ?? "").trim().match(/^(\d{8,14})(?:-\d{1,2})?$/); return m ? normalizarEan(m[1]) : null; };

type ProductoWoo = {
  id: number; name: string; permalink: string; sku?: string; type: string;
  prices: { price: string; regular_price: string; currency_minor_unit: number };
  variations?: { id: number; attributes: { name: string; value: string }[] }[];
};

async function leerWoo(c: Competidor, enlace: string, limite: number): Promise<SuProducto[]> {
  const cat = ultimoTramo(enlace);
  const productos: ProductoWoo[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const res = await pedir(`${c.web}/wp-json/wc/store/v1/products?category=${encodeURIComponent(cat)}&per_page=100&page=${pagina}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lote = await res.json() as ProductoWoo[];
    productos.push(...lote);
    if (lote.length < 100) break;
  }
  return enLotes(productos, 6, async p => {
    const d = p.prices.currency_minor_unit ?? 2;
    const base: Variante = { titulo: "", precio: precioWoo(p.prices.price, d), pvp: precioWoo(p.prices.regular_price, d) || undefined, ean: eanDeSku(p.sku) };
    let variantes: Variante[] = [base];
    // Producto con formatos: el precio de cada uno se pide aparte (si queda tiempo)
    if (p.type === "variable" && p.variations?.length && Date.now() < limite) {
      const vs = await Promise.all(p.variations.slice(0, 8).map(async (v): Promise<Variante | null> => {
        try {
          const r = await pedir(`${c.web}/wp-json/wc/store/v1/products/${v.id}`, undefined, 15_000);
          if (!r.ok) return null;
          const x = await r.json() as ProductoWoo;
          const dd = x.prices.currency_minor_unit ?? 2;
          return { titulo: v.attributes.map(a => a.value).join(" "), precio: precioWoo(x.prices.price, dd), pvp: precioWoo(x.prices.regular_price, dd) || undefined, ean: eanDeSku(x.sku) };
        } catch { return null; }
      }));
      const ok = vs.filter((v): v is Variante => !!v && v.precio > 0);
      if (ok.length) variantes = ok;
    }
    return { titulo: decodificar(p.name), url: p.permalink, esPack: esPack(p.name) || p.type === "bundle", variantes: variantes.filter(v => v.precio > 0) };
  });
}

type ProductoPresta = { name: string; url: string; price_amount: number; regular_price_amount?: number; ean13?: string; reference?: string };

async function leerPresta(enlace: string): Promise<SuProducto[]> {
  const out: SuProducto[] = [];
  const base = enlace.split("?")[0];
  for (let pagina = 1; pagina <= 25; pagina++) {
    const res = await pedir(`${base}?page=${pagina}`, { headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!mismaRuta(res.url, base)) throw new Error("El enlace lleva a otra página");
    const data = await res.json() as { products?: ProductoPresta[]; pagination?: { pages_count?: number } };
    for (const p of data.products ?? []) {
      const pvp = p.regular_price_amount && p.regular_price_amount > p.price_amount + 0.005 ? Math.round(p.regular_price_amount * 100) / 100 : undefined;
      out.push({ titulo: decodificar(p.name), url: p.url, esPack: esPack(p.name), variantes: [{ titulo: "", precio: p.price_amount, pvp, ean: normalizarEan(p.ean13) }] });
    }
    if (pagina >= (data.pagination?.pages_count ?? 1)) break;
  }
  return out;
}

// Si la web redirige a otra página (marca que no existe → portada), el listado no vale
const mismaRuta = (final: string, pedida: string) => !final || new URL(final).pathname.replace(/\/$/, "") === new URL(pedida).pathname.replace(/\/$/, "");

// Importe en euros de un texto («1.190,00 €» → 1190)
function importe(t: string): number | null {
  const m = t.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*€/);
  return m ? parseFloat(`${m[1].replace(/\./g, "")}.${m[2] ?? "0"}`) : null;
}

async function leerRosi(c: Competidor, enlace: string): Promise<SuProducto[]> {
  const res = await pedir(enlace.split("?")[0]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!mismaRuta(res.url, enlace)) throw new Error("El enlace lleva a otra página");
  const doc = parse(await res.text());
  const out: SuProducto[] = [];
  for (const art of doc.querySelectorAll("article.product-st1")) {
    const href = art.querySelector("a.product-btn-prin")?.getAttribute("href") ?? art.querySelector("a")?.getAttribute("href");
    const titulo = art.querySelector("h2")?.text.trim() ?? "";
    const importes = (art.querySelector(".product-price")?.querySelectorAll("span") ?? []).map(s => importe(s.text)).filter((n): n is number => n != null);
    if (!href || !titulo || !importes.length) continue;
    const precio = Math.min(...importes), max = Math.max(...importes);
    out.push({ titulo: decodificar(titulo), url: new URL(href, c.web).href.split("?")[0], esPack: esPack(titulo), variantes: [{ titulo: "", precio, pvp: max > precio + 0.005 ? max : undefined, ean: null }] });
  }
  return out;
}

export async function leerCompetidor(c: Competidor, enlace: string, limite: number): Promise<SuProducto[]> {
  if (c.tipo === "woo") return leerWoo(c, enlace, limite);
  if (c.tipo === "presta") return leerPresta(enlace);
  if (c.tipo === "rosi") return leerRosi(c, enlace);
  return [];
}

// ── Buscar el listado de una marca en la web de un competidor ──────────
// Devuelve la URL del listado, o null si no se encuentra (puede que no venda la marca).
export async function buscarListado(c: Competidor, marca: { nombre: string; slug: string }): Promise<string | null> {
  const clave = soloLetras(marca.nombre);
  try {
    if (c.tipo === "woo") {
      const cats: { slug: string; name: string; count: number; permalink?: string }[] = [];
      for (let pagina = 1; pagina <= 5; pagina++) {
        const res = await pedir(`${c.web}/wp-json/wc/store/v1/products/categories?per_page=100&page=${pagina}`, undefined, 15_000);
        if (!res.ok) break;
        const lote = await res.json();
        cats.push(...lote);
        if (lote.length < 100) break;
      }
      // La categoría que se llama como la marca (o «marca-online», «comprar-marca»…), la de más productos
      const candidatas = cats.filter(x => x.count > 0 && (soloLetras(x.name) === clave || soloLetras(x.slug) === clave || soloLetras(x.slug).replace(/online|comprar|tienda|cosmetica|cosmeticos/g, "") === clave))
        .sort((a, b) => b.count - a.count);
      const cat = candidatas[0];
      return cat ? (cat.permalink ?? `${c.web}/categoria-producto/${cat.slug}/`) : null;
    }
    if (c.tipo === "presta" || c.tipo === "rosi") {
      const url = `${c.web}/${c.tipo === "presta" ? "marcas" : "nuestras-marcas"}/${marca.slug}`;
      const productos = c.tipo === "presta" ? await leerPresta(url) : await leerRosi(c, url);
      return productos.length ? url : null;
    }
  } catch { /* la web no responde: se deja sin enlace */ }
  return null;
}

function decodificar(t: string): string {
  return t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
