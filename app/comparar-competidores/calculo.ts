// Cálculos de cada fila, los mismos en la tabla de la web, el PDF y el Excel.
// Siguen las reglas del comparador de Cosméticos24h: dto. autorizado de la marca, «¿Podemos igualar?»,
// PVP distinto (si el suyo es más bajo: tarifa sin actualizar; si el nuestro es más bajo: revisar nuestro precio)
// y su precio por debajo de nuestro PVP con el dto. autorizado.
import { descuentoBoardfy } from "../comparar-precios/boardfy";
import { COMPETIDORES, type FilaComp } from "./competidores";

export type CuponComp = { pct: number; codigo?: string; directo?: boolean; hasta?: string; excluidas?: string[] } | null;
export type MarcaComp = { nombre: string; slug: string; descuentoMax?: number | null; enC24?: boolean };

// Descuento autorizado de la marca: el puesto a mano en el comparador de Cosméticos24h o, si no, el de Boardfy
export function descuentoDe(m: MarcaComp): number | null {
  return m.descuentoMax != null ? m.descuentoMax : descuentoBoardfy(m.nombre);
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// El cupón de Cosméticos24h no se aplica en las marcas que excluye su página de promociones
export function cuponDeMarca(c: CuponComp, marca: string): CuponComp {
  if (!c || !(c.pct > 0)) return null;
  const m = sinAcentos(marca);
  const excluida = (c.excluidas ?? []).some(x => { const e = sinAcentos(x); return e.length > 2 && (m.includes(e) || e.includes(m)); });
  return excluida ? null : c;
}

// Su precio final en Cosméticos24h lleva el cupón de carrito (como en su comparador)
export function aplicarCupon(filas: FilaComp[], cupon: CuponComp): FilaComp[] {
  if (!cupon) return filas;
  const f = 1 - cupon.pct / 100;
  return filas.map(x => {
    const p = x.precios.c24;
    if (!p) return x;
    return { ...x, precios: { ...x.precios, c24: { ...p, precioWeb: p.precio, precio: Math.round(p.precio * f * 100) / 100 } } };
  });
}

export type CalcComp = {
  suPvp: number;
  dto: number;              // su descuento total sobre su PVP
  pvpSinActualizar: boolean; // su PVP es más bajo que el nuestro
  pvpMasAlto: boolean;       // su PVP es más alto que el nuestro: hay que revisar el nuestro
  bajoMinimo: boolean;       // vende por debajo de nuestro PVP con el dto. autorizado
};
export type CalcFila = {
  limite: number | null;     // nuestro PVP con el dto. autorizado
  miDto: number;
  bajoMinimoMio: boolean;    // nuestro precio está por debajo de ese límite
  comp: Record<string, CalcComp>;
  revisarPrecio: string[];   // competidores con el PVP más alto que el nuestro
  pvpDistintos: number;
  mb: { id: string; precio: number } | null; // el competidor más barato
  masBarato: string;         // nombre del más barato: nosotros si somos más baratos que todos, «Igual» si empatamos con el más barato
  diferencia: number | null; // su precio menos el nuestro (negativo = alguien vende más barato)
  bajoAutorizado: number | null; // cuánto queda el más barato por debajo de nuestro límite (negativo)
  igualar: string;
};

const coma = (n: number) => n.toFixed(2).replace(".", ",");
export const pctTexto = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;

export function calcularFila(f: FilaComp, descuento: number | null): CalcFila {
  const pvp = f.pvp || f.precio;
  const limite = descuento != null ? Math.round(pvp * (1 - descuento / 100) * 100) / 100 : null;
  const comp: Record<string, CalcComp> = {};
  const revisarPrecio: string[] = [];
  let pvpDistintos = 0;
  let mb: { id: string; precio: number } | null = null;
  for (const c of COMPETIDORES) {
    const p = f.precios[c.id];
    if (!p) continue;
    const suPvp = p.pvp ?? p.precioWeb ?? p.precio;
    const distinto = Math.abs(suPvp - pvp) > 0.01;
    if (distinto) pvpDistintos++;
    if (distinto && suPvp > pvp) revisarPrecio.push(c.corto);
    comp[c.id] = {
      suPvp, dto: suPvp > 0 ? 1 - p.precio / suPvp : 0,
      pvpSinActualizar: distinto && suPvp < pvp, pvpMasAlto: distinto && suPvp > pvp,
      bajoMinimo: limite != null && p.precio < limite - 0.005,
    };
    if (!mb || p.precio < mb.precio) mb = { id: c.id, precio: p.precio };
  }
  const diferencia = mb ? Math.round((mb.precio - f.precio) * 100) / 100 : null;
  const ganamos = diferencia == null || diferencia >= -0.005;
  const dtoIgualar = mb && pvp > 0 ? 1 - mb.precio / pvp : 0;
  const igualar = !mb ? "—"
    : diferencia! > 0.005 ? "Mejor precio"
    : diferencia! >= -0.005 ? "Mismo precio"
    : limite == null || mb.precio >= limite - 0.005 ? `Sí, bajando ${coma(-diferencia!)} € (dto. total ${pctTexto(dtoIgualar)})`
    : `No: haría falta un ${pctTexto(dtoIgualar)} (autorizado ${String(descuento).replace(".", ",")} %)`;
  return {
    limite, miDto: pvp > 0 ? 1 - f.precio / pvp : 0,
    bajoMinimoMio: limite != null && f.precio < limite - 0.005,
    comp, revisarPrecio, pvpDistintos, mb,
    masBarato: !mb ? "—" : Math.abs(diferencia!) <= 0.005 ? "Igual" : ganamos ? "La Tienda de Cosméticos" : COMPETIDORES.find(c => c.id === mb!.id)!.corto,
    diferencia,
    bajoAutorizado: mb && limite != null && mb.precio < limite - 0.005 ? Math.round((mb.precio - limite) * 100) / 100 : null,
    igualar,
  };
}

// Columnas de los competidores que venden la marca
export const columnasDe = (filas: FilaComp[], estados: Record<string, { url?: string }>) =>
  COMPETIDORES.filter(c => estados[c.id]?.url || filas.some(f => f.precios[c.id]));

// De más caros a más baratos respecto al competidor más barato; los que no tiene nadie, al final
export function ordenar(filas: FilaComp[]): FilaComp[] {
  const d = (f: FilaComp) => { const k = calcularFila(f, null); return k.diferencia == null ? Infinity : k.diferencia; };
  return filas.slice().sort((a, b) => d(a) - d(b));
}
