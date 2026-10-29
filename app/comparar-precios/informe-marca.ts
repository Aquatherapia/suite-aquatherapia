// Informe para enviar a la marca: productos que Cosméticos24h vende por debajo del descuento autorizado.
// Lleva nuestro PVP, el descuento autorizado, el precio mínimo que sale de ahí y todos sus precios,
// con los enlaces a las dos fichas. No lleva nuestro precio de venta ni notas. En Excel y en PDF.
import { calcularFila, type CuponExcel, type FilaExcel } from "./excel";

export type FilaMarca = {
  ean: string; producto: string; miUrl: string; suUrl: string;
  pvp: number; minimo: number; suPvp: number; suWeb: number; suDtoWeb: number; suFinal: number; suDto: number;
  dtoSobrePvp: number; // lo que rebajan sobre nuestro PVP (el oficial de la marca)
  porDebajo: number;   // € por debajo del precio mínimo autorizado
};

// Solo las filas en las que su precio final queda por debajo de nuestro PVP con el descuento autorizado (sin packs)
export function filasParaMarca(filas: FilaExcel[], descuento: number | null): FilaMarca[] {
  if (descuento == null) return [];
  return filas
    .map(f => ({ f, k: calcularFila(f, descuento) }))
    .filter(({ k }) => k.bajoMinimo.suyo && !k.esPack && k.limite != null)
    .map(({ f, k }) => ({
      ean: f.ean ?? "", producto: f.nombre, miUrl: f.miUrl, suUrl: f.suUrl,
      pvp: k.pvp, minimo: k.limite!, suPvp: k.suPvp, suWeb: k.suWeb, suDtoWeb: k.suDtoWeb, suFinal: f.suPrecio, suDto: k.suDto,
      dtoSobrePvp: k.pvp > 0 ? 1 - f.suPrecio / k.pvp : 0,
      porDebajo: Math.round((k.limite! - f.suPrecio) * 100) / 100,
    }))
    .sort((a, b) => b.dtoSobrePvp - a.dtoSobrePvp);
}

