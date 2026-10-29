// Excel por marca con la estructura de los informes de precios de las marcas (p. ej. el de Matis Paris):
// EAN, nombre, PVP, nuestro mínimo (PVP menos el descuento máximo de la marca, el de Boardfy por defecto)
// y resaltados los precios que quedan por debajo de ese mínimo.
// Diseño con los azules del logo de La Tienda de Cosméticos; lo de Cosméticos24h, en los rosas de su web.
import type ExcelJS from "exceljs";

export type FilaExcel = {
  nombre: string; ean?: string; miUrl: string; suUrl: string;
  miPrecio: number; suPrecio: number; miPvp?: number; suPvp?: number; diff: number;
  suPrecioWeb?: number; // precio de su web antes del cupón de carrito (suPrecio ya lo lleva aplicado)
  descatalogado?: boolean;
  stock?: number;
  esPack?: boolean;
  deAntes?: string; // nuestra ficha no se pudo leer: precios de la revisión anterior
};
export type CuponExcel = { pct: number; codigo?: string; directo?: boolean; hasta?: string; condiciones?: string } | null;
export type SoloEllosExcel = { titulo: string; precio: number; tachado?: number; url: string; esPack: boolean; ean?: string };

// Lo que tienen ellos y nosotros no: PVP, precio web, precio final con cupón y dto. total (como en la web)
export function filaSoloEllos(s: SoloEllosExcel, cupon: CuponExcel) {
  const pvp = s.tachado && s.tachado > s.precio ? s.tachado : s.precio;
  const final = cupon && cupon.pct > 0 ? Math.round(s.precio * (1 - cupon.pct / 100) * 100) / 100 : s.precio;
  return { pvp, web: s.precio, dtoWeb: pvp > 0 ? 1 - s.precio / pvp : 0, final, dto: pvp > 0 ? 1 - final / pvp : 0 };
}

// Colores del logo (azul #1270B6, azul claro #1C9CD9) y neutros
const AZUL = "FF1270B6";
// Rosas de Cosméticos24h (#EDD0CC y #D69D9A de su web, oscurecido para que se lea)
const ROSA = "FFB5655F";
const FONDO_NOSOTROS = "FFE8F1F9";
const FONDO_ELLOS = "FFFBEEEC";
const CEBRA = "FFF8FAFC";
const LINEA = "FFE5E7EB";
const TEXTO = "FF1F2933";
const TEXTO_SUAVE = "FF6B7280";
const ROJO = "FFB42318";
const ROJO_FONDO = "FFFDECEC";
const AMBAR = "FFB45309";
const AMBAR_FONDO = "FFFEF6E7";
const VERDE = "FF067647";
const MORADO = "FF6B3FB5";
const MORADO_FONDO = "FFF1EBFB";
const EUROS = '#,##0.00 "€"';
const PORCENTAJE = '0.0 %';
const EUROS_SIGNO = '+#,##0.00 "€";-#,##0.00 "€";0.00 "€"';
const FUENTE = "Calibri";

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FUENTE, size: 10, color: { argb: TEXTO }, ...extra });
const lineaAbajo: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: LINEA } } };

function fechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Título, subtítulo y resumen encima de la tabla
function encabezado(ws: ExcelJS.Worksheet, ultimaCol: string, titulo: string, subtitulo: string, resumen: string) {
  ws.mergeCells(`A1:${ultimaCol}1`);
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = fuente({ size: 16, bold: true, color: { argb: AZUL } });
  ws.getRow(1).height = 28;
  ws.mergeCells(`A2:${ultimaCol}2`);
  ws.getCell("A2").value = subtitulo;
  ws.getCell("A2").font = fuente({ color: { argb: TEXTO_SUAVE } });
  ws.mergeCells(`A3:${ultimaCol}3`);
  ws.getCell("A3").value = resumen;
  ws.getCell("A3").font = fuente({ bold: true });
  ws.getRow(3).height = 20;
}

