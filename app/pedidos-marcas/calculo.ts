// Cruce de ventas (informe COMPRAS_….xls) y stock (control_stocks-….csv) para el pedido a cada marca.

export type FilaPedido = { id: string; producto: string; propiedad: string; ean: string; stock: number; ventas: number; sinPagar: number; pendientes: number; pedir: number };
export type MarcaPedido = { marca: string; grupos: { stock: number; filas: FilaPedido[] }[]; total: number };
export type Resultado = {
  marcas: MarcaPedido[];
  desde: string; hasta: string; pendDesde: string; pedidosPendientes: number; sinEnviarDesde: string; antiguosSinEnviar: number;
  caducados: { id: string; codigo: string; fecha: string; formaPago: string; total: string }[]; pedidos: number; lineasVenta: number; unidades: number;
  sinCruzar: { marca: string; producto: string; propiedad: string; ean: string; ventas: number; pendientes: number }[];
  sinControl: number; descatalogados: number; anulados: number; enPacks: number;
  diasPeriodo: number; usaHistorico: boolean;
};
export type Opciones = { stockMax: number; incluirDescatalogados: boolean; soloSinEnviar: boolean; /** AAAA-MM-DD; vacío = desde el día anterior al último pedido */ sinEnviarDesde: string; /** Productos con un pedido a la marca en seguimiento: salen aunque su pedido sea anterior a la fecha */ seguidos?: Set<string>;
  /** Ventas guardadas en la Suite: si se pasa, «-ventas» sale de aquí y el informe del día solo da los pedidos sin enviar */
  historico?: Historico;
  /** Días de venta que debe cubrir la cantidad a pedir */
  diasCobertura?: number };

/** Ventas por producto y día guardadas en la Suite. Clave: EAN o «nombre|formato». */
export type HistProducto = { e: string; n: string; p: string; m: string; d: Record<string, number> };
export type Historico = { productos: Record<string, HistProducto>; desde: string; hasta: string; pedidos: number };
/** Días de ventas que se usan del histórico */
export const DIAS_HISTORICO = 183;

