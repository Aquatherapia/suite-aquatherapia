// Excel por marca con la estructura de los informes de precios de las marcas (p. ej. el de Matis Paris):
// EAN, nombre, PVP, PVP -10 % y resaltados los precios que quedan por debajo de ese -10 %.
// Diseño con los azules del logo de La Tienda de Cosméticos.
import type ExcelJS from "exceljs";

export type FilaExcel = {
  nombre: string; ean?: string; miUrl: string; suUrl: string;
  miPrecio: number; suPrecio: number; miPvp?: number; suPvp?: number; diff: number;
};
export type SoloEllosExcel = { titulo: string; precio: number; url: string; esPack: boolean };

// Colores del logo (azul #1270B6, azul claro #1C9CD9) y neutros
const AZUL = "FF1270B6";
const AZUL_CLARO = "FF1C9CD9";
const FONDO_NOSOTROS = "FFE8F1F9";
const FONDO_ELLOS = "FFE7F5FC";
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

export async function construirExcel(marca: string, filas: FilaExcel[], soloEllos: SoloEllosExcel[], fecha = new Date()): Promise<ArrayBuffer> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";

  const orden = [...filas].sort((a, b) => b.diff - a.diff);
  const pvpDe = (f: FilaExcel) => f.miPvp ?? f.miPrecio;
  const limiteDe = (f: FilaExcel) => Math.round(pvpDe(f) * 0.9 * 100) / 100;
  const masCaros = orden.filter(f => f.diff > 0.01).length;
  const pvpDistintos = orden.filter(f => f.suPvp != null && Math.abs(f.suPvp - pvpDe(f)) > 0.01).length;
  const bajoLimite = orden.filter(f => f.suPrecio < limiteDe(f) - 0.005).length;

  // ── Hoja 1: comparación por EAN ──
  const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  preparar(ws);
  ws.columns = [16, 52, 11, 11, 12, 11, 12, 13, 15].map(width => ({ width }));
  encabezado(ws, "I",
    `Comparativa de precios · ${marca}`,
    `La Tienda de Cosméticos frente a Cosméticos24h · emparejado por EAN · ${fechaCorta(fecha)}`,
    `${orden.length} productos comparados  ·  ${masCaros} en los que vamos más caros  ·  ${bajoLimite} que Cosméticos24h vende por debajo del PVP −10 %  ·  ${pvpDistintos} con PVP distinto`);

  // Fila 4: grupos de columnas
  ws.mergeCells("C4:E4"); ws.mergeCells("F4:G4");
  for (const [celda, texto, fondo, color] of [["C4", "NOSOTROS", FONDO_NOSOTROS, AZUL], ["F4", "COSMÉTICOS24H", FONDO_ELLOS, AZUL_CLARO]] as const) {
    const c = ws.getCell(celda);
    c.value = texto;
    c.font = fuente({ bold: true, size: 9, color: { argb: color } });
    c.fill = relleno(fondo);
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(4).height = 18;

  const CAB = 5;
  filaCabecera(ws, CAB, ["EAN", "PRODUCTO", "PVP", "PVP −10 %", "PRECIO", "PVP", "PRECIO", "DIFERENCIA", "MÁS BARATO"]);

  orden.forEach((f, idx) => {
    const n = CAB + 1 + idx;
    const pvp = pvpDe(f);
    const limite = limiteDe(f);
    const masBarato = f.diff > 0.01 ? "Cosméticos24h" : f.diff < -0.01 ? "Nosotros" : "Igual";
    const fila = ws.getRow(n);
    fila.values = [
      f.ean ?? "",
      { text: f.nombre, hyperlink: f.miUrl },
      pvp,
      { formula: `ROUND(C${n}*0.9,2)`, result: limite },
      f.miPrecio,
      f.suPvp ?? null,
      // Su precio enlaza a su ficha y sigue siendo un número (para ordenar y filtrar)
      { formula: `HYPERLINK("${f.suUrl}",${f.suPrecio})`, result: f.suPrecio },
      { formula: `E${n}-G${n}`, result: Math.round(f.diff * 100) / 100 },
      masBarato,
    ];
    fila.height = 22;
    for (let c = 1; c <= 9; c++) {
      const cel = fila.getCell(c);
      cel.font = fuente();
      cel.border = lineaAbajo;
      cel.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : c === 1 ? "left" : c === 9 ? "center" : "right", wrapText: c === 2 };
      if (idx % 2 === 1) cel.fill = relleno(CEBRA);
      if (c >= 3 && c <= 8) cel.numFmt = EUROS;
    }
    fila.getCell(1).numFmt = "@";
    fila.getCell(8).numFmt = EUROS_SIGNO;
    fila.getCell(1).font = fuente({ color: { argb: TEXTO_SUAVE } });
    fila.getCell(4).font = fuente({ color: { argb: TEXTO_SUAVE } });
    fila.getCell(5).font = fuente({ bold: true });
    fila.getCell(7).font = fuente({ bold: true, color: { argb: AZUL_CLARO } });

    // Resaltado, como en los informes de marca: precio por debajo del PVP -10 %
    for (const [c, precio] of [[5, f.miPrecio], [7, f.suPrecio]] as const) {
      if (precio < limite - 0.005) {
        fila.getCell(c).fill = relleno(ROJO_FONDO);
        fila.getCell(c).font = fuente({ bold: true, color: { argb: ROJO } });
      }
    }
    // PVP distinto en las dos webs (¿tarifa sin actualizar?)
    if (f.suPvp != null && Math.abs(f.suPvp - pvp) > 0.01) {
      for (const c of [3, 6]) {
        fila.getCell(c).fill = relleno(AMBAR_FONDO);
        fila.getCell(c).font = fuente({ bold: true, color: { argb: AMBAR } });
      }
    }
    if (f.diff > 0.01) fila.getCell(8).font = fuente({ bold: true, color: { argb: ROJO } });
    else if (f.diff < -0.01) fila.getCell(8).font = fuente({ bold: true, color: { argb: VERDE } });
    fila.getCell(9).font = fuente({ size: 9, bold: masBarato !== "Igual", color: { argb: masBarato === "Cosméticos24h" ? ROJO : masBarato === "Nosotros" ? VERDE : TEXTO_SUAVE } });
  });

  const ultima = CAB + orden.length;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: CAB, showGridLines: false }];
  ws.autoFilter = { from: `A${CAB}`, to: `I${Math.max(ultima, CAB)}` };

  // Leyenda
  const ley = ultima + 2;
  const leyenda: [string, string, string][] = [
    [ROJO_FONDO, ROJO, "Precio por debajo del PVP −10 %"],
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
  nota.value = "PVP: precio sin descuento. Precio: precio de venta actual. Diferencia: nuestro precio menos el suyo.";
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
