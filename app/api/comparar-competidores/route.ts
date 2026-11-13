import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { emparejarPorNombre } from "./emparejar-nombre";
import { emparejarConIa } from "./emparejar-ia";
import { motivoSinPareja } from "./motivo";
import { BASE, COLORES_EXTRA, COMPETIDORES, ponerCompetidores, type AjustesCompetidores, type Competidor, claveFila, explicarError, type EstadoComp, type FilaComp, type Manual, type PrecioComp, type ResultadoComp } from "../../comparar-competidores/competidores";
import { competidoresDeGoogle, cuentasMerchant, type Propuesta } from "./merchant";
import { ErrorGoogle } from "../../_google/cliente";
import { buscarListado, detectarPlataforma, nombreDeTienda, leerCompetidor, leerMarcasWeb, leerMisProductos, normalizarEan, type MarcaWeb, type MiProducto, type SuProducto } from "./leer";

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
  // Todas nuestras marcas (feed y página de marcas de nuestra web), leídas como mucho una vez al día
  marcasWeb?: { fecha: string; lista: MarcaWeb[] };
  // Dto. autorizado puesto a mano en las marcas que no están en el comparador de Cosméticos24h
  // (las que sí están lo guardan allí, para que los dos apartados usen el mismo)
  descuentos?: Record<string, number>;
  // Por marca y competidor: productos suyos enlazados a mano con los nuestros
  manuales?: Record<string, Record<string, Manual[]>>;
  // Tiendas quitadas de las de siempre y tiendas añadidas desde la app
  competidores?: AjustesCompetidores;
  // Cuenta de Merchant Center y la última lista de competidores que propuso Google
  merchantId?: string;
  propuestas?: { fecha: string; lista: Propuesta[]; avisos: string[] };
};

// Una marca de este apartado: las del comparador de Cosméticos24h y el resto de las de nuestra web
type Marca = MarcaC24 & { feed?: string; enC24: boolean };

type MarcaC24 = { nombre: string; slug: string; miToken?: string; descuentoMax?: number | null };
type ComparacionC24 = { miUrl: string; suUrl: string; nombre: string; suPrecio: number; suPvp?: number; ean?: string; porEan?: boolean; porParecido?: "referencia" | "nombre" };
type CuponC24 = { pct: number | null; codigo?: string; directo?: boolean; hasta?: string; promo?: { excluidas: string[] } };
type ConfigC24 = { marcas: MarcaC24[]; resultados: { slug: string; revisadoEn?: string; comparaciones: ComparacionC24[] }[]; cupon?: CuponC24; eanVariantes?: Record<string, (string | null)[]> };

const vacia = (): Config => ({ enlaces: {}, auto: {}, resultados: {} });

async function leerJson<T>(clave: string, ruta: string): Promise<T | null> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<T>(clave)) ?? null;
  }
  try { return JSON.parse(await fs.readFile(ruta, "utf-8")); } catch { return null; }
}

async function leerConfig(): Promise<Config> {
  const config = { ...vacia(), ...(await leerJson<Config>(KV_KEY, CONFIG_PATH)) };
  ponerCompetidores(config.competidores);
  return config;
}

