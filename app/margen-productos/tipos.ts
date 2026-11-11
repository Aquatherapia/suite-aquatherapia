// Tipos y cálculos del apartado «Margen de cada producto», compartidos por la página y el servidor.

export const IVA = 0.21;
// Por debajo de este margen (sobre la venta sin IVA) se marca como «margen bajo», como en «Control de márgenes»
export const MARGEN_BAJO = 0.3;
// Por encima de este, el coste suele estar mal cargado (demasiado bajo)
export const MARGEN_RARO = 0.8;

// Un formato de producto del feed: [marca, producto, EAN, PVP, precio de venta, coste sin IVA (0 = sin coste), ficha, en stock]
export type Fila = [string, string, string, number, number, number, string, 0 | 1];

export type Datos = { fecha: string; filas: Fila[] };

export type Estado = "pierde" | "bajo" | "ok" | "raro" | "sin-coste";

export type Producto = {
  marca: string; producto: string; ean: string; ficha: string; stock: boolean;
  pvp: number; venta: number; descuento: number; // descuento de la oferta sobre el PVP (0 a 1)
  ventaSinIva: number; coste: number | null;
  margen: number | null;     // € por unidad
  margenPct: number | null;  // sobre la venta sin IVA
  margenPvpPct: number | null; // el que habría sin la oferta
  estado: Estado;
};

export function calcular(f: Fila): Producto {
  const [marca, producto, ean, pvp, venta, c, ficha, stock] = f;
  const ventaSinIva = venta / (1 + IVA);
  const coste = c > 0 ? c : null;
  const margen = coste === null ? null : ventaSinIva - coste;
  const margenPct = margen === null ? null : margen / ventaSinIva;
  const pvpSinIva = pvp / (1 + IVA);
  const margenPvpPct = coste === null || !pvp ? null : (pvpSinIva - coste) / pvpSinIva;
  const estado: Estado = margenPct === null ? "sin-coste" : margenPct < 0 ? "pierde" : margenPct < MARGEN_BAJO ? "bajo" : margenPct > MARGEN_RARO ? "raro" : "ok";
  return { marca, producto, ean, ficha, stock: !!stock, pvp, venta, descuento: pvp && venta < pvp ? 1 - venta / pvp : 0, ventaSinIva, coste, margen, margenPct, margenPvpPct, estado };
}

export type ResumenMarca = {
  marca: string; productos: number; conCoste: number;
  margenPct: number | null;  // ponderado: suma de márgenes ÷ suma de ventas sin IVA
  margenMedio: number | null; // € por unidad
  margenPvpPct: number | null;
  pierde: number; bajo: number; sinCoste: number; raro: number;
};

export function resumir(marca: string, ps: Producto[]): ResumenMarca {
  const c = ps.filter(p => p.coste !== null);
  const venta = c.reduce((s, p) => s + p.ventaSinIva, 0);
  const margen = c.reduce((s, p) => s + p.margen!, 0);
  const pvp = c.reduce((s, p) => s + p.pvp / (1 + IVA), 0);
  return {
    marca, productos: ps.length, conCoste: c.length,
    margenPct: c.length ? margen / venta : null,
    margenMedio: c.length ? margen / c.length : null,
    margenPvpPct: c.length && pvp ? (pvp - c.reduce((s, p) => s + p.coste!, 0)) / pvp : null,
    pierde: ps.filter(p => p.estado === "pierde").length,
    bajo: ps.filter(p => p.estado === "bajo").length,
    sinCoste: ps.length - c.length,
    raro: ps.filter(p => p.estado === "raro").length,
  };
}