const limpio = (marca: string) => marca.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
function fechaArchivo(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
function fechaCorta(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
export const nombreMarcaExcel = (marca: string, fecha = new Date()) => `${limpio(marca)}_precios_bajo_dto_autorizado_${fechaArchivo(fecha)}.xlsx`;
export const nombreMarcaPdf = (marca: string, fecha = new Date()) => `${limpio(marca)}_precios_bajo_dto_autorizado_${fechaArchivo(fecha)}.pdf`;

const num = (n: number) => String(n).replace(".", ",");
const textoCupon = (cupon: CuponExcel) => cupon && cupon.pct > 0 ? `PRECIO FINAL (${cupon.codigo ?? "cupón"} -${num(cupon.pct)} % EN CARRITO)` : "";
const titulo = (marca: string) => `${marca}: precios por debajo del descuento autorizado`;
const subtitulo = (descuento: number, fecha: Date) =>
  `Cosméticos24h (cosmeticos24h.com) · precios consultados el ${fechaCorta(fecha)} · descuento autorizado: ${num(descuento)} % sobre el PVP`;
const resumen = (n: number) => `${n} producto${n !== 1 ? "s" : ""} por debajo del precio mínimo autorizado (PVP menos el descuento autorizado).`;
// ── Excel ──
const AZUL = "FF1270B6", ROSA = "FFB5655F", GRIS = "FF4B5563", TEXTO = "FF1F2933", SUAVE = "FF6B7280", ROJO = "FFB42318";
const FONDO_AZUL = "FFEEF5FC", FONDO_ROSA = "FFFDF0EE", FONDO_GRIS = "FFF6F7F9", LINEA = "FFE5E7EB";
const EUROS = '#,##0.00 "€"', PORC = "0.0 %";

export async function construirExcelMarca(marca: string, filas: FilaExcel[], descuento: number, cupon: CuponExcel, fecha = new Date()): Promise<ArrayBuffer> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const datos = filasParaMarca(filas, descuento);
  const hayCupon = !!cupon && cupon.pct > 0;

  type Col = { t: string; w: number; grupo: "base" | "nos" | "ellos" | "fin"; v: (f: FilaMarca) => ExcelJS_Valor; fmt?: string };
  type ExcelJS_Valor = string | number | { text: string; hyperlink: string };
  const cols: Col[] = [
    { t: "EAN", w: 16, grupo: "base", v: f => f.ean },
    { t: "PRODUCTO", w: 50, grupo: "base", v: f => f.producto },
    { t: "PVP", w: 11, grupo: "nos", v: f => f.pvp, fmt: EUROS },
    { t: `DTO. AUTORIZADO`, w: 12, grupo: "nos", v: () => descuento / 100, fmt: PORC },
    { t: "PRECIO MÍNIMO AUTORIZADO", w: 14, grupo: "nos", v: f => f.minimo, fmt: EUROS },
    { t: "PVP", w: 11, grupo: "ellos", v: f => f.suPvp, fmt: EUROS },
    { t: hayCupon ? "PRECIO CON DTO." : "PRECIO FINAL CON DTO.", w: 13, grupo: "ellos", v: f => f.suWeb, fmt: EUROS },
    ...(hayCupon ? [{ t: "DTO.", w: 8, grupo: "ellos" as const, v: (f: FilaMarca) => f.suDtoWeb, fmt: PORC }, { t: textoCupon(cupon), w: 18, grupo: "ellos" as const, v: (f: FilaMarca) => f.suFinal, fmt: EUROS }] : []),
    { t: "DTO. TOTAL", w: 10, grupo: "ellos", v: f => f.suDto, fmt: PORC },
    { t: "DTO. SOBRE PVP", w: 11, grupo: "fin", v: f => f.dtoSobrePvp, fmt: PORC },
    { t: "POR DEBAJO DEL MÍNIMO", w: 14, grupo: "fin", v: f => f.porDebajo, fmt: EUROS },
    { t: "FICHA EN COSMÉTICOS24H", w: 23, grupo: "fin", v: f => ({ text: "Ver en Cosméticos24h ↗", hyperlink: f.suUrl }) },
    { t: "FICHA EN LA TIENDA DE COSMÉTICOS", w: 21, grupo: "fin", v: f => ({ text: "Ver nuestra ficha ↗", hyperlink: f.miUrl }) },
  ];
  ws.columns = cols.map(c => ({ width: c.w }));
  const ult = String.fromCharCode(64 + cols.length);
  const fuente = (extra: object = {}) => ({ name: "Calibri", size: 10, color: { argb: TEXTO }, ...extra });
  const relleno = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

  ws.mergeCells(`A1:${ult}1`); ws.getCell("A1").value = titulo(marca); ws.getCell("A1").font = fuente({ size: 16, bold: true, color: { argb: AZUL } }); ws.getRow(1).height = 28;
  ws.mergeCells(`A2:${ult}2`); ws.getCell("A2").value = subtitulo(descuento, fecha); ws.getCell("A2").font = fuente({ color: { argb: SUAVE } });
  ws.mergeCells(`A3:${ult}3`); ws.getCell("A3").value = resumen(datos.length); ws.getCell("A3").font = fuente({ bold: true });

  // Fila 5: bloques; fila 6: cabeceras
  const grupos: Record<Col["grupo"], [string, string, string]> = {
    base: ["", "FFFFFFFF", AZUL], nos: ["MARCA (PVP Y DTO. AUTORIZADO)", FONDO_AZUL, AZUL], ellos: ["COSMÉTICOS24H", FONDO_ROSA, ROSA], fin: ["DIFERENCIA Y ENLACES", FONDO_GRIS, GRIS],
  };
  let ini = 0;
  while (ini < cols.length) {
    let fin = ini; while (fin + 1 < cols.length && cols[fin + 1].grupo === cols[ini].grupo) fin++;
    const [txt, fondo, color] = grupos[cols[ini].grupo];
    const a = String.fromCharCode(65 + ini), b = String.fromCharCode(65 + fin);
    if (fin > ini) ws.mergeCells(`${a}5:${b}5`);
    const c = ws.getCell(`${a}5`);
    c.value = txt; c.font = fuente({ bold: true, size: 9, color: { argb: color } }); c.fill = relleno(fondo); c.alignment = { horizontal: "center" };
    ini = fin + 1;
  }
  const cab = ws.getRow(6);
  cols.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.t;
    cel.font = fuente({ bold: true, size: 9, color: { argb: "FFFFFFFF" } });
    cel.fill = relleno(grupos[c.grupo][2]);
    cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  cab.height = 34;

  datos.forEach((f, idx) => {
    const fila = ws.getRow(7 + idx);
    cols.forEach((c, i) => {
      const cel = fila.getCell(i + 1);
      cel.value = c.v(f);
      if (c.fmt) cel.numFmt = c.fmt;
      const enlace = typeof cel.value === "object";
      const rojo = c.t === "POR DEBAJO DEL MÍNIMO" || c.t === "DTO. SOBRE PVP";
      cel.font = fuente({
        color: { argb: enlace ? (i === cols.length - 2 ? ROSA : AZUL) : rojo ? ROJO : c.grupo === "ellos" ? ROSA : i === 0 ? SUAVE : TEXTO },
        bold: rojo || c.t === "PRECIO MÍNIMO AUTORIZADO", underline: enlace,
      });
      cel.fill = relleno(c.grupo === "nos" ? FONDO_AZUL : c.grupo === "ellos" ? FONDO_ROSA : c.grupo === "fin" ? FONDO_GRIS : "FFFFFFFF");
      cel.border = { bottom: { style: "thin", color: { argb: LINEA } } };
      cel.alignment = { vertical: "middle", horizontal: i <= 1 ? "left" : enlace ? "center" : "right", wrapText: i === 1 };
    });
    fila.getCell(1).numFmt = "@";
  });
  if (datos.length) ws.autoFilter = { from: "A6", to: `${ult}${6 + datos.length}` };
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// ── PDF ──
type RGB = [number, number, number];
const P_AZUL: RGB = [18, 112, 182], P_ROSA: RGB = [181, 101, 95], P_GRIS: RGB = [75, 85, 99], P_TEXTO: RGB = [31, 41, 51], P_SUAVE: RGB = [107, 114, 128], P_ROJO: RGB = [180, 35, 24];
const P_F_AZUL: RGB = [238, 245, 252], P_F_ROSA: RGB = [253, 240, 238], P_F_GRIS: RGB = [246, 247, 249];
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const pct = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;

export async function construirPdfMarca(marca: string, filas: FilaExcel[], descuento: number, cupon: CuponExcel, fecha = new Date()): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const M = 10;
  const datos = filasParaMarca(filas, descuento);
  const hayCupon = !!cupon && cupon.pct > 0;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...P_AZUL);
  doc.text(titulo(marca), M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...P_SUAVE);
  doc.text(subtitulo(descuento, fecha), M, 20);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...P_TEXTO);
  doc.text(resumen(datos.length), M, 26);

  // Bloques: base (2) · marca (3) · Cosméticos24h (3 o 4) · diferencia y enlaces (4)
  const nEllos = hayCupon ? 4 : 3;
  const grupoDe = (c: number): "base" | "nos" | "ellos" | "fin" => c < 2 ? "base" : c < 5 ? "nos" : c < 5 + nEllos ? "ellos" : "fin";
  const colEnlaceC24 = 5 + nEllos + 2, colEnlaceMia = colEnlaceC24 + 1;
  const cuerpo = datos.map(f => [
    f.ean, f.producto, eur(f.pvp), pct(descuento / 100), eur(f.minimo),
    eur(f.suPvp), f.suDtoWeb > 0.0005 ? `${eur(f.suWeb)}\n-${pct(f.suDtoWeb)}` : eur(f.suWeb), ...(hayCupon ? [eur(f.suFinal)] : []), pct(f.suDto),
    pct(f.dtoSobrePvp), eur(f.porDebajo), "Ver >", "Ver >",
  ]);
  const cab = (t: string, color: RGB) => ({ content: t, styles: { fillColor: color } });
  autoTable(doc, {
    startY: 31,
    margin: { left: M, right: M },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 7.5, textColor: P_TEXTO, cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 }, valign: "middle", halign: "right" },
    headStyles: { fontStyle: "bold", fontSize: 6.5, textColor: [255, 255, 255], halign: "center", valign: "middle" },
    head: [
      [
        { content: "", colSpan: 2, styles: { fillColor: [255, 255, 255] } },
        { content: "MARCA (PVP Y DTO. AUTORIZADO)", colSpan: 3, styles: { fillColor: P_F_AZUL, textColor: P_AZUL } },
        { content: "COSMÉTICOS24H", colSpan: nEllos, styles: { fillColor: P_F_ROSA, textColor: P_ROSA } },
        { content: "DIFERENCIA Y ENLACES", colSpan: 4, styles: { fillColor: P_F_GRIS, textColor: P_GRIS } },
      ],
      [
        cab("EAN", P_AZUL), cab("PRODUCTO", P_AZUL),
        cab("PVP", P_AZUL), cab("DTO.\nAUTORIZADO", P_AZUL), cab("PRECIO MÍNIMO\nAUTORIZADO", P_AZUL),
        cab("PVP", P_ROSA), cab(hayCupon ? "PRECIO CON DTO." : "PRECIO FINAL CON DTO.", P_ROSA), ...(hayCupon ? [cab(textoCupon(cupon), P_ROSA)] : []), cab("DTO. TOTAL", P_ROSA),
        cab("DTO. SOBRE PVP", P_GRIS), cab("POR DEBAJO DEL MÍNIMO", P_GRIS), cab("FICHA\nCOSMÉTICOS24H", P_GRIS), cab("NUESTRA\nFICHA", P_GRIS),
      ],
    ],
    body: cuerpo,
    // Anchos fijos para que los importes no se partan; el producto se queda con el resto
    columnStyles: Object.fromEntries([
      [0, { cellWidth: 22, halign: "left", textColor: P_SUAVE }], [1, { cellWidth: hayCupon ? 61 : 77, halign: "left" }],
      ...Array.from({ length: 3 + nEllos }, (_, i) => [2 + i, { cellWidth: i === 1 || i === 2 ? 19 : 16 }]),
      [5 + nEllos, { cellWidth: 16 }], [6 + nEllos, { cellWidth: 18 }], [colEnlaceC24, { cellWidth: 24 }], [colEnlaceMia, { cellWidth: 18 }],
    ]),
    didParseCell: d => {
      if (d.section !== "body") return;
      const c = d.column.index, g = grupoDe(c), s = d.cell.styles;
      s.fillColor = g === "nos" ? P_F_AZUL : g === "ellos" ? P_F_ROSA : g === "fin" ? P_F_GRIS : [255, 255, 255];
      s.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
      s.lineColor = [229, 231, 235];
      if (g === "ellos") s.textColor = P_ROSA;
      if (c === 4) s.fontStyle = "bold";
      if (c === colEnlaceC24 - 2 || c === colEnlaceC24 - 1) { s.textColor = P_ROJO; s.fontStyle = "bold"; }
      if (c === colEnlaceC24 || c === colEnlaceMia) { s.halign = "center"; s.fontStyle = "bold"; s.textColor = c === colEnlaceC24 ? P_ROSA : P_AZUL; }
    },
    didDrawCell: d => {
      if (d.section !== "body") return;
      const f = datos[d.row.index];
      if (!f) return;
      if (d.column.index === colEnlaceC24) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: f.suUrl });
      if (d.column.index === colEnlaceMia) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: f.miUrl });
    },
  });
  return doc.output("blob");
}
