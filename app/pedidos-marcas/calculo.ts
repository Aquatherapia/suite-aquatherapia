// Cruce de ventas (informe COMPRAS_….xls) y stock (control_stocks-….csv) para el pedido a cada marca.

export type FilaPedido = { producto: string; propiedad: string; ean: string; stock: number; ventas: number };
export type MarcaPedido = { marca: string; grupos: { stock: number; filas: FilaPedido[] }[]; total: number };
export type Resultado = {
  marcas: MarcaPedido[];
  desde: string; hasta: string; pedidos: number; lineasVenta: number; unidades: number;
  sinCruzar: { marca: string; producto: string; propiedad: string; ean: string; ventas: number }[];
  sinControl: number; descatalogados: number; anulados: number;
};
export type Opciones = { stockMax: number; incluirDescatalogados: boolean };

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
    id: ["ID"], fecha: ["Fecha"], estado: ["Estado"], marca: ["Marca"], producto: ["Producto"], propiedad: ["Propiedad"], ean: ["EAN"], cantidad: ["Cantidad"],
  }, "ventas");

  // Stock
  const is = stockFilas.findIndex(f => f.some(c => sinTildes(limpiar(c).replace(/\*/g, "")) === "stock actual"));
  if (is < 0) throw new Error("El archivo de stock no tiene la columna STOCK ACTUAL. Sube el «control_stocks-….csv» de la tienda.");
  const cs = indices(stockFilas[is], {
    marca: ["MARCA"], producto: ["PRODUCTO"], propiedad: ["PROPIEDAD"], ean: ["EAN"], stock: ["STOCK ACTUAL"], descatalogado: ["DESCATALOGADO"],
  }, "stock");

  type Prod = { marca: string; producto: string; propiedad: string; ean: string; stock: number | null; descatalogado: boolean; ventas: number };
  const porEan = new Map<string, Prod[]>();
  const porNombre = new Map<string, Prod>();
  for (const f of stockFilas.slice(is + 1)) {
    const p: Prod = {
      marca: limpiar(f[cs.marca]), producto: limpiar(f[cs.producto]), propiedad: limpiar(f[cs.propiedad]), ean: limpiarEan(f[cs.ean]),
      stock: entero(f[cs.stock]), descatalogado: /^s[ií]/i.test(limpiar(f[cs.descatalogado])), ventas: 0,
    };
    if (!p.producto) continue;
    if (eanValido(p.ean)) porEan.set(p.ean, [...(porEan.get(p.ean) ?? []), p]);
    porNombre.set(clave(p.producto, p.propiedad), p);
  }

  const pedidos = new Set<string>();
  let desde = "", hasta = "", lineasVenta = 0, unidades = 0, anulados = 0;
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
    const candidatos = eanValido(ean) ? porEan.get(ean) : undefined;
    if (candidatos) p = candidatos.length === 1 ? candidatos[0] : candidatos.find(c => c.propiedad.toLowerCase() === propiedad.toLowerCase()) ?? candidatos[0];
    else p = porNombre.get(clave(producto, propiedad));
    if (p) p.ventas += cant;
    else {
      const k = `${ean}|${clave(producto, propiedad)}`;
      const s = sinCruzar.get(k) ?? { marca, producto, propiedad, ean, ventas: 0 };
      s.ventas += cant;
      sinCruzar.set(k, s);
    }
  }

  // Lista: vendidos en el periodo con stock ≤ stockMax
  let sinControl = 0, descatalogados = 0;
  const porMarca = new Map<string, Map<number, FilaPedido[]>>();
  const todos = new Set<Prod>([...porNombre.values(), ...[...porEan.values()].flat()]);
  for (const p of todos) {
    if (p.ventas <= 0) continue;
    if (p.stock === null || p.stock === SIN_CONTROL) { sinControl++; continue; }
    if (p.stock > op.stockMax) continue;
    if (p.descatalogado && !op.incluirDescatalogados) { descatalogados++; continue; }
    const marca = p.marca.toLowerCase() || "sin marca";
    const g = porMarca.get(marca) ?? new Map<number, FilaPedido[]>();
    g.set(p.stock, [...(g.get(p.stock) ?? []), { producto: p.producto, propiedad: p.propiedad, ean: p.ean, stock: p.stock, ventas: p.ventas }]);
    porMarca.set(marca, g);
  }

  const marcas: MarcaPedido[] = [...porMarca].map(([marca, g]) => {
    const grupos = [...g].sort((a, b) => a[0] - b[0]).map(([stock, filas]) => ({
      stock, filas: filas.sort((a, b) => b.ventas - a.ventas || a.producto.localeCompare(b.producto, "es") || a.propiedad.localeCompare(b.propiedad, "es", { numeric: true })),
    }));
    return { marca, grupos, total: grupos.reduce((n, x) => n + x.filas.length, 0) };
  }).sort((a, b) => a.marca.localeCompare(b.marca, "es"));

  return {
    marcas, desde, hasta, pedidos: pedidos.size, lineasVenta, unidades,
    sinCruzar: [...sinCruzar.values()].sort((a, b) => a.marca.localeCompare(b.marca, "es") || b.ventas - a.ventas),
    sinControl, descatalogados, anulados,
  };
}

/** Texto para copiar, con el mismo formato que el que se manda a cada marca (columnas separadas por tabuladores). */
export function textoMarca(m: MarcaPedido): string {
  const l: string[] = [`${m.marca}\t\t\t\t`];
  m.grupos.forEach((g, i) => {
    if (i > 0) l.push("\t\t\t\t\t");
    l.push(`\tstock ${g.stock}\t\t\t\t`);
    for (const f of g.filas) l.push(`•  ${f.producto}\t${f.propiedad}\t${f.ean}\t-ventas\t${f.ventas}`);
  });
  return l.join("\n");
}