function filaCabecera(ws: ExcelJS.Worksheet, n: number, titulos: string[]) {
  const fila = ws.getRow(n);
  titulos.forEach((t, i) => { fila.getCell(i + 1).value = t; });
  fila.height = 34;
  fila.eachCell(c => {
    c.font = fuente({ bold: true, size: 9, color: { argb: "FFFFFFFF" } });
    c.fill = relleno(AZUL);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function preparar(ws: ExcelJS.Worksheet) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

const coma = (n: number, dec = 2) => n.toFixed(dec).replace(".", ",");
const pctTexto = (frac: number) => `${coma(Math.round(frac * 1000) / 10, 1).replace(/,0$/, "")} %`;

// Cálculos de una fila del informe, los mismos en el Excel y en la tabla de la web
export type FilaCalculada = {
  pvp: number; limite: number | null; miDto: number; suPvp: number; suWeb: number; suDtoWeb: number; suDto: number;
  bajoMinimo: { mio: boolean; suyo: boolean }; pvpDistinto: boolean;
  revisarPvp: boolean; // PVP muy distinto (más de un 10 %): puede que una tarifa esté mal
  esPack: boolean;
  masBarato: "Cosméticos24h" | "Nosotros" | "Igual"; igualar: string;
};
// Por qué no podemos igualar cuando venden por debajo de nuestro dto. máx.
// Si nuestro precio ya pasa del máximo, lo que queda es la diferencia de ahora; si no, la que quedaría al bajar al máximo.
export function explicaDtoMax(f: { miPrecio: number; suPrecio: number; diff: number }, k: { limite: number | null; bajoMinimo: { suyo: boolean } }, descuento: number | null): string | null {
  if (!k.bajoMinimo.suyo || k.limite == null || descuento == null) return null;
  const d = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const pct = `${String(descuento).replace(".", ",")} %`;
  if (Math.abs(f.miPrecio - k.limite) <= 0.005) return `Ya estamos en el máx. (−${pct})`;
  if (f.miPrecio < k.limite) return `Ya pasamos del máx. (−${pct})`;
  return `Con el máx. (−${pct}): +${d(k.limite - f.suPrecio)}`;
}

// Packs y cofres: nuestro PVP es la suma de los productos sueltos, así que el dto. máx. sobre ese PVP
// y la comparación de PVP no tienen sentido; solo cuenta el precio final.
// Solo por palabras de pack de verdad: «Dúo»/«Trío» suelen ser nombres de producto (p. ej. 550 Eye Contour Dúo),
// así que no basta con la marca de pack que pone la revisión.
const PACK = /\b(pack|set|kit|lote|estuche|cofre|coffret|bundle|caja|box)\b/i;
export function esPackFila(f: { nombre: string }): boolean {
  return PACK.test(f.nombre);
}

// La misma explicación, larga, para el texto que sale al pasar por encima de la celda
export function explicaDtoMaxLarga(f: { miPrecio: number; suPrecio: number; diff: number }, k: { limite: number | null; bajoMinimo: { suyo: boolean } }, descuento: number | null): string | null {
  if (!k.bajoMinimo.suyo || k.limite == null || descuento == null) return null;
  const d = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const pct = `${String(descuento).replace(".", ",")} %`;
  if (Math.abs(f.miPrecio - k.limite) <= 0.005) return `Ya estamos en nuestro descuento máximo (−${pct}) y seguimos ${d(f.diff)} más caros: no podemos igualarlos.`;
  if (f.miPrecio < k.limite) return `Ya pasamos de nuestro descuento máximo (−${pct}) y aún seguimos ${d(f.diff)} más caros: no podemos igualarlos.`;
  return `Bajando a nuestro descuento máximo (−${pct}) seguiríamos ${d(k.limite - f.suPrecio)} más caros: no podemos igualarlos.`;
}

export function calcularFila(f: FilaExcel, descuento: number | null): FilaCalculada {
  const pvp = f.miPvp ?? f.miPrecio;
  const esPack = esPackFila(f);
  const limite = descuento != null && !esPack ? Math.round(pvp * (1 - descuento / 100) * 100) / 100 : null;
  const suPvp = f.suPvp ?? f.suPrecioWeb ?? f.suPrecio;
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  // Si vamos más caros: ¿llegamos a su precio final sin pasar nuestro descuento máximo?
  // Se da también el descuento total sobre nuestro PVP con el que quedaríamos.
  const dtoIgualar = pvp > 0 ? 1 - f.suPrecio / pvp : 0;
  const igualar = f.diff <= 0.01 ? ""
    : esPack ? `Pack: habría que bajar ${coma(f.diff)} €`
    : limite == null || f.suPrecio >= limite - 0.005 ? `Sí, bajando ${coma(f.diff)} € (dto. total ${pctTexto(dtoIgualar)})`
    : `No: haría falta un ${pctTexto(dtoIgualar)} (máx. ${pct})`;
  return {
    pvp, limite, suPvp,
    miDto: pvp > 0 ? 1 - f.miPrecio / pvp : 0,
    suWeb: f.suPrecioWeb ?? f.suPrecio,
    suDtoWeb: suPvp > 0 ? 1 - (f.suPrecioWeb ?? f.suPrecio) / suPvp : 0,
    suDto: suPvp > 0 ? 1 - f.suPrecio / suPvp : 0,
    bajoMinimo: { mio: limite != null && f.miPrecio < limite - 0.005, suyo: limite != null && f.suPrecio < limite - 0.005 },
    pvpDistinto: !esPack && f.suPvp != null && Math.abs(f.suPvp - pvp) > 0.01,
    revisarPvp: !esPack && f.suPvp != null && pvp > 0 && Math.abs(f.suPvp - pvp) / pvp > 0.10,
    esPack,
    masBarato: f.diff > 0.01 ? "Cosméticos24h" : f.diff < -0.01 ? "Nosotros" : "Igual",
    igualar,
  };
}

export async function construirExcel(marca: string, filas: FilaExcel[], soloEllos: SoloEllosExcel[], descuento: number | null, cupon: CuponExcel = null, fecha = new Date()): Promise<ArrayBuffer> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";

  const orden = [...filas].sort((a, b) => b.diff - a.diff);
  const pvpDe = (f: FilaExcel) => f.miPvp ?? f.miPrecio;
  const factor = descuento != null ? 1 - descuento / 100 : null;
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  const limiteDe = (f: FilaExcel) => (factor != null ? Math.round(pvpDe(f) * factor * 100) / 100 : null);
  const masCaros = orden.filter(f => f.diff > 0.01).length;
  const pvpDistintos = orden.filter(f => f.suPvp != null && Math.abs(f.suPvp - pvpDe(f)) > 0.01).length;
  const bajoLimite = orden.filter(f => { const l = limiteDe(f); return l != null && f.suPrecio < l - 0.005; }).length;

  // ── Hoja 1: comparación por EAN, con las mismas columnas y colores que la tabla de la web ──
  const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  preparar(ws);
  // Columnas: EAN · producto · nosotros (PVP, con dto. máx., precio final, dto.)
  //          Cosméticos24h (PVP, precio web, precio final con cupón, dto. total) · diferencia · más barato · ¿podemos igualar?
  // Sin cupón, su precio final es el mismo que el precio web: esa columna no sale.
  const hayCupon = !!cupon && cupon.pct > 0;
  const factorCupon = hayCupon ? 1 - cupon!.pct / 100 : 1;
  const cuponTexto = hayCupon
    ? `PRECIO FINAL (${cupon!.codigo ?? "cupón"} −${coma(cupon!.pct, 1).replace(/,0$/, "")} %${cupon!.directo ? ", DIRECTO EN CARRITO" : ""}${cupon!.hasta ? `, HASTA ${cupon!.hasta.slice(8, 10)}/${cupon!.hasta.slice(5, 7)}` : ""})`
    : "";
  const COLS = ["ean", "producto", "pvp", "limite", "precio", "dto", "suPvp", "suWeb", ...(hayCupon ? ["suFinal"] : []), "suDto", "diff", "barato", "igualar"] as const;
  const col = (k: typeof COLS[number]) => COLS.indexOf(k) + 1;
  const letra = (k: typeof COLS[number]) => String.fromCharCode(64 + col(k));
  const ultimaCol = String.fromCharCode(64 + COLS.length);
  const anchos: Record<typeof COLS[number], number> = { ean: 16, producto: 52, pvp: 14, limite: 12, precio: 12, dto: 8, suPvp: 11, suWeb: 12, suFinal: 16, suDto: 10, diff: 14, barato: 15, igualar: 32 };
  ws.columns = COLS.map(k => ({ width: anchos[k] }));
  encabezado(ws, ultimaCol,
    `Comparativa de precios · ${marca}`,
    `La Tienda de Cosméticos frente a Cosméticos24h · emparejado por EAN · ${fechaCorta(fecha)}` +
    (hayCupon ? ` · su precio final lleva el cupón de carrito del ${coma(cupon!.pct, 1).replace(/,0$/, "")} %${cupon!.codigo ? ` (${cupon!.codigo})` : ""}` : ""),
    `${orden.length} productos comparados  ·  ${masCaros} en los que vamos más caros  ·  ` +
    (descuento != null ? `${bajoLimite} que Cosméticos24h vende más barato que nuestro dto. máx. (PVP −${pct})  ·  ` : "") +
    `${pvpDistintos} con PVP distinto`);

  // Fila 4: grupos de columnas
  const grupoEllos = `${letra("suPvp")}4:${letra("suDto")}4`;
  ws.mergeCells(`${letra("pvp")}4:${letra("dto")}4`); ws.mergeCells(grupoEllos);
  for (const [celda, texto, fondo, color] of [[`${letra("pvp")}4`, "NOSOTROS", FONDO_NOSOTROS, AZUL], [`${letra("suPvp")}4`, "COSMÉTICOS24H", FONDO_ELLOS, ROSA]] as const) {
    const c = ws.getCell(celda);
    c.value = texto;
    c.font = fuente({ bold: true, size: 9, color: { argb: color } });
    c.fill = relleno(fondo);
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(4).height = 18;

  const CAB = 5;
  const titulos: Record<typeof COLS[number], string> = {
    ean: "EAN", producto: "PRODUCTO", pvp: "PVP", limite: descuento != null ? `CON DTO. MÁX. (−${pct})` : "CON DTO. MÁX.", precio: "PRECIO FINAL", dto: "DTO.",
    suPvp: "PVP", suWeb: "PRECIO WEB", suFinal: cuponTexto, suDto: "DTO. TOTAL", diff: "DIFERENCIA", barato: "MÁS BARATO", igualar: "¿PODEMOS IGUALAR?",
  };
  filaCabecera(ws, CAB, COLS.map(k => titulos[k]));
  // La cabecera de su grupo, en su rosa
  for (let c = col("suPvp"); c <= col("suDto"); c++) ws.getRow(CAB).getCell(c).fill = relleno(ROSA);
  if (hayCupon && cupon!.condiciones) ws.getRow(CAB).getCell(col("suFinal")).note = cupon!.condiciones;

  const L = { pvp: letra("pvp"), precio: letra("precio"), suPvp: letra("suPvp"), suWeb: letra("suWeb"), suFin: hayCupon ? letra("suFinal") : letra("suWeb") };
  orden.forEach((f, idx) => {
    const n = CAB + 1 + idx;
    const k = calcularFila(f, descuento);
    const { pvp, suPvp, suWeb, limite, miDto, suDto, masBarato, igualar } = k;
    const descat = (f.descatalogado ? `DESCATALOGADO${f.stock != null ? ` (${f.stock} u)` : ""}${f.stock === 0 ? " · SIN STOCK: DESACTIVAR FICHA" : ""}\n` : "")
      + (f.deAntes ? "DATO ANTERIOR (no se pudo leer nuestra ficha)\n" : "");
    const valores: Record<typeof COLS[number], ExcelJS.CellValue> = {
      ean: f.ean ?? "",
      producto: { text: descat + f.nombre, hyperlink: f.miUrl },
      pvp,
      limite: limite != null ? { formula: `ROUND(${L.pvp}${n}*${1 - descuento! / 100},2)`, result: limite } : "—",
      precio: f.miPrecio,
      dto: { formula: `IF(${L.pvp}${n}>0,1-${L.precio}${n}/${L.pvp}${n},0)`, result: miDto },
      suPvp,
      suWeb: { text: coma(suWeb) + " €", hyperlink: f.suUrl },
      suFinal: { formula: `ROUND(${suWeb}*${factorCupon},2)`, result: f.suPrecio },
      suDto: { formula: `IF(${L.suPvp}${n}>0,1-${L.suFin}${n}/${L.suPvp}${n},0)`, result: suDto },
      diff: { formula: `${L.precio}${n}-${L.suFin}${n}`, result: Math.round(f.diff * 100) / 100 },
      barato: masBarato,
      igualar,
    };
    // Sin columna de cupón, el precio web es un número (la fórmula de la diferencia lo usa)
    if (!hayCupon) valores.suWeb = suWeb;
    const fila = ws.getRow(n);
    fila.values = COLS.map(c => valores[c]);
    fila.height = descat ? 30 : 22;
    COLS.forEach((key, i) => {
      const cel = fila.getCell(i + 1);
      cel.font = fuente();
      cel.border = lineaAbajo;
      cel.alignment = { vertical: "middle", horizontal: key === "ean" || key === "producto" || key === "igualar" ? "left" : key === "barato" ? "center" : "right", wrapText: key === "producto" || key === "igualar" };
      if (idx % 2 === 1) cel.fill = relleno(CEBRA);
      if (["pvp", "limite", "precio", "suPvp", "suWeb", "suFinal"].includes(key)) cel.numFmt = EUROS;
    });
    const c = (key: typeof COLS[number]) => fila.getCell(col(key));
    c("ean").numFmt = "@";
    c("dto").numFmt = PORCENTAJE;
    c("suDto").numFmt = PORCENTAJE;
    c("diff").numFmt = EUROS_SIGNO;
    c("ean").font = fuente({ color: { argb: TEXTO_SUAVE } });
    c("producto").font = fuente({ underline: true, color: { argb: f.descatalogado ? ROJO : TEXTO } });
    c("limite").font = fuente({ color: { argb: TEXTO_SUAVE } });
    c("precio").font = fuente({ bold: true });
    c("dto").font = fuente({ size: 9, color: { argb: AZUL } });
    c("suPvp").font = fuente({ color: { argb: ROSA } });
    c("suWeb").font = fuente({ color: { argb: ROSA }, underline: hayCupon });
    if (hayCupon) c("suFinal").font = fuente({ bold: true, color: { argb: ROSA } });
    c("suDto").font = fuente({ size: 9, bold: true, color: { argb: ROSA } });

    // Mismos resaltados que la web, con la explicación como nota (sale al pasar el ratón)
    if (k.esPack) c("pvp").note = "Pack: nuestro PVP es la suma de los productos sueltos, así que no se aplica el dto. máx. ni se compara el PVP.";
    // Sigue siendo un número (la columna «con dto. máx.» lo usa): el aviso va en el formato
    if (k.revisarPvp) c("pvp").numFmt = '#,##0.00 "€ (revisar precio)"';
    if (k.pvpDistinto) {
      for (const key of ["pvp", "suPvp"] as const) {
        c(key).fill = relleno(AMBAR_FONDO);
        if (!(key === "pvp" && k.revisarPvp)) c(key).font = fuente({ bold: true, color: { argb: AMBAR } });
      }
      c("pvp").alignment = { ...c("pvp").alignment, wrapText: true };
      c("pvp").note = `PVP distinto: nuestro ${coma(pvp)} €, el suyo ${coma(suPvp)} €. ¿Tarifa sin actualizar?`;
    }
    if (k.bajoMinimo.mio && limite != null) {
      c("precio").fill = relleno(ROJO_FONDO);
      c("precio").font = fuente({ bold: true, color: { argb: ROJO } });
      c("dto").font = fuente({ size: 9, bold: true, color: { argb: ROJO } });
      c("precio").note = `Nuestro precio está por debajo del PVP con el dto. máx. (${coma(limite)} €).`;
    }
    const explica = explicaDtoMaxLarga(f, k, descuento);
    if (k.bajoMinimo.suyo) c("diff").fill = relleno(MORADO_FONDO);
    if (explica) c("diff").note = explica;
    c("diff").font = fuente({ bold: true, color: { argb: f.diff > 0.01 ? ROJO : f.diff < -0.01 ? VERDE : TEXTO } });
    c("barato").font = fuente({ size: 9, bold: masBarato !== "Igual", color: { argb: masBarato === "Cosméticos24h" ? ROJO : masBarato === "Nosotros" ? VERDE : TEXTO_SUAVE } });
    c("igualar").font = fuente({ size: 9, bold: igualar.startsWith("No"), color: { argb: igualar.startsWith("No") ? ROJO : igualar ? VERDE : TEXTO_SUAVE } });
  });

  const ultima = CAB + orden.length;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: CAB, showGridLines: false }];
  ws.autoFilter = { from: `A${CAB}`, to: `${ultimaCol}${Math.max(ultima, CAB)}` };

  // Leyenda
  const ley = ultima + 2;
  const leyenda: [string, string, string][] = [
    [MORADO_FONDO, MORADO, descuento != null ? `Más allá de nuestro dto. máx.: venden por debajo de nuestro PVP −${pct} y no podemos igualarlos` : "Esta marca no tiene descuento máximo"],
    [ROJO_FONDO, ROJO, "Nuestro precio está por debajo del PVP con el descuento máximo"],
    [AMBAR_FONDO, AMBAR, "PVP distinto en las dos webs (¿tarifa sin actualizar?)"],
  ];
  leyenda.forEach(([fondo, color, texto], i) => {
    const c = ws.getCell(`A${ley + i}`);
    c.value = "  ";
    c.fill = relleno(fondo);
    const t = ws.getCell(`B${ley + i}`);
    t.value = texto;
    t.font = fuente({ size: 9, color: { argb: color } });
  });
  const nota = ws.getCell(`B${ley + leyenda.length}`);
  nota.value = "PVP: precio sin descuento. Con dto. máx.: nuestro PVP con el descuento máximo al que podemos llegar en la marca (Boardfy o el puesto en la app). Precio web: el de su web, con su descuento sobre el PVP (enlace a su ficha). " +
    (hayCupon ? "Precio final: el de su web con el cupón que aplican en el carrito. " : "") +
    "Dto. total: lo que rebajan sobre su PVP. Diferencia: nuestro precio menos su precio final. Las celdas con un triángulo rojo llevan una nota con la explicación.";
  nota.font = fuente({ size: 9, italic: true, color: { argb: TEXTO_SUAVE } });

  // ── Hoja 2: lo que tienen ellos y nosotros no ──
  if (soloEllos.length > 0) {
    const ws2 = wb.addWorksheet("Solo Cosméticos24h");
    preparar(ws2);
    const cols2 = hayCupon ? 6 : 5;
    const ult2 = String.fromCharCode(64 + cols2);
    ws2.columns = (hayCupon ? [16, 60, 12, 12, 16, 11] : [16, 60, 12, 12, 11]).map(width => ({ width }));
    encabezado(ws2, ult2,
      `Solo en Cosméticos24h · ${marca}`,
      `Productos que venden ellos y no tienen nuestro mismo EAN · ${fechaCorta(fecha)}`,
      `${soloEllos.length} productos`);
    filaCabecera(ws2, 5, ["EAN", "PRODUCTO", "PVP", "PRECIO WEB", ...(hayCupon ? [cuponTexto] : []), "DTO. TOTAL"]);
    for (let c = 1; c <= cols2; c++) ws2.getRow(5).getCell(c).fill = relleno(c <= 2 ? AZUL : ROSA);
    if (hayCupon && cupon!.condiciones) ws2.getRow(5).getCell(5).note = cupon!.condiciones;
    soloEllos.forEach((s, idx) => {
      const fila = ws2.getRow(6 + idx);
      const k = filaSoloEllos(s, cupon);
      fila.values = [s.ean ?? "", { text: (s.esPack ? "PACK · " : "") + s.titulo, hyperlink: s.url }, k.pvp, k.web, ...(hayCupon ? [k.final] : []), k.dto];
      fila.height = 20;
      for (let c = 1; c <= cols2; c++) {
        const cel = fila.getCell(c);
        cel.font = fuente({ color: { argb: c === 1 ? TEXTO_SUAVE : c >= 3 ? ROSA : TEXTO }, bold: c === cols2 || (hayCupon && c === 5), underline: c === 2 });
        cel.border = lineaAbajo;
        cel.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "right" };
        if (idx % 2 === 1) cel.fill = relleno(CEBRA);
        if (c >= 3 && c < cols2) cel.numFmt = EUROS;
      }
      fila.getCell(1).numFmt = "@";
      fila.getCell(cols2).numFmt = PORCENTAJE;
    });
    ws2.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
    ws2.autoFilter = { from: "A5", to: `${ult2}${5 + soloEllos.length}` };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function nombreArchivo(marca: string, fecha = new Date()): string {
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const limpio = marca.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${limpio}_COSMETICOS24H_${dd}-${mm}-${fecha.getFullYear()}_informe.xlsx`;
}