// Quita espacios raros, caracteres invisibles (el programa mete alguno en los EAN) y dobles espacios
const limpiar = (s: string) => (s ?? "").replace(/[​-‏⁠﻿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const limpiarEan = (s: string) => limpiar(s).replace(/\s/g, "");
const eanValido = (e: string) => e !== "" && e !== "-" && e !== "0";
const clave = (producto: string, propiedad: string) => `${limpiar(producto).toLowerCase()}|${limpiar(propiedad).toLowerCase()}`;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ANULADO = /cancel|anulad|devuel|devoluc|rechaz|fallid|error/i;
const NO_PRODUCTO = /^(gastos de|descuento|cup[oó]n|promoci|vale|cheque|tarjeta regalo)/i;

/** Días que puede estar un pedido sin pagar antes de darlo por anulado */
export const DIAS_SIN_PAGAR = 3;

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

/** Unidades de un pack según su formato: «Pack Dúo» 2, «Pack Trío» 3, «2x500 ml» 2, «3 unidades» 3; si no, 1 */
export function unidadesPack(propiedad: string): number {
  const t = sinTildes(limpiar(propiedad));
  if (/\bduo\b/.test(t)) return 2;
  if (/\btrio\b/.test(t)) return 3;
  const x = t.match(/^(\d)\s*x\s*\d/) ?? t.match(/^(\d)\s*unidades\b/);
  return x ? Number(x[1]) : 1;
}

// Número AAAAMMDDhhmm → Date (UTC, solo para restar días)
const aFecha = (n: number) => { const t = String(n).padEnd(12, "0"); return Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12)); };
const diaMenos = (dia: string, dias: number) => new Date(aFecha(Number(dia + "0000")) - dias * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
const diaTxt = (dia: string) => dia ? `${dia.slice(6, 8)}/${dia.slice(4, 6)}/${dia.slice(0, 4)}` : "";

/**
 * Líneas del informe de ventas para guardar en el histórico, agrupadas por pedido.
 * Solo entran pedidos que son venta segura: enviados, pagados o contra reembolso. Los que están
 * sin pagar se guardarán cuando lleguen pagados o enviados en un informe posterior.
 */
export function lineasParaHistorico(ventasFilas: string[][]) {
  const iv = ventasFilas.findIndex(f => f.some(c => sinTildes(limpiar(c)) === "ean") && f.some(c => sinTildes(limpiar(c)) === "cantidad"));
  if (iv < 0) return {};
  const cv = indices(ventasFilas[iv], { id: ["ID"], fecha: ["Fecha"], estado: ["Estado"], pagado: ["Pagado"], marca: ["Marca"], producto: ["Producto"], propiedad: ["Propiedad"], ean: ["EAN"], cantidad: ["Cantidad"] }, "ventas");
  const cForma = ventasFilas[iv].map(c => sinTildes(limpiar(c))).indexOf("forma pago");
  const out: Record<string, { dia: string; lineas: { k: string; e: string; n: string; p: string; m: string; q: number }[] }> = {};
  for (const f of ventasFilas.slice(iv + 1)) {
    const marca = limpiar(f[cv.marca]);
    const producto = limpiar(f[cv.producto]);
    if (!producto || NO_PRODUCTO.test(marca)) continue;
    const e = limpiarEan(f[cv.ean]);
    const propiedad = limpiar(f[cv.propiedad]);
    if (!eanValido(e) && propiedad === "-") continue;
    const estado = limpiar(f[cv.estado]);
    if (ANULADO.test(estado)) continue;
    const segura = /enviad/i.test(estado) || /^s[ií]/i.test(limpiar(f[cv.pagado])) || (cForma >= 0 && /reembolso/i.test(f[cForma] ?? ""));
    if (!segura) continue;
    const q = Number(limpiar(f[cv.cantidad]).replace(",", ".")) || 0;
    const dia = String(ordenFecha(f[cv.fecha] ?? "")).slice(0, 8);
    if (q <= 0 || dia.length < 8) continue;
    const id = limpiar(f[cv.id]);
    (out[id] ??= { dia, lineas: [] }).lineas.push({ k: eanValido(e) ? e : clave(producto, propiedad), e, n: producto, p: propiedad, m: marca, q });
  }
  return out;
}

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

  type Prod = { marca: string; producto: string; propiedad: string; ean: string; stock: number | null; descatalogado: boolean; ventas: number; sinPagar: number; pendientes: number; sinEnviarTotal: number };
  const porEan = new Map<string, Prod[]>();
  const porNombre = new Map<string, Prod>();
  const porSoloNombre = new Map<string, Prod[]>();
  for (const f of stockFilas.slice(is + 1)) {
    const p: Prod = {
      marca: limpiar(f[cs.marca]), producto: limpiar(f[cs.producto]), propiedad: limpiar(f[cs.propiedad]), ean: limpiarEan(f[cs.ean]),
      stock: entero(f[cs.stock]), descatalogado: /^s[ií]/i.test(limpiar(f[cs.descatalogado])), ventas: 0, sinPagar: 0, pendientes: 0, sinEnviarTotal: 0,
    };
    if (!p.producto) continue;
    if (eanValido(p.ean)) porEan.set(p.ean, [...(porEan.get(p.ean) ?? []), p]);
    porNombre.set(clave(p.producto, p.propiedad), p);
    const n = clave(p.producto, "");
    porSoloNombre.set(n, [...(porSoloNombre.get(n) ?? []), p]);
  }

  // Por EAN; si el EAN se repite en el stock, el que coincide en formato; sin EAN, por nombre y formato.
  // Packs Dúo/Trío del mismo producto: la tienda les pone el EAN del producto con «-1», «-2»… (o ninguno)
  // y gastan stock del producto suelto, así que cuentan 2 o 3 unidades.
  function buscar(ean: string, producto: string, propiedad: string): { p?: Prod; factor: number } {
    const candidatos = eanValido(ean) ? porEan.get(ean) : undefined;
    if (candidatos) return { p: candidatos.length === 1 ? candidatos[0] : candidatos.find(c => c.propiedad.toLowerCase() === propiedad.toLowerCase()) ?? candidatos[0], factor: 1 };
    const exacto = porNombre.get(clave(producto, propiedad));
    if (exacto) return { p: exacto, factor: 1 };
    // Regla de la tienda (José Carlos): si el EAN es el de un producto con «-1» o «-2», es un pack de ese producto
    // (Dúo, Trío) y gasta su stock; si el pack tiene un EAN distinto (p. ej. el Dúo Synchro de Gernétic), el pack existe
    // como producto propio y ya se ha encontrado arriba. Unidades: las que diga el formato (Dúo 2, Trío 3, 2x…) o, si no
    // lo dice, «-1» = 2 y «-2» = 3. Sin EAN, solo si el formato dice que es un pack del mismo producto.
    const m = ean.match(/^(.+)-(\d)$/);
    const base = m ? porEan.get(m[1]) : undefined;
    const delFormato = unidadesPack(propiedad);
    // Las variantes con «-N» que tienen fila propia en el stock (tonos, tamaños, crema/gel…) son productos distintos y
    // ya se han encontrado arriba por su EAN exacto. Aquí solo llegan los «-N» sin fila propia, y solo cuentan como pack
    // si el nombre o el formato lo dicen (Dúo, Trío, 2x…, Pack, Kit, Set, Neceser); si no, quedan sin cruzar para revisarlos.
    const pareceAPack = delFormato > 1 || /\b(pack|kit|set|neceser|duo|trio)\b/.test(sinTildes(`${producto} ${propiedad}`.toLowerCase()));
    if (base?.length === 1 && pareceAPack) return { p: base[0], factor: delFormato > 1 ? delFormato : Number(m![2]) + 1 };
    const mismoNombre = porSoloNombre.get(clave(producto, ""));
    if (!eanValido(ean) && delFormato > 1 && mismoNombre?.length === 1) return { p: mismoNombre[0], factor: delFormato };
    return { factor: 1 };
  }
  const hist = op.historico && Object.keys(op.historico.productos).length ? op.historico : undefined;

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
  // Pedidos sin pagar de más de 3 días (contando desde el último pedido del informe): se dan por anulados.
  // Contra reembolso no cuenta, porque se cobra al entregar.
  const cab = ventasFilas[iv].map(c => sinTildes(limpiar(c)));
  const col = (n: string) => cab.indexOf(n);
  const cForma = col("forma pago"), cTotal = col("total"), cCod = col("cod. compra");
  const limite = (() => {
    if (!ultimo) return 0;
    const t = String(ultimo);
    const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12)) - DIAS_SIN_PAGAR * 864e5);
    return Number(d.toISOString().slice(0, 16).replace(/\D/g, ""));
  })();
  const caducados = new Map<string, Resultado["caducados"][number]>();
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
    const forma = cForma >= 0 ? limpiar(f[cForma]) : "";
    if (!/enviad/i.test(limpiar(f[cv.estado])) && /^no/i.test(limpiar(f[cv.pagado])) && !/reembolso/i.test(forma) && ordenFecha(f[cv.fecha] ?? "") < limite) {
      const id = limpiar(f[cv.id]);
      if (!caducados.has(id)) caducados.set(id, { id, codigo: cCod >= 0 ? limpiar(f[cCod]) : "", fecha: limpiar(f[cv.fecha]), formaPago: forma, total: cTotal >= 0 ? limpiar(f[cTotal]) : "" });
      continue;
    }
    const cant = Number(limpiar(f[cv.cantidad]).replace(",", ".")) || 0;
    if (cant <= 0) continue;
    lineasVenta++;
    unidades += cant;
    pedidos.add(limpiar(f[cv.id]));
    const fe = limpiar(f[cv.fecha]);
    if (fe && (!desde || ordenFecha(fe) < ordenFecha(desde))) desde = fe;
    if (fe && (!hasta || ordenFecha(fe) > ordenFecha(hasta))) hasta = fe;

    const { p, factor } = buscar(ean, producto, propiedad);
    if (factor > 1 && !hist) enPacks += cant * factor;
    // Sin pagar: pedido sin enviar y con «Pagado» en No
    // Sin enviar: el pedido aún no ha salido (lo de ayer por la tarde y hoy). Sin pagar: además, «Pagado» en No
    const sinEnviar = !/enviad/i.test(limpiar(f[cv.estado])) && ordenFecha(fe) >= corteNum;
    const noEnviado = !/enviad/i.test(limpiar(f[cv.estado]));
    if (noEnviado && !sinEnviar) antiguos.add(limpiar(f[cv.id]));
    const sinPagar = sinEnviar && /^no/i.test(limpiar(f[cv.pagado]));
    if (sinEnviar) {
      pedidosPend.add(limpiar(f[cv.id]));
      if (fe && (!pendDesde || ordenFecha(fe) < ordenFecha(pendDesde))) pendDesde = fe;
    }
    if (p) { if (!hist) p.ventas += cant * factor; if (sinPagar) p.sinPagar += cant * factor; if (sinEnviar) p.pendientes += cant * factor; if (noEnviado) p.sinEnviarTotal += cant * factor; }
    else {
      const k = `${ean}|${clave(producto, propiedad)}`;
      const s = sinCruzar.get(k) ?? { marca, producto, propiedad, ean, ventas: 0, pendientes: 0 };
      if (!hist) s.ventas += cant;
      if (sinEnviar) s.pendientes += cant;
      sinCruzar.set(k, s);
    }
  }

  // Ventas del histórico guardado: los últimos DIAS_HISTORICO días hasta el último día guardado
  let diasPeriodo = Math.max(1, (aFecha(ordenFecha(hasta)) - aFecha(ordenFecha(desde))) / 864e5);
  if (hist) {
    const hastaH = hist.hasta;
    const desdeH = diaMenos(hastaH, DIAS_HISTORICO);
    let primero = hastaH;
    unidades = 0;
    for (const h of Object.values(hist.productos)) {
      let q = 0;
      for (const [dia, n] of Object.entries(h.d)) if (dia > desdeH && dia <= hastaH) { q += n; if (dia < primero) primero = dia; }
      if (!q) continue;
      unidades += q;
      const { p, factor } = buscar(h.e, h.n, h.p);
      if (p) { p.ventas += q * factor; if (factor > 1) enPacks += q * factor; }
      else {
        const k = `${h.e}|${clave(h.n, h.p)}`;
        const s = sinCruzar.get(k) ?? { marca: h.m, producto: h.n, propiedad: h.p, ean: h.e, ventas: 0, pendientes: 0 };
        s.ventas += q;
        sinCruzar.set(k, s);
      }
    }
    desde = diaTxt(primero);
    hasta = diaTxt(hastaH);
    diasPeriodo = Math.max(1, (aFecha(Number(hastaH + "2359")) - aFecha(Number(primero + "0000"))) / 864e5);
  }
  const cobertura = op.diasCobertura ?? 14;

  // Lista: vendidos en el periodo con stock ≤ stockMax
  let sinControl = 0, descatalogados = 0;
  const porMarca = new Map<string, Map<number, FilaPedido[]>>();
  const todos = new Set<Prod>([...porNombre.values(), ...[...porEan.values()].flat()]);
  for (const p of todos) {
    if (p.ventas <= 0 && p.pendientes <= 0) continue;
    if (op.soloSinEnviar && p.pendientes <= 0 && !(op.seguidos?.has(idProducto(p)) && p.sinEnviarTotal > 0)) continue;
    if (p.stock === null || p.stock === SIN_CONTROL) { sinControl++; continue; }
    if (p.stock > op.stockMax) continue;
    if (p.descatalogado && !op.incluirDescatalogados) { descatalogados++; continue; }
    const marca = p.marca.toLowerCase() || "sin marca";
    const g = porMarca.get(marca) ?? new Map<number, FilaPedido[]>();
    g.set(p.stock, [...(g.get(p.stock) ?? []), { id: idProducto(p), producto: p.producto, propiedad: p.propiedad, ean: p.ean, stock: p.stock, ventas: p.ventas, sinPagar: p.sinPagar, pendientes: p.pendientes, pedir: Math.max(1, Math.ceil(Math.max(0, -p.stock) + p.ventas / diasPeriodo * cobertura - 0.25)) }]);
    porMarca.set(marca, g);
  }

  const marcas: MarcaPedido[] = [...porMarca].map(([marca, g]) => {
    const grupos = [...g].sort((a, b) => a[0] - b[0]).map(([stock, filas]) => ({
      stock, filas: filas.sort((a, b) => b.ventas - a.ventas || a.producto.localeCompare(b.producto, "es") || a.propiedad.localeCompare(b.propiedad, "es", { numeric: true })),
    }));
    return { marca, grupos, total: grupos.reduce((n, x) => n + x.filas.length, 0) };
  }).sort((a, b) => a.marca.localeCompare(b.marca, "es"));

  return {
    marcas, desde, hasta, pendDesde, pedidosPendientes: pedidosPend.size, sinEnviarDesde: corte, antiguosSinEnviar: antiguos.size, caducados: [...caducados.values()].sort((a, b) => ordenFecha(a.fecha) - ordenFecha(b.fecha)), pedidos: hist ? hist.pedidos : pedidos.size, lineasVenta, unidades, diasPeriodo: Math.round(diasPeriodo), usaHistorico: !!hist,
    sinCruzar: [...sinCruzar.values()].filter(x => !op.soloSinEnviar || x.pendientes > 0).sort((a, b) => a.marca.localeCompare(b.marca, "es") || b.ventas - a.ventas),
    sinControl, descatalogados, anulados, enPacks,
  };
}

