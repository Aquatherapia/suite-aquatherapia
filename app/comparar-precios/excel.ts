// Excel por marca con el formato de los informes de precios de las marcas (p. ej. el de Matis Paris):
// EAN, nombre, PVP, PVP -10 % y, en rojo, los precios que quedan por debajo de ese -10 %.
import type ExcelJS from "exceljs";

export type FilaExcel = {
  nombre: string; ean?: string; miUrl: string; suUrl: string;
  miPrecio: number; suPrecio: number; miPvp?: number; suPvp?: number; diff: number;
};
export type SoloEllosExcel = { titulo: string; precio: number; url: string; esPack: boolean };

const AZUL = "FF1F3864";
const AZUL_CLARO = "FFDDEBF7";
const ROJO_FONDO = "FFFFC7CE";
const ROJO_TEXTO = "FF9C0006";
const NARANJA_FONDO = "FFFFEDD5";
const NARANJA_TEXTO = "FFC2410C";
const EUROS = '#,##0.00" €"';

function relleno(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function cabecera(ws: ExcelJS.Worksheet, titulos: string[], anchos: number[]) {
  ws.columns = anchos.map(width => ({ width }));
  const fila = ws.addRow(titulos);
  fila.height = 48;
  fila.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = relleno(AZUL);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

export async function construirExcel(marca: string, filas: FilaExcel[], soloEllos: SoloEllosExcel[]): Promise<ArrayBuffer> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();

  // ── Hoja 1: comparación por EAN ──
  const ws = wb.addWorksheet(marca.slice(0, 31));
  cabecera(ws,
    ["EAN", "NOMBRE", "PVP", "PVP -10%", "NUESTRO PRECIO", "PVP COSMÉTICOS24H", "PRECIO COSMÉTICOS24H", "DIFERENCIA (NOSOTROS − ELLOS)", "MÁS BARATO"],
    [16, 55, 12, 12, 14, 14, 14, 16, 16]);

  for (const f of [...filas].sort((a, b) => b.diff - a.diff)) {
    const n = ws.rowCount + 1;
    const pvp = f.miPvp ?? f.miPrecio;
    const limite = Math.round(pvp * 0.9 * 100) / 100;
    const masBarato = f.diff > 0.01 ? "Cosméticos24h" : f.diff < -0.01 ? "Nosotros" : "Igual";
    const fila = ws.addRow([
      f.ean ?? "",
      { text: f.nombre, hyperlink: f.miUrl },
      pvp,
      { formula: `ROUND(C${n}*0.9,2)`, result: limite },
      f.miPrecio,
      f.suPvp ?? null,
      f.suPrecio,
      { formula: `E${n}-G${n}`, result: Math.round(f.diff * 100) / 100 },
      masBarato,
    ]);
    // Su precio enlaza a su ficha y sigue siendo un número (para ordenar y filtrar)
    fila.getCell(7).value = { formula: `HYPERLINK("${f.suUrl}",${f.suPrecio})`, result: f.suPrecio };
    fila.getCell(1).numFmt = "@";
    fila.getCell(2).font = { color: { argb: "FF1F3864" }, underline: true };
    for (const c of [3, 4, 5, 6, 7, 8]) fila.getCell(c).numFmt = EUROS;
    fila.getCell(3).fill = relleno(AZUL_CLARO);
    // En rojo, como en los informes de marca: precio por debajo del PVP -10 %
    for (const [c, precio] of [[5, f.miPrecio], [7, f.suPrecio]] as const) {
      if (precio < limite - 0.005) {
        fila.getCell(c).fill = relleno(ROJO_FONDO);
        fila.getCell(c).font = { color: { argb: ROJO_TEXTO } };
      }
    }
    // En naranja, PVP distinto en las dos webs (¿tarifa sin actualizar?)
    if (f.suPvp != null && Math.abs(f.suPvp - pvp) > 0.01) {
      fila.getCell(6).fill = relleno(NARANJA_FONDO);
      fila.getCell(6).font = { bold: true, color: { argb: NARANJA_TEXTO } };
    }
    if (f.diff > 0.01) fila.getCell(8).font = { bold: true, color: { argb: "FFB91C1C" } };
    else if (f.diff < -0.01) fila.getCell(8).font = { color: { argb: "FF15803D" } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `I${Math.max(ws.rowCount, 1)}` };

  // ── Hoja 2: lo que tienen ellos y nosotros no ──
  if (soloEllos.length > 0) {
    const ws2 = wb.addWorksheet("Solo Cosméticos24h");
    cabecera(ws2, ["NOMBRE", "PRECIO COSMÉTICOS24H", "TIPO"], [70, 14, 12]);
    for (const s of soloEllos) {
      const fila = ws2.addRow([{ text: s.titulo, hyperlink: s.url }, s.precio, s.esPack ? "Pack" : "Producto"]);
      fila.getCell(1).font = { color: { argb: "FF1F3864" }, underline: true };
      fila.getCell(2).numFmt = EUROS;
    }
    ws2.views = [{ state: "frozen", ySplit: 1 }];
    ws2.autoFilter = { from: "A1", to: `C${ws2.rowCount}` };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function nombreArchivo(marca: string, fecha = new Date()): string {
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const limpio = marca.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${limpio}_COSMETICOS24H_${dd}-${mm}-${fecha.getFullYear()}_informe.xlsx`;
}