const dominioDe = (web: string) => { try { return new URL(web).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

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
  // Un cupón detectado sin código y sin «en tu carrito» no es un cupón (p. ej. «Hasta el 50% de descuento» del Black Friday)
  const cu = c?.cupon;
  const cupon = cu && cu.pct != null && !(cu as { manual?: boolean }).manual && !cu.codigo && !cu.directo ? undefined : cu;
  return { marcas: c?.marcas ?? [], resultados: c?.resultados ?? [], cupon, eanVariantes: c?.eanVariantes ?? {} };
}

const soloLetras = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Todas las marcas: las del comparador de Cosméticos24h (con su dto. autorizado y sus precios) y el resto de las
// de nuestra web. La lista de nuestra web se vuelve a leer si tiene más de un día.
async function todasLasMarcas(config: Config, c24: ConfigC24): Promise<Marca[]> {
  const viejas = !config.marcasWeb || Date.now() - new Date(config.marcasWeb.fecha).getTime() > 24 * 3600_000;
  if (viejas) {
    try {
      config.marcasWeb = { fecha: new Date().toISOString(), lista: await leerMarcasWeb() };
      await guardarConfig(config);
    } catch { /* se sigue con la lista anterior */ }
  }
  const web = config.marcasWeb?.lista ?? [];
  const usadas = new Set<string>();
  // Cada marca del comparador de Cosméticos24h, con su nombre en el feed si se encuentra
  const out: Marca[] = c24.marcas.map(m => {
    const claves = [m.nombre, m.slug, m.miToken ?? ""].map(soloLetras).filter(Boolean);
    const w = web.find(x => !usadas.has(x.feed) && [x.feed, x.nombre, x.slug].map(soloLetras).some(k => claves.includes(k)))
      ?? web.find(x => !usadas.has(x.feed) && claves.some(c => c.length > 3 && soloLetras(x.feed).startsWith(c)));
    if (w) usadas.add(w.feed);
    return { ...m, feed: w?.feed, enC24: true };
  });
  const slugs = new Set(out.map(m => m.slug));
  for (const w of web) {
    if (usadas.has(w.feed)) continue;
    let slug = w.slug;
    for (let n = 2; slugs.has(slug); n++) slug = `${w.slug}-${n}`;
    slugs.add(slug);
    out.push({ nombre: w.nombre, slug, feed: w.feed, enC24: false, descuentoMax: config.descuentos?.[slug] });
  }
  return out;
}

// Lo que ve la página: la configuración, la lista de marcas (con su dto. autorizado) y el cupón de Cosméticos24h
async function respuesta(config: Config) {
  const c24 = await leerC24();
  const marcas = await todasLasMarcas(config, c24);
  const cupon = c24.cupon?.pct != null && c24.cupon.pct > 0
    ? { pct: c24.cupon.pct, codigo: c24.cupon.codigo, directo: c24.cupon.directo, hasta: c24.cupon.hasta, excluidas: c24.cupon.promo?.excluidas ?? [] }
    : null;
  const { marcasWeb: _web, ...resto } = config;
  return NextResponse.json({ ...resto, cupon, marcas: marcas.map(m => ({ nombre: m.nombre, slug: m.slug, descuentoMax: m.descuentoMax ?? null, enC24: m.enC24 })) });
}

export async function GET() {
  return respuesta(await leerConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config = await leerConfig();

  // Enlace del listado de una marca en un competidor, puesto a mano ("" = no la vende)
  // Dto. autorizado de una marca puesto a mano (null = el de Boardfy)
  if (body.action === "descuento") {
    const { slug, descuentoMax } = body as { slug: string; descuentoMax: number | null };
    if (descuentoMax != null && !(descuentoMax >= 0 && descuentoMax <= 90)) return NextResponse.json({ error: "El descuento debe estar entre 0 y 90 %." });
    const valor = descuentoMax == null ? null : Math.round(descuentoMax * 10) / 10;
    const c24 = await leerJson<ConfigC24 & Record<string, unknown>>(KV_KEY_C24, CONFIG_PATH_C24);
    const enC24 = c24?.marcas?.find(m => m.slug === slug);
    if (c24 && enC24) {
      if (valor == null) delete enC24.descuentoMax; else enC24.descuentoMax = valor;
      if (USE_KV) { const { kv } = await import("@vercel/kv"); await kv.set(KV_KEY_C24, c24); }
      else await fs.writeFile(CONFIG_PATH_C24, JSON.stringify(c24, null, 2));
    } else {
      config.descuentos = { ...(config.descuentos ?? {}) };
      if (valor == null) delete config.descuentos[slug]; else config.descuentos[slug] = valor;
      await guardarConfig(config);
    }
    return respuesta(config);
  }

  // Competidores que propone Google (Merchant Center): webs que salen con nosotros en Google Shopping
  if (body.action === "buscar-competidores") {
    let cuenta = String(body.merchantId || config.merchantId || "").replace(/\D/g, "");
    try {
      // Sin número: se toma de la cuenta de Google conectada (la de La Tienda si hay varias)
      if (!cuenta) {
        const cuentas = await cuentasMerchant();
        if (!cuentas.length) return NextResponse.json({ error: "La cuenta de Google conectada no tiene acceso a ningún Merchant Center. Conecta con un usuario que lo tenga en «Conexión con Google», o pon el número a mano." });
        cuenta = (cuentas.find(c => /tienda|cosm/i.test(c.nombre)) ?? cuentas[0]).id;
      }
      config.merchantId = cuenta;
      const { propuestas, avisos } = await competidoresDeGoogle(cuenta);
      config.propuestas = { fecha: new Date().toISOString(), lista: propuestas.slice(0, 40), avisos };
      await anadirPropuestas(config);
    } catch (e) {
      await guardarConfig(config);
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e), sinConexion: e instanceof ErrorGoogle && e.status === 401 });
    }
    await guardarConfig(config);
    return respuesta(config);
  }

  // Añadir una tienda: se mira con qué está hecha su web (Shopify, WooCommerce o PrestaShop) para saber leerla
  if (body.action === "anadir-competidor") {
    let web: string;
    try { web = new URL(/^https?:\/\//.test(String(body.web ?? "").trim()) ? String(body.web).trim() : `https://${String(body.web ?? "").trim()}`).origin; }
    catch { return NextResponse.json({ error: "Esa dirección no es válida. Pon algo como https://tienda.com" }); }
    const dominio = dominioDe(web);
    const ajustes: AjustesCompetidores = { extra: [...(config.competidores?.extra ?? [])], quitados: [...(config.competidores?.quitados ?? [])], descartados: (config.competidores?.descartados ?? []).filter(d => d !== dominio) };
    const yaBase = BASE.find(c => dominioDe(c.web) === dominio);
    if (yaBase) {
      ajustes.quitados = ajustes.quitados!.filter(id => id !== yaBase.id);
    } else if (!ajustes.extra!.some(c => dominioDe(c.web) === dominio)) {
      const tipo = await detectarPlataforma(web);
      if (!tipo) return NextResponse.json({ error: `No sé leer ${dominio}: su web no es Shopify, WooCommerce ni PrestaShop. Si te interesa, pídemelo y la preparo a mano.` });
      const nombre = String(body.nombre ?? "").trim() || await nombreDeTienda(web);
      const [color, fondo] = COLORES_EXTRA[ajustes.extra!.length % COLORES_EXTRA.length];
      let id = dominio.replace(/[^a-z0-9]+/g, "-");
      while ([...BASE, ...ajustes.extra!].some(c => c.id === id)) id += "-2";
      const nuevo: Competidor = { id, nombre, corto: nombre.length > 16 ? dominio : nombre, web, tipo, color, fondo, extra: true };
      ajustes.extra!.push(nuevo);
    }
    config.competidores = ajustes;
    ponerCompetidores(ajustes);
    await guardarConfig(config);
    return respuesta(config);
  }

  // Quitar una tienda de la comparación (las de siempre se pueden volver a poner) o volver a ponerla
  if (body.action === "quitar-competidor" || body.action === "activar-competidor") {
    const id = String(body.id ?? "");
    const ajustes: AjustesCompetidores = { extra: [...(config.competidores?.extra ?? [])], quitados: [...(config.competidores?.quitados ?? [])], descartados: config.competidores?.descartados };
    if (body.action === "activar-competidor") ajustes.quitados = ajustes.quitados!.filter(x => x !== id);
    else if (BASE.some(c => c.id === id)) { if (!ajustes.quitados!.includes(id)) ajustes.quitados!.push(id); }
    else {
      // Una añadida que se quita no vuelve a añadirse sola con la próxima búsqueda de Google
      const quitada = ajustes.extra!.find(c => c.id === id);
      if (quitada) ajustes.descartados = [...new Set([...(config.competidores?.descartados ?? []), dominioDe(quitada.web)])];
      ajustes.extra = ajustes.extra!.filter(c => c.id !== id);
    }
    if (!BASE.some(c => c.id === id) && body.action === "quitar-competidor") {
      // Una tienda añadida que se quita: fuera también sus enlaces y precios guardados
      for (const slug of Object.keys(config.enlaces)) { delete config.enlaces[slug]?.[id]; delete config.auto[slug]?.[id]; }
      for (const r of Object.values(config.resultados)) { delete r.competidores[id]; for (const f of r.filas) delete f.precios[id]; }
    }
    config.competidores = ajustes;
    ponerCompetidores(ajustes);
    await guardarConfig(config);
    return respuesta(config);
  }

  if (body.action === "enlace") {
    const { slug, comp, url } = body as { slug: string; comp: string; url: string };
    const limpio = (url ?? "").trim();
    if (limpio && !/^https?:\/\//.test(limpio)) return NextResponse.json({ error: "El enlace tiene que empezar por https://" });
    config.enlaces[slug] = { ...(config.enlaces[slug] ?? {}), [comp]: limpio };
    config.auto[slug] = { ...(config.auto[slug] ?? {}), [comp]: false };
    await guardarConfig(config);
    return respuesta(config);
  }

  // Enlazar a mano uno de sus productos sin pareja con uno de los nuestros, o deshacerlo.
  // Se cambia ya en la última revisión (sin tener que revisar otra vez) y se respeta en las siguientes.
  if (body.action === "emparejar" || body.action === "desemparejar") {
    const { slug, comp, suUrl, suTitulo, mio } = body as { slug: string; comp: string; suUrl: string; suTitulo: string; mio: string };
    const r = config.resultados[slug];
    const fila = r?.filas.find(f => claveFila(f) === mio);
    const estado = r?.competidores[comp];
    if (!r || !fila || !estado) return NextResponse.json({ error: "No encuentro ese producto: pulsa «Revisar» y vuelve a intentarlo." });
    const lista = (config.manuales?.[slug]?.[comp] ?? []).filter(x => x.mio !== mio && !(x.suUrl === suUrl && x.suTitulo === suTitulo));
    if (body.action === "emparejar") {
      const sin = estado.sinPareja ?? [];
      const k = sin.findIndex(x => x.url === suUrl && x.titulo === suTitulo);
      if (k < 0) return NextResponse.json({ error: "Ese producto suyo ya no está sin enlazar: pulsa «Revisar»." });
      const x = sin[k];
      lista.push({ suUrl, suTitulo, mio });
      fila.precios[comp] = { precio: x.precio ?? 0, pvp: x.pvp, url: suUrl, titulo: suTitulo, por: "manual" };
      estado.sinPareja = sin.filter((_, j) => j !== k);
    } else {
      const p = fila.precios[comp];
      if (p?.por === "manual") {
        delete fila.precios[comp];
        estado.sinPareja = [{ titulo: p.titulo, url: p.url, precio: p.precio, pvp: p.pvp, motivo: "Desenlazado a mano" }, ...(estado.sinPareja ?? [])];
      }
    }
    estado.emparejados = r.filas.filter(f => f.precios[comp]).length;
    config.manuales = { ...(config.manuales ?? {}), [slug]: { ...(config.manuales?.[slug] ?? {}), [comp]: lista } };
    await guardarConfig(config);
    return respuesta(config);
  }

  if (body.action === "revisar") {
    const inicio = Date.now();
    const limite = inicio + 200_000;
    const c24 = await leerC24();
    const marca = (await todasLasMarcas(config, c24)).find(m => m.slug === body.slug);
    if (!marca) return NextResponse.json({ error: "No encuentro esa marca" });

    let mios: MiProducto[];
    try { mios = (await leerMisProductos(marca)).filter(m => !m.esPack); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }); }
    if (!mios.length) return NextResponse.json({ error: `No hay productos de ${marca.nombre} en el feed de nuestra web` });

    const filas: FilaComp[] = mios.map(m => ({ nombre: m.nombre, url: m.url, ean: m.ean ?? undefined, formato: m.formato, precio: m.precio, pvp: m.pvp, precios: {} }));
    const filaDe = new Map(mios.map((m, i) => [m.clave, filas[i]]));
    const enlaces = { ...(config.enlaces[marca.slug] ?? {}) };
    const auto = { ...(config.auto[marca.slug] ?? {}) };
    const estados: Record<string, EstadoComp> = {};

    // Todas las tiendas (también Cosméticos24h, de su web): se leen todas a la vez
    await Promise.all(COMPETIDORES.map(async comp => {
      try {
        // Sin enlace todavía (o no se encontró sola): se busca el listado de la marca en su web
        if (enlaces[comp.id] === undefined || (enlaces[comp.id] === "" && auto[comp.id] !== false)) {
          const encontrado = await buscarListado(comp, marca);
          enlaces[comp.id] = encontrado ?? "";
          auto[comp.id] = true;
        }
        const enlace = enlaces[comp.id];
        if (!enlace) { estados[comp.id] = { url: "" , auto: auto[comp.id] }; return; }
        const suyos = await leerCompetidor(comp, enlace, limite, marca.nombre, comp.id === "c24" ? { ...c24.eanVariantes } : undefined);
        // Si aun así falta el EAN de algún producto de Cosméticos24h, se toma de su comparador cuando ya lo tiene emparejado
        if (comp.id === "c24") {
          const r24 = c24.resultados.find(r => r.slug === marca.slug);
          const eanDe = new Map((r24?.comparaciones ?? []).map(x => [x.suUrl.split("?")[0], normalizarEan(x.ean) ?? mios.find(m => m.url === x.miUrl)?.ean ?? null]));
          for (const s of suyos) {
            const ean = eanDe.get(s.url);
            if (ean && s.variantes.length === 1 && !s.variantes[0].ean) s.variantes[0].ean = ean;
          }
        }
        const { n, sinPareja } = await emparejar(comp.id, comp.nombre, suyos, mios, filaDe, marca, config.manuales?.[marca.slug]?.[comp.id] ?? []);
        estados[comp.id] = { url: enlace, auto: auto[comp.id], leidos: suyos.length, emparejados: n, sinPareja };
      } catch (e) {
        estados[comp.id] = { url: enlaces[comp.id], auto: auto[comp.id], error: textoError(e) };
      }
    }));

    config.enlaces[marca.slug] = enlaces;
    config.auto[marca.slug] = auto;
    const antes = config.resultados[marca.slug];
    config.resultados[marca.slug] = { revisadoEn: new Date().toISOString(), filas, competidores: estados, cambios: antes ? cambios(antes, filas) : undefined };
    await guardarConfig(config);
    return respuesta(config);
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}

// Empareja los productos de un competidor con los nuestros: primero los enlazados a mano, luego por EAN, lo que quede por referencia o nombre
// y, lo que siga sin pareja, con IA (nombres en otro idioma). Devuelve cuántos de los nuestros han encontrado pareja.
async function emparejar(comp: string, tienda: string, suyos: SuProducto[], mios: MiProducto[], filaDe: Map<string, FilaComp>, marca: MarcaC24, manuales: Manual[]): Promise<{ n: number; sinPareja: NonNullable<EstadoComp["sinPareja"]> }> {
  const usados = new Set<string>();
  const suyosUsados = new Set<string>();
  const poner = (m: MiProducto, s: SuProducto, i: number, por: PrecioComp["por"]) => {
    const v = s.variantes[i];
    filaDe.get(m.clave)!.precios[comp] = { precio: v.precio, pvp: v.pvp && v.pvp > v.precio + 0.005 ? v.pvp : undefined, url: s.url, titulo: v.titulo ? `${s.titulo} · ${v.titulo}` : s.titulo, por };
    usados.add(m.clave); suyosUsados.add(`${s.url}#${i}`);
  };
  // Los enlazados a mano
  const tituloDe = (s: SuProducto, i: number) => s.variantes[i]?.titulo ? `${s.titulo} · ${s.variantes[i].titulo}` : s.titulo;
  const miDeFila = new Map(mios.map(m => [claveFila(filaDe.get(m.clave)!), m]));
  for (const x of manuales) {
    const m = miDeFila.get(x.mio);
    const s = suyos.find(s => s.url === x.suUrl);
    const i = s ? s.variantes.findIndex((_, k) => tituloDe(s, k) === x.suTitulo) : -1;
    if (m && s && i >= 0 && !usados.has(m.clave) && !suyosUsados.has(`${s.url}#${i}`)) poner(m, s, i, "manual");
  }
  const porEan = new Map(mios.filter(m => m.ean).map(m => [m.ean!, m]));
  for (const s of suyos) s.variantes.forEach((v, i) => {
    const m = v.ean ? porEan.get(v.ean) : undefined;
    if (m && !usados.has(m.clave) && !suyosUsados.has(`${s.url}#${i}`)) poner(m, s, i, "ean");
  });
  const libres = suyos.filter(s => s.variantes.some((_, i) => !suyosUsados.has(`${s.url}#${i}`)));
  for (const p of emparejarPorNombre(libres, mios.filter(m => !usados.has(m.clave)), { nombre: marca.nombre, slug: marca.slug, miToken: marca.miToken ?? marca.slug })) {
    if (usados.has(p.mp.clave) || suyosUsados.has(`${p.s.url}#${p.i}`)) continue;
    poner(p.mp, p.s, p.i, p.por);
  }
  // Lo que queda, con IA
  const susLibres = suyos.flatMap(s => s.variantes.map((v, i) => ({ s, i, v })).filter(x => !suyosUsados.has(`${s.url}#${x.i}`)));
  const misLibres = mios.filter(m => !usados.has(m.clave));
  const porClave = new Map(susLibres.map(x => [`${x.s.url}#${x.i}`, x]));
  const parejas = await emparejarConIa(
    susLibres.map(x => ({ clave: `${x.s.url}#${x.i}`, titulo: x.v.titulo ? `${x.s.titulo} · ${x.v.titulo}` : x.s.titulo, precio: x.v.precio, esPack: x.s.esPack })),
    misLibres.map(m => ({ clave: m.clave, nombre: m.nombre, formato: m.formato, precio: m.precio, esPack: m.esPack })),
    marca.nombre, tienda);
  const miDe = new Map(misLibres.map(m => [m.clave, m]));
  for (const p of parejas) {
    const x = porClave.get(p.su), m = miDe.get(p.mio);
    if (x && m && !usados.has(m.clave)) poner(m, x.s, x.i, "ia");
  }
  // Sus productos sin pareja y por qué (si un producto suyo tiene varios formatos y alguno ya está enlazado, no cuenta)
  const mk = { nombre: marca.nombre, slug: marca.slug, miToken: marca.miToken ?? marca.slug };
  const sinPareja = suyos
    .filter(s => !s.variantes.some((_, i) => suyosUsados.has(`${s.url}#${i}`)))
    .flatMap(s => s.variantes.map(v => {
      const titulo = v.titulo ? `${s.titulo} · ${v.titulo}` : s.titulo;
      return { titulo, url: s.url, precio: v.precio, pvp: v.pvp && v.pvp > v.precio + 0.005 ? v.pvp : undefined, motivo: motivoSinPareja(titulo, v.precio, s.esPack, mios, usados, mk) };
    }))
    .slice(0, 150);
  return { n: usados.size, sinPareja };
}

// Las webs que propone Google se añaden solas a la comparación, hasta MAX_AUTO, si se pueden leer
// (Shopify, WooCommerce o PrestaShop). Las que no, se marcan en la propuesta. Las quitadas a mano no vuelven.
const MAX_AUTO = 15;
async function anadirPropuestas(config: Config) {
  const ajustes: AjustesCompetidores = { extra: [...(config.competidores?.extra ?? [])], quitados: [...(config.competidores?.quitados ?? [])], descartados: [...(config.competidores?.descartados ?? [])] };
  const conocidos = new Set([...BASE, ...ajustes.extra!].map(c => dominioDe(c.web)));
  const descartados = new Set(ajustes.descartados);
  const lista = config.propuestas?.lista ?? [];
  // tienda.pilar-delgado.com y pilar-delgado.com son la misma tienda
  const mismo = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  const candidatas = lista.filter(p => ![...conocidos].some(k => mismo(k, p.dominio)) && !descartados.has(p.dominio));
  let auto = ajustes.extra!.filter(c => c.auto).length;
  const huecos = Math.max(0, MAX_AUTO - auto);
  const probadas = await Promise.all(candidatas.slice(0, huecos + 10).map(async p => ({ p, tipo: await detectarPlataforma(p.web) })));
  for (const { p, tipo } of probadas) {
    if (!tipo) { p.noLegible = true; continue; }
    if (auto >= MAX_AUTO) break;
    const nombre = await nombreDeTienda(p.web);
    const [color, fondo] = COLORES_EXTRA[ajustes.extra!.length % COLORES_EXTRA.length];
    let id = p.dominio.replace(/[^a-z0-9]+/g, "-");
    while ([...BASE, ...ajustes.extra!].some(c => c.id === id)) id += "-2";
    ajustes.extra!.push({ id, nombre, corto: nombre.length > 16 ? p.dominio : nombre, web: p.web, tipo, color, fondo, extra: true, auto: true });
    p.anadida = true;
    auto++;
  }
  config.competidores = ajustes;
  ponerCompetidores(ajustes);
}

// Productos en los que ahora vamos más caros que algún competidor, y en los que ya no, respecto a la revisión anterior
function cambios(antes: ResultadoComp, filas: FilaComp[]): ResultadoComp["cambios"] {
  const clave = (f: FilaComp) => `${f.url}#${f.ean ?? f.formato ?? ""}`;
  const caro = (f: FilaComp) => Object.values(f.precios).some(p => p.precio < f.precio - 0.005);
  const previas = new Map(antes.filas.map(f => [clave(f), f]));
  const nombre = (f: FilaComp) => f.formato && !f.nombre.includes(f.formato) ? `${f.nombre} (${f.formato})` : f.nombre;
  const nuevosCaros: string[] = [], yaNoCaros: string[] = [];
  for (const f of filas) {
    const p = previas.get(clave(f));
    if (!p) continue;
    if (caro(f) && !caro(p)) nuevosCaros.push(nombre(f));
    if (!caro(f) && caro(p)) yaNoCaros.push(nombre(f));
  }
  return { desde: antes.revisadoEn, nuevosCaros, yaNoCaros };
}

// Los errores técnicos («fetch failed (ECONNRESET)») se cambian por una explicación que se entienda
function textoError(e: unknown): string {
  if (!(e instanceof Error)) return explicarError(String(e));
  const causa = (e as Error & { cause?: { code?: string; message?: string } }).cause;
  return explicarError(`${e.message}${causa ? ` (${causa.code ?? causa.message})` : ""}`);
}