/** Identificador estable de un producto para el seguimiento: el EAN o, si no tiene, nombre y formato */
export const idProducto = (p: { ean: string; producto: string; propiedad: string }) => eanValido(p.ean) ? p.ean : clave(p.producto, p.propiedad);

export const AVISO_SIN_PAGAR = "*Compra sin finalizar, o no realizado el pago";

export type EstadoPedido = "esperando" | "mal" | "incorrecto";
export const ESTADOS_PEDIDO: Record<EstadoPedido, { titulo: string; nota: string }> = {
  esperando: { titulo: "Pedido, esperando", nota: "" },
  mal: { titulo: "Nos lo han enviado mal", nota: "*Nos lo enviasteis mal" },
  incorrecto: { titulo: "No han enviado el correcto", nota: "*No nos enviasteis el correcto" },
};

/** Texto para copiar. Los que ya están pedidos y esperando no salen (no se piden dos veces); los que llegaron mal llevan su nota. */
export function textoMarca(m: MarcaPedido, estados: Record<string, EstadoPedido | undefined> = {}, conCantidad = false): string {
  const l: string[] = [`${m.marca}\t\t\t\t`];
  const grupos = m.grupos.map(g => ({ ...g, filas: g.filas.filter(f => estados[f.id] !== "esperando") })).filter(g => g.filas.length);
  if (!grupos.length) return "";
  grupos.forEach((g, i) => {
    if (i > 0) l.push("\t\t\t\t\t");
    l.push(`\tstock ${g.stock}\t\t\t\t`);
    for (const f of g.filas) l.push(`•  ${f.producto}\t${f.propiedad}\t${f.ean}\t-ventas\t${f.ventas}${conCantidad ? `\tpedir\t${f.pedir}` : ""}${f.sinPagar > 0 ? `\t${AVISO_SIN_PAGAR}` : ""}${estados[f.id] && estados[f.id] !== "esperando" ? `\t${ESTADOS_PEDIDO[estados[f.id]!].nota}` : ""}`);
  });
  return l.join("\n");
}
