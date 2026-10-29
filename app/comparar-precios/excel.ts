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
};
export type CuponExcel = { pct: number; codigo?: string; directo?: boolean } | null;
export type SoloEllosExcel = { titulo: string; precio: number; url: string; esPack: boolean; ean?: string };

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
  masBarato: "Cosméticos24h" | "Nosotros" | "Igual"; igualar: string;
};
export function calcularFila(f: FilaExcel, descuento: number | null): FilaCalculada {
  const pvp = f.miPvp ?? f.miPrecio;
  const limite = descuento != null ? Math.round(pvp * (1 - descuento / 100) * 100) / 100 : null;
  const suPvp = f.suPvp ?? f.suPrecioWeb ?? f.suPrecio;
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  // Si vamos más caros: ¿llegamos a su precio final sin pasar nuestro descuento máximo?
  // Se da también el descuento total sobre nuestro PVP con el que quedaríamos.
  const dtoIgualar = pvp > 0 ? 1 - f.suPrecio / pvp : 0;
  const igualar = f.diff <= 0.01 ? ""
    : limite == null || f.suPrecio >= limite - 0.005 ? `Sí, bajando ${coma(f.diff)} € (dto. total ${pctTexto(dtoIgualar)})`
    : `No: haría falta un ${pctTexto(dtoIgualar)} (máx. ${pct})`;
  return {
    pvp, limite, suPvp,
    miDto: pvp > 0 ? 1 - f.miPrecio / pvp : 0,
    suWeb: f.suPrecioWeb ?? f.suPrecio,
    suDtoWeb: suPvp > 0 ? 1 - (f.suPrecioWeb ?? f.suPrecio) / suPvp : 0,
    suDto: suPvp > 0 ? 1 - f.suPrecio / suPvp : 0,
    bajoMinimo: { mio: limite != null && f.miPrecio < limite - 0.005, suyo: limite != null && f.suPrecio < limite - 0.005 },
    pvpDistinto: f.suPvp != null && Math.abs(f.suPvp - pvp) > 0.01,
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

  // ── Hoja 1: comparación por EAN ──
  const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  preparar(ws);
  // Columnas: A EAN · B producto · C-F nosotros (PVP, mínimo, precio, dto.)
  //          G-J Cosméticos24h (PVP, precio en su web, con cupón de carrito, dto. total)
  //          K diferencia · L más barato · M ¿podemos igualar? · N ficha en Cosméticos24h
  const factorCupon = cupon && cupon.pct > 0 ? 1 - cupon.pct / 100 : 1;
  const cuponTexto = cupon && cupon.pct > 0 ? `CON CUPÓN (−${coma(cupon.pct, 1).replace(/,0$/, "")} %${cupon.codigo ? ` ${cupon.codigo}` : ""})` : "CON CUPÓN (no hay)";
  ws.columns = [16, 50, 11, 12, 12, 9, 11, 12, 14, 10, 13, 15, 30, 16].map(width => ({ width }));
  encabezado(ws, "N",
    `Comparativa de precios · ${marca}`,
    `La Tienda de Cosméticos frente a Cosméticos24h · emparejado por EAN · ${fechaCorta(fecha)}` +
    (cupon && cupon.pct > 0 ? ` · su precio final lleva el cupón de carrito del ${coma(cupon.pct, 1).replace(/,0$/, "")} %${cupon.codigo ? ` (${cupon.codigo})` : ""}` : ""),
    `${orden.length} productos comparados  ·  ${masCaros} en los que vamos más caros  ·  ` +
    (descuento != null ? `${bajoLimite} que Cosméticos24h vende por debajo de nuestro mínimo (PVP −${pct})  ·  ` : "") +
    `${pvpDistintos} con PVP distinto`);

  // Fila 4: grupos de columnas
  ws.mergeCells("C4:F4"); ws.mergeCells("G4:J4");
  for (const [celda, texto, fondo, color] of [["C4", "NOSOTROS", FONDO_NOSOTROS, AZUL], ["G4", "COSMÉTICOS24H", FONDO_ELLOS, ROSA]] as const) {
    const c = ws.getCell(celda);
    c.value = texto;
    c.font = fuente({ bold: true, size: 9, color: { argb: color } });
    c.fill = relleno(fondo);
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(4).height = 18;

  const CAB = 5;
  filaCabecera(ws, CAB, ["EAN", "PRODUCTO", "PVP", descuento != null ? `MÍNIMO (−${pct})` : "MÍNIMO", "PRECIO", "DTO.", "PVP", "PRECIO WEB", cuponTexto, "DTO. TOTAL", "DIFERENCIA", "MÁS BARATO", "¿PODEMOS IGUALAR?", "FICHA COSMÉTICOS24H"]);
  // La cabecera de su grupo, en su rosa
  for (let c = 7; c <= 10; c++) ws.getRow(CAB).getCell(c).fill = relleno(ROSA);

  orden.forEach((f, idx) => {
    const n = CAB + 1 + idx;
    const { pvp, suPvp, suWeb, limite, miDto, suDto, masBarato, igualar } = calcularFila(f, descuento);
    const fila = ws.getRow(n);
    fila.values = [
      f.ean ?? "",
      { text: f.nombre, hyperlink: f.miUrl },
      pvp,
      factor != null && limite != null ? { formula: `ROUND(C${n}*${factor},2)`, result: limite } : "—",
      f.miPrecio,
      { formula: `IF(C${n}>0,1-E${n}/C${n},0)`, result: miDto },
      suPvp,
      suWeb,
      { formula: `ROUND(H${n}*${factorCupon},2)`, result: f.suPrecio },
      { formula: `IF(G${n}>0,1-I${n}/G${n},0)`, result: suDto },
      { formula: `E${n}-I${n}`, result: Math.round(f.diff * 100) / 100 },
      masBarato,
      igualar,
      { text: "Ver ficha", hyperlink: f.suUrl },
    ];
    fila.height = 22;
    for (let c = 1; c <= 14; c++) {
      const cel = fila.getCell(c);
      cel.font = fuente();
      cel.border = lineaAbajo;
      cel.alignment = { vertical: "middle", horizontal: c <= 2 || c === 13 ? "left" : c === 12 || c === 14 ? "center" : "right", wrapText: c === 2 };
      if (idx % 2 === 1) cel.fill = relleno(CEBRA);
      if ([3, 4, 5, 7, 8, 9].includes(c)) cel.numFmt = EUROS;
    }
    fila.getCell(1).numFmt = "@";
    fila.getCell(6).numFmt = PORCENTAJE;
    fila.getCell(10).numFmt = PORCENTAJE;
    fila.getCell(11).numFmt = EUROS_SIGNO;
    fila.getCell(1).font = fuente({ color: { argb: TEXTO_SUAVE } });
    fila.getCell(4).font = fuente({ color: { argb: TEXTO_SUAVE } });
    fila.getCell(5).font = fuente({ bold: true });
    fila.getCell(6).font = fuente({ size: 9, color: { argb: AZUL } });
    fila.getCell(7).font = fuente({ color: { argb: ROSA } });
    fila.getCell(8).font = fuente({ color: { argb: ROSA } });
    fila.getCell(9).font = fuente({ bold: true, color: { argb: ROSA } });
    fila.getCell(10).font = fuente({ size: 9, bold: true, color: { argb: ROSA } });
    fila.getCell(14).font = fuente({ size: 9, underline: true, color: { argb: ROSA } });

    // Resaltado, como en los informes de marca: precio por debajo de nuestro mínimo
    for (const [c, precio] of [[5, f.miPrecio], [9, f.suPrecio]] as const) {
      if (limite != null && precio < limite - 0.005) {
        fila.getCell(c).fill = relleno(ROJO_FONDO);
        fila.getCell(c).font = fuente({ bold: true, color: { argb: ROJO } });
        fila.getCell(c + 1).font = fuente({ size: 9, bold: true, color: { argb: ROJO } });
      }
    }
    // PVP distinto en las dos webs (¿tarifa sin actualizar?)
    if (f.suPvp != null && Math.abs(f.suPvp - pvp) > 0.01) {
      for (const c of [3, 7]) {
        fila.getCell(c).fill = relleno(AMBAR_FONDO);
        fila.getCell(c).font = fuente({ bold: true, color: { argb: AMBAR } });
      }
    }
    if (f.diff > 0.01) fila.getCell(11).font = fuente({ bold: true, color: { argb: ROJO } });
    else if (f.diff < -0.01) fila.getCell(11).font = fuente({ bold: true, color: { argb: VERDE } });
    fila.getCell(12).font = fuente({ size: 9, bold: masBarato !== "Igual", color: { argb: masBarato === "Cosméticos24h" ? ROJO : masBarato === "Nosotros" ? VERDE : TEXTO_SUAVE } });
    fila.getCell(13).font = fuente({ size: 9, bold: igualar.startsWith("No"), color: { argb: igualar.startsWith("No") ? ROJO : igualar ? VERDE : TEXTO_SUAVE } });
  });

  const ultima = CAB + orden.length;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: CAB, showGridLines: false }];
  ws.autoFilter = { from: `A${CAB}`, to: `N${Math.max(ultima, CAB)}` };

  // Leyenda
  const ley = ultima + 2;
  const leyenda: [string, string, string][] = [
    [ROJO_FONDO, ROJO, descuento != null ? `Precio por debajo de nuestro mínimo (PVP −${pct}, descuento máximo de la marca)` : "Precio por debajo de nuestro mínimo (esta marca no tiene descuento máximo)"],
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
  nota.value = "PVP: precio sin descuento. Mínimo: PVP menos el descuento máximo de la marca (Boardfy o el puesto en la app). Precio: precio de venta actual. Con cupón: su precio con el descuento que aplican en el carrito. Dto. total: lo que rebajan sobre su PVP contando el cupón. Diferencia: nuestro precio menos su precio final.";
  nota.font = fuente({ size: 9, italic: true, color: { argb: TEXTO_SUAVE } });

  // ── Hoja 2: lo que tienen ellos y nosotros no ──
  if (soloEllos.length > 0) {
    const ws2 = wb.addWorksheet("Solo Cosméticos24h");
    preparar(ws2);
    ws2.columns = [70, 14, 12].map(width => ({ width }));
    encabezado(ws2, "C",
      `Solo en Cosméticos24h · ${marca}`,
      `Productos que venden ellos y no tienen nuestro mismo EAN · ${fechaCorta(fecha)}`,
      `${soloEllos.length} productos`);
    filaCabecera(ws2, 5, ["PRODUCTO", "PRECIO", "TIPO"]);
    for (let c = 1; c <= 3; c++) ws2.getRow(5).getCell(c).fill = relleno(ROSA);
    soloEllos.forEach((s, idx) => {
      const fila = ws2.getRow(6 + idx);
      fila.values = [{ text: s.titulo, hyperlink: s.url }, s.precio, s.esPack ? "Pack" : "Producto"];
      fila.height = 20;
      for (let c = 1; c <= 3; c++) {
        const cel = fila.getCell(c);
        cel.font = fuente({ color: { argb: c === 3 ? TEXTO_SUAVE : TEXTO } });
        cel.border = lineaAbajo;
        cel.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : c === 2 ? "right" : "center" };
        if (idx % 2 === 1) cel.fill = relleno(CEBRA);
      }
      fila.getCell(2).numFmt = EUROS;
    });
    ws2.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
    ws2.autoFilter = { from: "A5", to: `C${5 + soloEllos.length}` };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function nombreArchivo(marca: string, fecha = new Date()): string {
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const limpio = marca.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${limpio}_COSMETICOS24H_${dd}-${mm}-${fecha.getFullYear()}_informe.xlsx`;
}
