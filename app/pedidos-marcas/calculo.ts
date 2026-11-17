// Cruce de ventas (informe COMPRAS_….xls) y stock (control_stocks-….csv) para el pedido a cada marca.

export type FilaPedido = { producto: string; propiedad: string; ean: string; stock: number; ventas: number; sinPagar: number; pendientes: number };
export type MarcaPedido = { marca: string; grupos: { stock: number; filas: FilaPedido[] }[]; total: number };
export type Resultado = {
  marcas: MarcaPedido[];
  desde: string; hasta: string; pendDesde: string; pedidosPendientes: number; sinEnviarDesde: string; antiguosSinEnviar: number; pedidos: number; lineasVenta: number; unidades: number;
  sinCruzar: { marca: string; producto: string; propiedad: string; ean: string; ventas: number; pendientes: number }[];
  sinControl: number; descatalogados: number; anulados: number; enPacks: number;
};
export type Opciones = { stockMax: number; incluirDescatalogados: boolean; soloSinEnviar: boolean; /** AAAA-MM-DD; vacío = desde el día anterior al último pedido */ sinEnviarDesde: string };

// Quita espacios raros, caracteres invisibles (el programa mete alguno en los EAN) y dobles espacios
const limpiar = (s: string) => (s ?? "").replace(/[​-‏⁠﻿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const limpiarEan = (s: string) => limpiar(s).replace(/\s/g, "");
const eanValido = (e: string) => e !== "" && e !== "-" && e !== "0";
const clave = (producto: string, propiedad: string) => `${limpiar(producto).toLowerCase()}|${limpiar(propiedad).toLowerCase()}`;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ANULADO = /cancel|anulad|devuel|devoluc|rechaz|fallid|error/i;
const NO_PRODUCTO = /^(gastos de|descuento|cup[oó]n|promoci|vale|cheque|tarjeta regalo)/i;

// El stock que el programa pone a los productos sin control de stock
const SIN_CONTROL = -2147483648;

function indices(cab: string[], nombres: Record<string, string[]>, archivo: string) {
  const norm = cab.map(c => sinTildes(limpiar(c).replace(/\*/g, "")));
  const out: Record<string, number> = {};
  for (const [k, alts] of Object.entries(nombres)) {
    const i = norm.findIndex(c => alts.some(a => c === sinTildes(a)));
    if (i < 0) throw new Error(`En el archivo de ${archivo} falta la columna «${alts[0]}». ¿Es la exportación de siempre?`);
    out[k] = i;
  }
  return out;
}

/** Lee el CSV de control de stocks (separado por «;», con o sin comillas). */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  const t = texto.replace(/^﻿/, "");
  const sep = (t.split("\n")[0].match(/;/g)?.length ?? 0) >= (t.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"' && campo === "") comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some(c => c !== "")) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some(c => c !== "")) filas.push(fila);
  return filas;
}

const entero = (s: string) => {
  const n = parseInt(limpiar(s).replace(/\./g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

// «17/11/2026 07:21:56» → número ordenable
const ordenFecha = (s: string) => {
  const m = limpiar(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  return m ? Number(`${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}${(m[4] ?? "0").padStart(2, "0")}${m[5] ?? "00"}`) : 0;
};

export function cruzar(ventasFilas: string[][], stockFilas: string[][], op: Opciones): Resultado {
  // Ventas
  const iv = ventasFilas.findIndex(f => f.some(c => sinTildes(limpiar(c)) === "ean") && f.some(c => sinTildes(limpiar(c)) === "cantidad"));
  if (iv < 0) throw new Error("El archivo de ventas no tiene las columnas EAN y Cantidad. Sube el «COMPRAS_….xls» de la tienda.");
  const cv = indices(ventasFilas[iv], {
    id: ["ID"], fecha: ["Fecha"], estado: ["Estado"], pagado: ["Pagado"], marca: ["Marca"], producto: ["Producto"], propiedad: ["Propiedad"], ean: ["EAN"], cantidad: ["Cantidad"],
  }, "ventas");

  // Stock
  const is = stockFilas.findIndex(f => f.some(c => sinTildes(limpiar(c).replace(/\*/g, "")) === "stock actual"));
  if (is < 0) throw new Error("El archivo de stock no tiene la columna STOCK ACTUAL. Sube el «control_stocks-….csv» de la tienda.");
  const cs = indices(stockFilas[is], {
    marca: ["MARCA"], producto: ["PRODUCTO"], propiedad: ["PROPIEDAD"], ean: ["EAN"], stock: ["STOCK ACTUAL"], descatalogado: ["DESCATALOGADO"],
  }, "stock");

  type Prod = { marca: string; producto: string; propiedad: string; ean: string; stock: number | null; descatalogado: boolean; ventas: number; sinPagar: number; pendientes: number };
  const porEan = new Map<string, Prod[]>();
  const porNombre = new Map<string, Prod>();
  const porSoloNombre = new Map<string, Prod[]>();
  for (const f of stockFilas.slice(is + 1)) {
    const p: Prod = {
      marca: limpiar(f[cs.marca]), producto: limpiar(f[cs.producto]), propiedad: limpiar(f[cs.propiedad]), ean: limpiarEan(f[cs.ean]),
      stock: entero(f[cs.stock]), descatalogado: /^s[ií]/i.test(limpiar(f[cs.descatalogado])), ventas: 0, sinPagar: 0, pendientes: 0,
    };
    if (!p.producto) continue;
    if (eanValido(p.ean)) porEan.set(p.ean, [...(porEan.get(p.ean) ?? []), p]);
    porNombre.set(clave(p.producto, p.propiedad), p);
    const n = clave(p.producto, "");
    porSoloNombre.set(n, [...(porSoloNombre.get(n) ?? []), p]);
  }

  const pedidos = new Set<string>();
  // Pedidos sin enviar que cuentan: desde la fecha elegida (por defecto, desde ayer). Los más antiguos suelen ser
  // pedidos atascados (sin pagar desde hace semanas) y no deben sacar productos en el pedido del día.
  let ultimo = 0;
  for (const f of ventasFilas.slice(iv + 1)) ultimo = Math.max(ultimo, ordenFecha(f[cv.fecha] ?? ""));
  let corte = op.sinEnviarDesde;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(corte) && ultimo) {
    const t = String(ultimo);
    const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8) - 1));
    corte = d.toISOString().slice(0, 10);
  }
  const corteNum = corte ? Number(corte.replace(/-/g, "") + "0000") : 0;
  const antiguos = new Set<string>();
  const pedidosPend = new Set<string>();
  let pendDesde = "";
  let desde = "", hasta = "", lineasVenta = 0, unidades = 0, anulados = 0, enPacks = 0;
  const sinCruzar = new Map<string, Resultado["sinCruzar"][number]>();
  for (const f of ventasFilas.slice(iv + 1)) {
    const marca = limpiar(f[cv.marca]);
    const producto = limpiar(f[cv.producto]);
    if (!producto || NO_PRODUCTO.test(marca)) continue;
    const ean = limpiarEan(f[cv.ean]);
    const propiedad = limpiar(f[cv.propiedad]);
    if (!eanValido(ean) && propiedad === "-" ) continue; // líneas de gastos, descuentos…
    if (ANULADO.test(limpiar(f[cv.estado]))) { anulados++; continue; }
    const cant = Number(limpiar(f[cv.cantidad]).replace(",", ".")) || 0;
    if (cant <= 0) continue;
    lineasVenta++;
    unidades += cant;
    pedidos.add(limpiar(f[cv.id]));
    const fe = limpiar(f[cv.fecha]);
    if (fe && (!desde || ordenFecha(fe) < ordenFecha(desde))) desde = fe;
    if (fe && (!hasta || ordenFecha(fe) > ordenFecha(hasta))) hasta = fe;

    // Por EAN; si el EAN se repite en el stock, el que coincide en formato; sin EAN, por nombre y formato
    let p: Prod | undefined;
    let factor = 1;
    const candidatos = eanValido(ean) ? porEan.get(ean) : undefined;
    if (candidatos) p = candidatos.length === 1 ? candidatos[0] : candidatos.find(c => c.propiedad.toLowerCase() === propiedad.toLowerCase()) ?? candidatos[0];
    else p = porNombre.get(clave(producto, propiedad));
    // Packs Dúo/Trío del mismo producto: la tienda les pone el EAN del producto con «-1», «-2»… (o ninguno)
    // y gastan stock del producto suelto, así que cuentan 2 o 3 unidades
    if (!p) {
      const m = ean.match(/^(.+)-(\d)$/);
      const pack = sinTildes(propiedad).match(/\b(duo|trio)\b/);
      const base = m ? porEan.get(m[1]) : undefined;
      const mismoNombre = porSoloNombre.get(clave(producto, ""));
      const cand = base?.length === 1 ? base[0] : !m && pack && mismoNombre?.length === 1 ? mismoNombre[0] : undefined;
      if (cand && (m || pack)) {
        p = cand;
        factor = pack ? (pack[1] === "duo" ? 2 : 3) : Number(m![2]) + 1;
        enPacks += cant * factor;
      }
    }
    // Sin pagar: pedido sin enviar y con «Pagado» en No
    // Sin enviar: el pedido aún no ha salido (lo de ayer por la tarde y hoy). Sin pagar: además, «Pagado» en No
    const sinEnviar = !/enviad/i.test(limpiar(f[cv.estado])) && ordenFecha(fe) >= corteNum;
    if (!/enviad/i.test(limpiar(f[cv.estado])) && !sinEnviar) antiguos.add(limpiar(f[cv.id]));
    const sinPagar = sinEnviar && /^no/i.test(limpiar(f[cv.pagado]));
    if (sinEnviar) {
      pedidosPend.add(limpiar(f[cv.id]));
      if (fe && (!pendDesde || ordenFecha(fe) < ordenFecha(pendDesde))) pendDesde = fe;
    }
    if (p) { p.ventas += cant * factor; if (sinPagar) p.sinPagar += cant * factor; if (sinEnviar) p.pendientes += cant * factor; }
    else {
      const k = `${ean}|${clave(producto, propiedad)}`;
      const s = sinCruzar.get(k) ?? { marca, producto, propiedad, ean, ventas: 0, pendientes: 0 };
      s.ventas += cant;
      if (sinEnviar) s.pendientes += cant;
      sinCruzar.set(k, s);
    }
  }

  // Lista: vendidos en el periodo con stock ≤ stockMax
  let sinControl = 0, descatalogados = 0;
  const porMarca = new Map<string, Map<number, FilaPedido[]>>();
  const todos = new Set<Prod>([...porNombre.values(), ...[...porEan.values()].flat()]);
  for (const p of todos) {
    if (p.ventas <= 0 || (op.soloSinEnviar && p.pendientes <= 0)) continue;
    if (p.stock === null || p.stock === SIN_CONTROL) { sinControl++; continue; }
    if (p.stock > op.stockMax) continue;
    if (p.descatalogado && !op.incluirDescatalogados) { descatalogados++; continue; }
    const marca = p.marca.toLowerCase() || "sin marca";
    const g = porMarca.get(marca) ?? new Map<number, FilaPedido[]>();
    g.set(p.stock, [...(g.get(p.stock) ?? []), { producto: p.producto, propiedad: p.propiedad, ean: p.ean, stock: p.stock, ventas: p.ventas, sinPagar: p.sinPagar, pendientes: p.pendientes }]);
    porMarca.set(marca, g);
  }

  const marcas: MarcaPedido[] = [...porMarca].map(([marca, g]) => {
    const grupos = [...g].sort((a, b) => a[0] - b[0]).map(([stock, filas]) => ({
      stock, filas: filas.sort((a, b) => b.ventas - a.ventas || a.producto.localeCompare(b.producto, "es") || a.propiedad.localeCompare(b.propiedad, "es", { numeric: true })),
    }));
    return { marca, grupos, total: grupos.reduce((n, x) => n + x.filas.length, 0) };
  }).sort((a, b) => a.marca.localeCompare(b.marca, "es"));

  return {
    marcas, desde, hasta, pendDesde, pedidosPendientes: pedidosPend.size, sinEnviarDesde: corte, antiguosSinEnviar: antiguos.size, pedidos: pedidos.size, lineasVenta, unidades,
    sinCruzar: [...sinCruzar.values()].filter(x => !op.soloSinEnviar || x.pendientes > 0).sort((a, b) => a.marca.localeCompare(b.marca, "es") || b.ventas - a.ventas),
    sinControl, descatalogados, anulados, enPacks,
  };
}

export const AVISO_SIN_PAGAR = "*Compra sin finalizar, o no realizado el pago";

/** Texto para copiar, con el mismo formato que el que se manda a cada marca (columnas separadas por tabuladores). */
export function textoMarca(m: MarcaPedido): string {
  const l: string[] = [`${m.marca}\t\t\t\t`];
  m.grupos.forEach((g, i) => {
    if (i > 0) l.push("\t\t\t\t\t");
    l.push(`\tstock ${g.stock}\t\t\t\t`);
    for (const f of g.filas) l.push(`•  ${f.producto}\t${f.propiedad}\t${f.ean}\t-ventas\t${f.ventas}${f.sinPagar > 0 ? `\t${AVISO_SIN_PAGAR}` : ""}`);
  });
  return l.join("\n");
}
