// Descargas del apartado «Comparar con la competencia»: el informe de la marca (PDF y Excel, con las mismas
// columnas, cálculos y colores que la tabla de la web) y el informe «Para la marca» (lo que la competencia
// vende por debajo de nuestro PVP con el dto. autorizado).
import type ExcelJS from "exceljs";
import { COMPETIDORES, type Competidor, type EstadoComp, type FilaComp } from "./competidores";
import { calcularFila, columnasDe, ordenar, pctTexto, type CalcFila, type CuponComp } from "./calculo";

const AZUL = "1270B6", TEXTO = "1F2933", SUAVE = "6B7280", LINEA = "E5E7EB", CEBRA = "F8FAFC";
const ROJO = "D40000", VERDE = "067647", AMBAR = "B45309", AMBAR_FONDO = "FEF6E7", BAJO_FONDO = "FDECEC", BAJO = "B91C1C";
const PASADO_FONDO = "DFF4F7", PASADO = "0E7490", FONDO_NOS = "E8F1F9";
const EUROS = '#,##0.00 "€"', EUROS_SIGNO = '+#,##0.00 "€";-#,##0.00 "€";0.00 "€"', PORC = "0.0 %";

const hex = (c: string) => c.replace("#", "").toUpperCase();
const rgb = (c: string): [number, number, number] => { const h = hex(c); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const num = (n: number) => String(n).replace(".", ",");
const limpio = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const fechaArchivo = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
const fechaCorta = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Avisos de PVP de una fila, en texto (van en su propia columna en el Excel y bajo el producto en el PDF)
function avisos(f: FilaComp, k: CalcFila): string[] {
  const out: string[] = [];
  if (k.revisarPrecio.length) out.push(`Revisar precio: PVP más alto en ${k.revisarPrecio.join(", ")}`);
  const sinAct = COMPETIDORES.filter(c => k.comp[c.id]?.pvpSinActualizar).map(c => c.corto);
  if (sinAct.length) out.push(`Tarifa sin actualizar en ${sinAct.join(", ")}`);
  return out;
}

function resumen(filas: FilaComp[], calc: CalcFila[], descuento: number | null): string {
  const caros = calc.filter(k => k.diferencia != null && k.diferencia < -0.005).length;
  const bajo = calc.filter(k => k.bajoAutorizado != null).length;
  const pvp = calc.filter(k => k.pvpDistintos > 0).length;
  return `${filas.length} productos con competencia  ·  ${caros} en los que alguien vende más barato  ·  ` +
    (descuento != null ? `${bajo} por debajo de nuestro dto. autorizado (PVP -${num(descuento)} %)  ·  ` : "") + `${pvp} con PVP distinto`;
}

const cabeceraCupon = (c: Competidor, cupon: CuponComp) => c.id === "c24" && cupon ? `PRECIO FINAL (${cupon.codigo ?? "CUPÓN"} -${num(cupon.pct)} %)` : "PRECIO FINAL";

// Hoja «Resumen», con la forma del informe de Boardfy: un producto por fila y una columna por tienda con su precio
function hojaResumen(wb: ExcelJS.Workbook, filas: FilaComp[], calc: CalcFila[], descuento: number | null) {
  const ws = wb.addWorksheet("Resumen");
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  // Tiendas de más a menos productos encontrados
  const tiendas = COMPETIDORES.map(c => ({ c, n: filas.filter(f => f.precios[c.id]).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).map(x => x.c);
  const cab = ["EAN", "NOMBRE", "PVP", descuento != null ? `PVP -${num(descuento)}%` : "PVP CON DTO.", "NUESTRO PRECIO", "TIENDA MÁS BARATA", ...tiendas.map(c => c.nombre)];
  const r1 = ws.getRow(1);
  cab.forEach((t, i) => {
    const c = r1.getCell(i + 1); c.value = t;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + (i < 6 ? AZUL : hex(tiendas[i - 6].color)) } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  r1.height = 30;
  ws.getColumn(1).width = 15; ws.getColumn(2).width = 60; ws.getColumn(6).width = 24;
  for (let i = 3; i <= cab.length; i++) if (i !== 6) ws.getColumn(i).width = 13;
  filas.forEach((f, i) => {
    const k = calc[i], row = ws.getRow(2 + i);
    row.getCell(1).value = f.ean ?? "";
    row.getCell(2).value = { text: f.nombre, hyperlink: f.url };
    row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: "FF" + AZUL } };
    row.getCell(3).value = f.pvp; row.getCell(3).numFmt = EUROS;
    row.getCell(4).value = k.limite ?? "-"; if (k.limite != null) row.getCell(4).numFmt = EUROS;
    row.getCell(5).value = f.precio; row.getCell(5).numFmt = EUROS;
    row.getCell(6).value = !k.mb ? "-" : k.masBarato === "La Tienda de Cosméticos" || k.masBarato === "Igual" ? k.masBarato : k.empatados.map(id => COMPETIDORES.find(c => c.id === id)?.nombre ?? id).join(" · ");
    row.getCell(6).font = { name: "Calibri", size: 10, bold: true };
    tiendas.forEach((c, j) => {
      const p = f.precios[c.id]; if (!p) return;
      const cel = row.getCell(7 + j), bajo = k.comp[c.id]?.bajoMinimo;
      cel.value = p.precio; cel.numFmt = EUROS; // número, para poder ordenar y calcular (los enlaces están en la hoja de detalle)
      cel.font = { name: "Calibri", size: 10, bold: k.mb?.id === c.id, color: { argb: "FF" + (bajo ? BAJO : TEXTO) } };
      if (bajo) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BAJO_FONDO } };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + filas.length, column: cab.length } };
}

// ── Informe de la marca en Excel ───────────────────────────────────────
export async function descargarExcel(marca: string, filasIn: FilaComp[], _estados: Record<string, EstadoComp>, descuento: number | null, cupon: CuponComp, fecha = new Date()) {
  const { default: Excel } = await import("exceljs");
  const filas = ordenar(filasIn);
  const calc = filas.map(f => calcularFila(f, descuento));
  const cols = columnasDe(filas, {});
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  hojaResumen(wb, filas, calc, descuento);
  const ws = wb.addWorksheet(("Detalle " + marca.replace(/[\\/?*[\]:]/g, " ")).slice(0, 31));
  ws.views = [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 6 }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Calibri", size: 10, color: { argb: "FF" + TEXTO }, ...extra });
  const relleno = (c: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex(c) } });

  const nCols = 2 + 3 + cols.length * 2 + 5;
  const ultima = ws.getColumn(nCols).letter;
  ws.mergeCells(`A1:${ultima}1`); ws.getCell("A1").value = `Comparativa de precios con la competencia · ${marca}`;
  ws.getCell("A1").font = fuente({ size: 16, bold: true, color: { argb: "FF" + AZUL } }); ws.getRow(1).height = 28;
  ws.mergeCells(`A2:${ultima}2`);
  ws.getCell("A2").value = `La Tienda de Cosméticos frente a ${cols.map(c => c.nombre).join(", ")} · ${fechaCorta(fecha)}` + (cupon ? ` · Cosméticos24h con su cupón de carrito del ${num(cupon.pct)} %` : "") + " · ≈ = emparejado por nombre (su web no publica el EAN)";
  ws.getCell("A2").font = fuente({ color: { argb: "FF" + SUAVE } });
  ws.mergeCells(`A3:${ultima}3`); ws.getCell("A3").value = resumen(filas, calc, descuento); ws.getCell("A3").font = fuente({ bold: true });

  // Fila 5: grupos; fila 6: columnas
  const grupos = ws.getRow(5), cab = ws.getRow(6);
  const grupo = (desde: number, hasta: number, texto: string, color: string, fondo: string) => {
    ws.mergeCells(5, desde, 5, hasta);
    const c = grupos.getCell(desde); c.value = texto; c.font = fuente({ bold: true, color: { argb: "FF" + hex(color) } }); c.fill = relleno(fondo); c.alignment = { horizontal: "center", vertical: "middle" };
  };
  const titulos: { t: string; color: string }[] = [
    { t: "EAN", color: AZUL }, { t: "PRODUCTO", color: AZUL }, { t: "PVP", color: AZUL },
    { t: descuento != null ? `CON DTO. AUTORIZADO (-${num(descuento)} %)` : "CON DTO. AUTORIZADO", color: AZUL }, { t: "PRECIO FINAL", color: AZUL },
  ];
  grupo(3, 5, "LA TIENDA DE COSMÉTICOS", AZUL, FONDO_NOS);
  cols.forEach((c, i) => {
    grupo(6 + i * 2, 7 + i * 2, c.nombre.toUpperCase(), c.color, c.fondo);
    titulos.push({ t: "PVP", color: c.color }, { t: cabeceraCupon(c, cupon), color: c.color });
  });
  const fin = 6 + cols.length * 2;
  grupo(fin, fin + 4, "COMPARACIÓN", "374151", "F3F4F6");
  titulos.push({ t: "MÁS BARATO", color: "374151" }, { t: "DIFERENCIA", color: "374151" }, { t: "POR DEBAJO DEL DTO. AUTORIZADO", color: "374151" }, { t: "¿PODEMOS IGUALAR?", color: "374151" }, { t: "AVISOS DE PVP", color: "374151" });
  titulos.forEach((x, i) => {
    const c = cab.getCell(i + 1); c.value = x.t; c.fill = relleno(x.color);
    c.font = fuente({ bold: true, size: 9, color: { argb: "FFFFFFFF" } }); c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  cab.height = 34;
  ws.getColumn(1).width = 15; ws.getColumn(2).width = 48;
  for (let i = 3; i < fin; i++) ws.getColumn(i).width = 12;
  ws.getColumn(fin).width = 18; ws.getColumn(fin + 1).width = 12; ws.getColumn(fin + 2).width = 14; ws.getColumn(fin + 3).width = 34; ws.getColumn(fin + 4).width = 40;

  filas.forEach((f, i) => {
    const k = calc[i];
    const row = ws.getRow(7 + i);
    const celda = (col: number, v: ExcelJS.CellValue, fmt?: string, extra: Partial<ExcelJS.Font> = {}, fondo?: string) => {
      const c = row.getCell(col); c.value = v; if (fmt) c.numFmt = fmt;
      c.font = fuente(extra); c.alignment = { vertical: "middle", horizontal: col <= 2 || col >= fin + 3 ? "left" : "right", wrapText: col === 2 || col >= fin + 3 };
      c.fill = relleno(fondo ?? (i % 2 ? CEBRA : "FFFFFF"));
      c.border = { bottom: { style: "thin", color: { argb: "FF" + LINEA } } };
      return c;
    };
    celda(1, f.ean ?? "", undefined, { color: { argb: "FF" + SUAVE } });
    celda(2, { text: f.nombre, hyperlink: f.url }, undefined, { color: { argb: "FF" + AZUL } });
    celda(3, f.pvp, EUROS, { color: { argb: "FF" + (k.revisarPrecio.length ? AMBAR : AZUL) }, bold: k.revisarPrecio.length > 0 }, k.revisarPrecio.length ? AMBAR_FONDO : undefined);
    celda(4, k.limite ?? "-", k.limite != null ? EUROS : undefined, { color: { argb: "FF6A9BD0" } });
    celda(5, f.precio, EUROS, { bold: true, color: { argb: "FF" + (k.bajoMinimoMio ? PASADO : AZUL) } }, k.bajoMinimoMio ? PASADO_FONDO : undefined);
    cols.forEach((c, j) => {
      const p = f.precios[c.id], kc = k.comp[c.id];
      if (!p || !kc) { celda(6 + j * 2, "-", undefined, { color: { argb: "FFC4C9D0" } }); celda(7 + j * 2, "-", undefined, { color: { argb: "FFC4C9D0" } }); return; }
      const avisoPvp = kc.pvpSinActualizar || kc.pvpMasAlto;
      celda(6 + j * 2, kc.suPvp, EUROS, { color: { argb: "FF" + (avisoPvp ? AMBAR : hex(c.color)) }, bold: avisoPvp }, avisoPvp ? AMBAR_FONDO : undefined);
      const pc = celda(7 + j * 2, { text: `${eur(p.precio)}${p.por !== "ean" && p.por !== "manual" ? " ≈" : ""}`, hyperlink: p.url }, undefined,
        { bold: true, color: { argb: "FF" + (kc.bajoMinimo ? BAJO : hex(c.color)) } }, kc.bajoMinimo ? BAJO_FONDO : undefined);
      pc.alignment = { vertical: "middle", horizontal: "right" };
    });
    const mbColor = !k.mb || k.masBarato === "Igual" ? SUAVE : k.diferencia != null && k.diferencia < -0.005 ? k.empatados.length > 1 ? TEXTO : hex(COMPETIDORES.find(c => c.id === k.mb!.id)!.color) : AZUL;
    celda(fin, k.masBarato, undefined, { bold: true, color: { argb: "FF" + mbColor } });
    celda(fin + 1, k.diferencia ?? "-", k.diferencia != null ? EUROS_SIGNO : undefined, { bold: true, color: { argb: "FF" + (k.diferencia == null ? SUAVE : k.diferencia < -0.005 ? ROJO : k.diferencia > 0.005 ? VERDE : TEXTO) } });
    celda(fin + 2, k.bajoAutorizado ?? "-", k.bajoAutorizado != null ? EUROS : undefined, { bold: k.bajoAutorizado != null, color: { argb: "FF" + (k.bajoAutorizado != null ? BAJO : SUAVE) } }, k.bajoAutorizado != null ? BAJO_FONDO : undefined);
    celda(fin + 3, k.igualar, undefined, { bold: k.igualar.startsWith("No"), color: { argb: "FF" + (k.igualar.startsWith("No") ? ROJO : VERDE) } });
    celda(fin + 4, avisos(f, k).join(" · "), undefined, { color: { argb: "FF" + AMBAR } });
  });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + filas.length, column: nCols } };
  const buf = await wb.xlsx.writeBuffer();
  bajar(new Blob([buf], { type: XLSX }), `${limpio(marca)}_COMPETENCIA_${fechaArchivo(fecha)}.xlsx`);
}

// ── Informe de la marca en PDF ─────────────────────────────────────────
export async function descargarPdf(marca: string, filasIn: FilaComp[], _estados: Record<string, EstadoComp>, descuento: number | null, cupon: CuponComp, fecha = new Date()) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const filas = ordenar(filasIn);
  const calc = filas.map(f => calcularFila(f, descuento));
  const cols = COMPETIDORES.filter(c => filas.some(f => f.precios[c.id]));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const M = 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...rgb(AZUL));
  doc.text(`Comparativa de precios con la competencia · ${marca}`, M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...rgb(SUAVE));
  doc.text(`La Tienda de Cosméticos frente a ${cols.map(c => c.nombre).join(", ")} · ${fechaCorta(fecha)}` + (cupon ? ` · Cosméticos24h con su cupón de carrito del ${num(cupon.pct)} %` : "") + " · ~ = emparejado por nombre", M, 19.5);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...rgb(TEXTO));
  doc.text(resumen(filas, calc, descuento).replace(/−/g, "-"), M, 25);

  const cabC = (t: string, color: string) => ({ content: t, styles: { fillColor: rgb(color) } });
  const fin = 5 + cols.length * 2;
  const cuerpo = filas.map((f, i) => {
    const k = calc[i];
    return [
      f.ean ?? "",
      [f.nombre, ...avisos(f, k).map(a => a.toUpperCase())].join("\n"),
      eur(f.pvp) + (k.revisarPrecio.length ? "\n(revisar precio)" : ""),
      k.limite != null ? eur(k.limite) : "-",
      k.miDto > 0.0005 ? `${eur(f.precio)}\n-${pctTexto(k.miDto)}` : eur(f.precio),
      ...cols.flatMap(c => {
        const p = f.precios[c.id], kc = k.comp[c.id];
        if (!p || !kc) return ["-", "-"];
        return [eur(kc.suPvp) + (kc.pvpSinActualizar ? "\nsin actualizar" : ""), `${eur(p.precio)}${p.por !== "ean" && p.por !== "manual" ? " ~" : ""}` + (kc.dto > 0.0005 ? `\n-${pctTexto(kc.dto)}` : "")];
      }),
      k.masBarato,
      k.diferencia == null ? "-" : `${k.diferencia > 0.005 ? "+" : ""}${eur(k.diferencia)}`,
      k.bajoAutorizado != null ? eur(k.bajoAutorizado) : "-",
      k.igualar.replace(/−/g, "-"),
    ];
  });
  const anchoComp = Math.max(11, Math.min(15, 110 / Math.max(cols.length * 2, 1)));
  const columnStyles: Record<number, object> = {
    0: { cellWidth: 17, halign: "left", textColor: rgb(SUAVE) }, 1: { cellWidth: 52, halign: "left" },
    2: { cellWidth: 13, textColor: rgb(AZUL) }, 3: { cellWidth: 13, textColor: [106, 155, 208] }, 4: { cellWidth: 14, textColor: rgb(AZUL), fontStyle: "bold" },
    [fin]: { cellWidth: 18, halign: "left", fontStyle: "bold" }, [fin + 1]: { cellWidth: 14, fontStyle: "bold" }, [fin + 2]: { cellWidth: 14 }, [fin + 3]: { halign: "left" },
  };
  cols.forEach((c, j) => { columnStyles[5 + j * 2] = { cellWidth: anchoComp, textColor: rgb(c.color) }; columnStyles[6 + j * 2] = { cellWidth: anchoComp, textColor: rgb(c.color), fontStyle: "bold" }; });
  autoTable(doc, {
    startY: 29, margin: { left: M, right: M }, theme: "plain",
    styles: { font: "helvetica", fontSize: 6.3, textColor: rgb(TEXTO), cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 1 }, valign: "middle", halign: "right", lineColor: rgb(LINEA) },
    headStyles: { fontStyle: "bold", fontSize: 5.8, textColor: [255, 255, 255], halign: "center", valign: "middle" },
    head: [
      [
        { content: "", colSpan: 2, styles: { fillColor: [255, 255, 255] } },
        { content: "LA TIENDA DE COSMÉTICOS", colSpan: 3, styles: { fillColor: rgb(FONDO_NOS), textColor: rgb(AZUL) } },
        ...cols.map(c => ({ content: c.nombre.toUpperCase(), colSpan: 2, styles: { fillColor: rgb(c.fondo), textColor: rgb(c.color) } })),
        { content: "COMPARACIÓN", colSpan: 4, styles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] } },
      ],
      [
        cabC("EAN", AZUL), cabC("PRODUCTO", AZUL), cabC("PVP", AZUL), cabC(descuento != null ? `CON DTO. AUT.\n(-${num(descuento)} %)` : "CON DTO. AUT.", AZUL), cabC("PRECIO FINAL", AZUL),
        ...cols.flatMap(c => [cabC("PVP", c.color), cabC(cabeceraCupon(c, cupon), c.color)]),
        cabC("MÁS BARATO", "374151"), cabC("DIFERENCIA", "374151"), cabC("BAJO DTO. AUTORIZADO", "374151"), cabC("¿PODEMOS IGUALAR?", "374151"),
      ],
    ],
    body: cuerpo, columnStyles,
    didParseCell: d => {
      if (d.section !== "body") return;
      const i = d.row.index, c = d.column.index, f = filas[i], k = calc[i];
      if (!f || !k) return;
      const s = d.cell.styles;
      s.fillColor = i % 2 ? rgb(CEBRA) : [255, 255, 255];
      s.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
      if (c === 1 && avisos(f, k).length) s.textColor = rgb(TEXTO);
      if (c === 2 && k.revisarPrecio.length) { s.fillColor = rgb(AMBAR_FONDO); s.textColor = rgb(AMBAR); s.fontStyle = "bold"; }
      if (c === 4 && k.bajoMinimoMio) { s.fillColor = rgb(PASADO_FONDO); s.textColor = rgb(PASADO); }
      if (c >= 5 && c < fin) {
        const comp = cols[Math.floor((c - 5) / 2)], kc = k.comp[comp.id];
        if (!kc) { s.textColor = [196, 201, 208]; return; }
        if ((c - 5) % 2 === 0 && (kc.pvpSinActualizar || kc.pvpMasAlto)) { s.fillColor = rgb(AMBAR_FONDO); s.textColor = rgb(AMBAR); s.fontStyle = "bold"; }
        if ((c - 5) % 2 === 1 && kc.bajoMinimo) { s.fillColor = rgb(BAJO_FONDO); s.textColor = rgb(BAJO); }
      }
      if (c === fin) s.textColor = !k.mb || k.masBarato === "Igual" ? rgb(SUAVE) : k.diferencia != null && k.diferencia < -0.005 ? k.empatados.length > 1 ? rgb(TEXTO) : rgb(COMPETIDORES.find(x => x.id === k.mb!.id)!.color) : rgb(AZUL);
      if (c === fin + 1) s.textColor = k.diferencia == null ? rgb(SUAVE) : k.diferencia < -0.005 ? rgb(ROJO) : k.diferencia > 0.005 ? rgb(VERDE) : rgb(TEXTO);
      if (c === fin + 2 && k.bajoAutorizado != null) { s.fillColor = rgb(BAJO_FONDO); s.textColor = rgb(BAJO); s.fontStyle = "bold"; }
      if (c === fin + 3) { s.textColor = k.igualar.startsWith("No") ? rgb(ROJO) : rgb(VERDE); s.fontStyle = k.igualar.startsWith("No") ? "bold" : "normal"; }
    },
    didDrawCell: d => {
      if (d.section !== "body") return;
      const f = filas[d.row.index];
      if (!f) return;
      if (d.column.index === 1) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: f.url });
      const c = d.column.index;
      if (c >= 5 && c < fin && (c - 5) % 2 === 1) {
        const p = f.precios[cols[Math.floor((c - 5) / 2)].id];
        if (p) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: p.url });
      }
    },
  });
  bajar(doc.output("blob"), `${limpio(marca)}_COMPETENCIA_${fechaArchivo(fecha)}_informe.pdf`);
}

const VERDE_MARCA = "15803D"; // PVP de la web oficial de la marca

// Celda de diferencia con signo «+»: ese precio está por encima del de la marca y va en negrita
const porEncima = (v: unknown) => typeof v === "string" && v.includes("\n+");

// Diferencia de un precio con el PVP de referencia, en la misma celda: el % arriba y los € debajo («-40 %» / «-25,78 €»); «=» si es el mismo
const difTexto = (precio: number, base: number) => {
  const d = Math.round((precio - base) * 100) / 100;
  const s = d > 0 ? "+" : d < 0 ? "-" : "";
  if (d === 0) return "=";
  // Un céntimo ya no es igual: si el % redondeado da 0, se muestra con dos decimales
  const frac = base > 0 ? Math.abs(d) / base : 0;
  const pct = pctTexto(frac) === "0 %" ? `${(Math.round(frac * 10000) / 100 || 0.01).toFixed(2).replace(".", ",")} %` : pctTexto(frac);
  return `${s}${pct}\n${s}${eur(Math.abs(d))}`;
};

// ── «Para la marca» ────────────────────────────────────────────────────
export type FilaParaMarca = {
  ean: string; producto: string; tienda: string; color: string; url: string; pvp: number; minimo: number; suPrecio: number; dtoSobrePvp: number; porDebajo: number;
  miUrl: string;                                  // nuestra ficha
  marca?: { url: string; precio: number };        // el producto en la web oficial de la marca, si la tiene
};

// Cada precio de la competencia por debajo de nuestro PVP con el dto. autorizado (sin dto. autorizado, por debajo del PVP)
export function filasParaMarca(filas: FilaComp[], descuento: number): FilaParaMarca[] {
  const out: FilaParaMarca[] = [];
  for (const f of filas) {
    const pvp = f.pvp || f.precio;
    const minimo = Math.round(pvp * (1 - descuento / 100) * 100) / 100;
    // La web oficial de la marca no entra como tienda (el informe es para la marca), pero se enlaza en cada fila
    const oficial = COMPETIDORES.filter(c => c.marca).map(c => f.precios[c.id]).find(Boolean);
    for (const c of COMPETIDORES.filter(c => !c.marca)) {
      const p = f.precios[c.id];
      if (!p || p.precio >= minimo - 0.005) continue;
      out.push({ ean: f.ean ?? "", producto: f.nombre, tienda: c.nombre, color: c.color, url: p.url, pvp, minimo, suPrecio: p.precio, dtoSobrePvp: pvp > 0 ? 1 - p.precio / pvp : 0, porDebajo: Math.round((minimo - p.precio) * 100) / 100,
        miUrl: f.url, marca: oficial ? { url: oficial.url, precio: oficial.precio } : undefined });
    }
  }
  return out.sort((a, b) => b.dtoSobrePvp - a.dtoSobrePvp);
}

// Tabla del informe «Para la marca», como el PDF interno: una fila por producto con algún precio por debajo,
// y por bloques: la web oficial de la marca (solo su PVP), nosotros y las tiendas que venden por debajo
type TablaParaMarca = {
  // base: PVP con el que se compara cada tienda (el de la web oficial de la marca; si no lo tiene, nuestro PVP)
  productos: { f: FilaComp; pvp: number; base: number; minimo: number; peor: { c: Competidor; precio: number } }[];
  oficial?: Competidor;
  comps: Competidor[];
};
function tablaParaMarca(filas: FilaComp[], descuento: number): TablaParaMarca {
  const tiendas = COMPETIDORES.filter(c => !c.marca);
  const productos: TablaParaMarca["productos"] = [];
  for (const f of filas) {
    const pvp = f.pvp || f.precio;
    const minimo = Math.round(pvp * (1 - descuento / 100) * 100) / 100;
    const bajo = tiendas.filter(c => f.precios[c.id] && f.precios[c.id].precio < minimo - 0.005);
    if (!bajo.length) continue;
    const c = bajo.reduce((a, b) => (f.precios[b.id].precio < f.precios[a.id].precio ? b : a));
    const ofi = COMPETIDORES.filter(o => o.marca).map(o => f.precios[o.id]).find(Boolean);
    productos.push({ f, pvp, base: ofi ? ofi.precio : pvp, minimo, peor: { c, precio: f.precios[c.id].precio } });
  }
  productos.sort((a, b) => (1 - b.peor.precio / b.pvp) - (1 - a.peor.precio / a.pvp));
  const oficial = COMPETIDORES.find(c => c.marca && productos.some(x => x.f.precios[c.id]));
  const comps = tiendas.filter(c => productos.some(x => x.f.precios[c.id] && x.f.precios[c.id].precio < x.minimo - 0.005));
  return { productos, oficial, comps };
}

// Hoja de Excel del informe «Para la marca» (también una por marca en el Excel de todas)
function hojaParaMarca(ws: ExcelJS.Worksheet, marca: string, t: TablaParaMarca, descuento: number, fecha: Date) {
  ws.views = [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 5 }];
  const que = descuento > 0 ? `nuestro PVP con el descuento autorizado (-${num(descuento)} %)` : "el PVP";
  const nDif = t.oficial ? 1 : 0; // nuestra diferencia con el PVP de la marca
  // Con web oficial, de nosotros solo el precio final y su diferencia con la marca; sin ella, PVP, PVP con dto. y precio final
  const nNos = t.oficial ? 2 : (descuento > 0 ? 3 : 2);
  const nOf = t.oficial ? 1 : 0;
  const total = 2 + nOf + nNos + t.comps.length * 2 + 2;
  ws.mergeCells(1, 1, 1, total); ws.getCell("A1").value = `${marca} · precios de la competencia por debajo de ${descuento > 0 ? "lo autorizado" : "PVP"}`; ws.getCell("A1").font = { name: "Calibri", size: 15, bold: true, color: { argb: "FF" + AZUL } };
  ws.mergeCells(2, 1, 2, total); ws.getCell("A2").value = `Tiendas online que venden por debajo ${que.startsWith("el ") ? "del " + que.slice(3) : "de " + que} · ${fechaCorta(fecha)} · Pulsa un precio o un producto para abrir su ficha`; ws.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: "FF" + SUAVE } };
  const relleno = (c: ExcelJS.Cell, color: string) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex(color) } }; };
  // Fila 4: bloques; fila 5: columnas
  const grupos: { titulo: string; n: number; color: string; fondo: string }[] = [
    { titulo: "", n: 2, color: AZUL, fondo: "FFFFFF" },
    ...(t.oficial ? [{ titulo: `${marca.toUpperCase()} · WEB OFICIAL`, n: 1, color: VERDE_MARCA, fondo: "E6F4EA" }] : []),
    { titulo: "LA TIENDA DE COSMÉTICOS", n: nNos, color: AZUL, fondo: FONDO_NOS },
    ...t.comps.map(c => ({ titulo: c.nombre.toUpperCase(), n: 2, color: c.color, fondo: c.fondo })),
    { titulo: "COMPARACIÓN", n: 2, color: "374151", fondo: "F3F4F6" },
  ];
  let col = 1;
  const cab: { t: string; color: string }[] = [];
  for (const g of grupos) {
    if (g.n > 1) ws.mergeCells(4, col, 4, col + g.n - 1);
    const c = ws.getCell(4, col);
    c.value = g.titulo; c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF" + hex(g.color) } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    relleno(c, g.fondo);
    col += g.n;
  }
  cab.push({ t: "EAN", color: AZUL }, { t: "PRODUCTO", color: AZUL });
  if (t.oficial) cab.push({ t: "PVP", color: VERDE_MARCA });
  if (t.oficial) cab.push({ t: "PRECIO", color: AZUL }, { t: `DIF. CON PVP ${marca.toUpperCase()}`, color: AZUL });
  else cab.push({ t: "PVP", color: AZUL }, ...(descuento > 0 ? [{ t: `PVP -${num(descuento)} %`, color: AZUL }] : []), { t: "PRECIO FINAL", color: AZUL });
  const tDif = t.oficial ? `DIF. CON PVP ${marca.toUpperCase()}` : "DIF. CON PVP";
  for (const c of t.comps) cab.push({ t: "SU PRECIO", color: c.color }, { t: tDif, color: c.color });
  cab.push({ t: "MÁS BARATO", color: "374151" }, { t: "POR DEBAJO", color: "374151" });
  const fc = ws.getRow(5);
  cab.forEach((x, i) => { const c = fc.getCell(i + 1); c.value = x.t; c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } }; relleno(c, x.color); c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
  ws.getRow(4).height = 22; fc.height = 28;
  [15, 50, ...(t.oficial ? [12] : []), ...(t.oficial ? [12, 18] : [11, ...(descuento > 0 ? [12] : []), 12]), ...t.comps.flatMap(() => [12, 18]), 18, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  t.productos.forEach((x, i) => {
    const row = ws.getRow(6 + i);
    const { f } = x;
    const ofi = t.oficial ? f.precios[t.oficial.id] : undefined;
    const valores: ExcelJS.CellValue[] = [f.ean ?? "", { text: f.nombre, hyperlink: f.url }];
    if (t.oficial) valores.push(ofi ? { text: eur(ofi.precio), hyperlink: ofi.url } : "-");
    if (t.oficial) valores.push({ text: eur(f.precio), hyperlink: f.url }, difTexto(f.precio, x.base));
    else valores.push(x.pvp, ...(descuento > 0 ? [x.minimo] : []), { text: eur(f.precio), hyperlink: f.url });
    for (const c of t.comps) {
      const p = f.precios[c.id];
      valores.push(p ? { text: eur(p.precio), hyperlink: p.url } : "-", p ? difTexto(p.precio, x.base) : "-");
    }
    valores.push(x.peor.c.nombre, -Math.round((x.base - x.peor.precio) * 100) / 100);
    row.values = valores;
    row.height = 28; // la diferencia va en dos líneas (% y €)
    const iOf = t.oficial ? 3 : 0, iNos = 3 + nOf, iComp = iNos + nNos, iFin = iComp + t.comps.length * 2;
    row.eachCell({ includeEmpty: true }, (c, n) => {
      let color = TEXTO, bold = false, fondo: string | null = i % 2 ? CEBRA : null;
      if (n === 1) color = SUAVE;
      if (n === 2) color = AZUL;
      if (n === iOf) { color = VERDE_MARCA; bold = true; }
      if (n >= iNos && n < iComp) { color = AZUL; bold = n === iComp - 1 - nDif; }
      if (n >= iComp && n < iFin) {
        const comp = t.comps[Math.floor((n - iComp) / 2)];
        const p = f.precios[comp.id];
        color = comp.color; bold = (n - iComp) % 2 === 0;
        if (!p) color = "C4C9D0";
      }
      if (n === iFin) { color = x.peor.c.color; bold = true; }
      if (n === iFin + 1) { color = BAJO; bold = true; }
      if (porEncima(c.value)) bold = true; // más caro que la marca: en negrita
      c.font = { name: "Calibri", size: 10, color: { argb: "FF" + hex(color) }, bold, underline: typeof c.value === "object" && c.value != null };
      if (fondo) relleno(c, fondo);
      if (typeof c.value === "number") c.numFmt = EUROS;
      c.alignment = { vertical: "middle", horizontal: n <= 2 || n === iFin ? "left" : "right", wrapText: n === 2 || typeof c.value === "string" && c.value.includes("\n") };
      c.border = { bottom: { style: "thin", color: { argb: "FF" + LINEA } } };
    });
  });
}

export async function descargarParaMarca(marca: string, filas: FilaComp[], descuento: number, formato: "pdf" | "excel", fecha = new Date()) {
  const t = tablaParaMarca(filas, descuento);
  const titulo = `${marca} · precios de la competencia por debajo de ${descuento > 0 ? "lo autorizado" : "PVP"}`;
  const que = descuento > 0 ? `nuestro PVP con el descuento autorizado (-${num(descuento)} %)` : "el PVP";
  const nombre = `${limpio(marca)}_COMPETENCIA_bajo_${descuento > 0 ? "dto_autorizado" : "PVP"}_${fechaArchivo(fecha)}`;

  if (formato === "excel") {
    const { default: Excel } = await import("exceljs");
    const wb = new Excel.Workbook();
    hojaParaMarca(wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Marca"), marca, t, descuento, fecha);
    bajar(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }), `${nombre}.xlsx`);
    return;
  }

  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const M = 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...rgb(AZUL)); doc.text(titulo, M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...rgb(SUAVE));
  doc.text(`Tiendas online que venden por debajo ${que.startsWith("el ") ? "del " + que.slice(3) : "de " + que} · ${fechaCorta(fecha)} · Pulsa un precio o un producto para abrir su ficha`, M, 19.5);
  const nOf = t.oficial ? 1 : 0, nNos = t.oficial ? 2 : (descuento > 0 ? 3 : 2); // con web oficial: nuestro precio y su diferencia con la marca
  const iNos = 2 + nOf, iComp = iNos + nNos, iFin = iComp + t.comps.length * 2;
  const cabC = (txt: string, color: string) => ({ content: txt, styles: { fillColor: rgb(color) } });
  const cuerpo = t.productos.map(x => {
    const { f } = x;
    const ofi = t.oficial ? f.precios[t.oficial.id] : undefined;
    return [
      f.ean ?? "", f.nombre,
      ...(t.oficial ? [ofi ? eur(ofi.precio) : "-"] : []),
      ...(t.oficial ? [eur(f.precio), difTexto(f.precio, x.base)] : [eur(x.pvp), ...(descuento > 0 ? [eur(x.minimo)] : []), eur(f.precio)]),
      ...t.comps.flatMap(c => { const p = f.precios[c.id]; return p ? [eur(p.precio), difTexto(p.precio, x.base)] : ["-", "-"]; }),
      x.peor.c.corto, eur(-Math.round((x.base - x.peor.precio) * 100) / 100),
    ];
  });
  // Lo que queda del ancho de la página se reparte entre las tiendas: su precio y, algo más ancha, la diferencia
  const libre = 281 - 19 - 58 - 20 - 15 - (t.oficial ? 15 : 0) - nNos * 14 - (t.oficial ? 4 : 0);
  const ancho = Math.max(11, Math.min(15, libre / Math.max(t.comps.length * 2.6, 1)));
  const columnStyles: Record<number, object> = {
    0: { cellWidth: 19, halign: "left", textColor: rgb(SUAVE) }, 1: { cellWidth: 58, halign: "left", textColor: rgb(AZUL) },
    [iFin]: { cellWidth: 20, halign: "left", fontStyle: "bold" }, [iFin + 1]: { cellWidth: 15, textColor: rgb(BAJO), fontStyle: "bold" },
  };
  if (t.oficial) columnStyles[2] = { cellWidth: 15, textColor: rgb(VERDE_MARCA), fontStyle: "bold" };
  for (let k = iNos; k < iComp; k++) columnStyles[k] = { cellWidth: t.oficial && k === iComp - 1 ? 18 : 14, textColor: rgb(AZUL), fontStyle: k === iComp - 1 - nOf ? "bold" : "normal" };
  t.comps.forEach((c, j) => { columnStyles[iComp + j * 2] = { cellWidth: ancho, textColor: rgb(c.color), fontStyle: "bold" }; columnStyles[iComp + j * 2 + 1] = { cellWidth: ancho * 1.6, textColor: rgb(c.color) }; });
  autoTable(doc, {
    startY: 24, margin: { left: M, right: M }, theme: "plain",
    styles: { font: "helvetica", fontSize: 6.8, textColor: rgb(TEXTO), cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 }, valign: "middle", halign: "right", lineColor: rgb(LINEA) },
    headStyles: { fontStyle: "bold", fontSize: 6, textColor: [255, 255, 255], halign: "center", valign: "middle" },
    head: [
      [
        { content: "", colSpan: 2, styles: { fillColor: [255, 255, 255] } },
        ...(t.oficial ? [{ content: `${marca.toUpperCase()}\nWEB OFICIAL`, colSpan: 1, styles: { fillColor: rgb("E6F4EA"), textColor: rgb(VERDE_MARCA) } }] : []),
        { content: "LA TIENDA DE COSMÉTICOS", colSpan: nNos, styles: { fillColor: rgb(FONDO_NOS), textColor: rgb(AZUL) } },
        ...t.comps.map(c => ({ content: c.nombre.toUpperCase(), colSpan: 2, styles: { fillColor: rgb(c.fondo), textColor: rgb(c.color) } })),
        { content: "COMPARACIÓN", colSpan: 2, styles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] } },
      ],
      [
        cabC("EAN", AZUL), cabC("PRODUCTO", AZUL),
        ...(t.oficial ? [cabC("PVP", VERDE_MARCA)] : []),
        ...(t.oficial ? [cabC("PRECIO", AZUL), cabC(`DIF. CON PVP\n${marca.toUpperCase()}`, AZUL)] : [cabC("PVP", AZUL), ...(descuento > 0 ? [cabC(`PVP -${num(descuento)} %`, AZUL)] : []), cabC("PRECIO FINAL", AZUL)]),
        ...t.comps.flatMap(c => [cabC("SU PRECIO", c.color), cabC(t.oficial ? `DIF. CON PVP\n${marca.toUpperCase()}` : "DIF. CON PVP", c.color)]),
        cabC("MÁS BARATO", "374151"), cabC("POR DEBAJO", "374151"),
      ],
    ],
    body: cuerpo, columnStyles,
    didParseCell: d => {
      if (d.section !== "body") return;
      const x = t.productos[d.row.index], c = d.column.index;
      if (!x) return;
      const s = d.cell.styles;
      s.fillColor = d.row.index % 2 ? rgb(CEBRA) : [255, 255, 255];
      s.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
      if (c >= iComp && c < iFin) {
        const comp = t.comps[Math.floor((c - iComp) / 2)], p = x.f.precios[comp.id];
        if (!p) { s.textColor = [196, 201, 208]; return; }
      }
      if (c === iFin) s.textColor = rgb(x.peor.c.color);
      if (porEncima(d.cell.raw)) s.fontStyle = "bold";
    },
    didDrawCell: d => {
      if (d.section !== "body") return;
      const x = t.productos[d.row.index], c = d.column.index;
      if (!x) return;
      if (c === 1 || c === iComp - 1 - nOf) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: x.f.url });
      if (t.oficial && c === 2) { const o = x.f.precios[t.oficial.id]; if (o) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: o.url }); }
      if (c >= iComp && c < iFin && (c - iComp) % 2 === 0) {
        const p = x.f.precios[t.comps[(c - iComp) / 2].id];
        if (p) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: p.url });
      }
    },
  });
  bajar(doc.output("blob"), `${nombre}.pdf`);
}

export async function descargarParaTodas(marcas: { nombre: string; filas: FilaComp[]; descuento: number }[], fecha = new Date()) {
  const conProblemas = marcas.map(m => ({ ...m, lista: filasParaMarca(m.filas, m.descuento) })).filter(m => m.lista.length > 0)
    .sort((a, b) => b.lista.length - a.lista.length || a.nombre.localeCompare(b.nombre));
  if (!conProblemas.length) throw new Error("Ninguna marca revisada tiene precios de la competencia por debajo de lo autorizado");
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  const cabecera = (ws: import("exceljs").Worksheet, fila: number, titulos: string[]) => {
    const cab = ws.getRow(fila);
    titulos.forEach((t, i) => { const c = cab.getCell(i + 1); c.value = t; c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + AZUL } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    cab.height = 28;
  };
  const nombresHoja = new Set<string>();
  const hojaDe = (marca: string) => {
    let base = marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Marca", n = base, i = 2;
    while (nombresHoja.has(n.toLowerCase()) || n.toLowerCase() === "resumen") n = `${base} ${i++}`;
    nombresHoja.add(n.toLowerCase());
    return n;
  };

  // Resumen
  const rs = wb.addWorksheet("Resumen");
  rs.views = [{ showGridLines: false }];
  rs.mergeCells("A1:E1"); rs.getCell("A1").value = "Marcas con precios de la competencia por debajo de lo autorizado"; rs.getCell("A1").font = { name: "Calibri", size: 15, bold: true, color: { argb: "FF" + AZUL } };
  rs.mergeCells("A2:E2"); rs.getCell("A2").value = `Tiendas online que venden por debajo de nuestro PVP con el descuento autorizado de cada marca (o del PVP si no tiene) · ${fechaCorta(fecha)}`; rs.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: "FF" + SUAVE } };
  cabecera(rs, 4, ["MARCA", "DTO. AUTORIZADO", "PRECIOS POR DEBAJO", "TIENDAS", "MAYOR DTO. SOBRE PVP"]);
  [32, 16, 18, 50, 20].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  const hojas = conProblemas.map(m => hojaDe(m.nombre));
  conProblemas.forEach((m, i) => {
    const row = rs.getRow(5 + i);
    const tiendas = [...new Set(m.lista.map(x => x.tienda))].join(", ");
    row.values = [{ text: m.nombre, hyperlink: `#'${hojas[i]}'!A1` }, m.descuento > 0 ? m.descuento / 100 : "sin límite", m.lista.length, tiendas, Math.max(...m.lista.map(x => x.dtoSobrePvp))];
    row.eachCell((c, n) => {
      c.font = { name: "Calibri", size: 10, color: { argb: "FF" + (n === 1 ? AZUL : n === 3 ? BAJO : TEXTO) }, bold: n === 1 || n === 3, underline: n === 1 };
      if (n === 2 && typeof c.value === "number") c.numFmt = PORC;
      if (n === 5) c.numFmt = PORC;
      c.alignment = { vertical: "middle", horizontal: n === 1 || n === 4 ? "left" : "right", wrapText: n === 4 };
      c.border = { bottom: { style: "thin", color: { argb: "FF" + LINEA } } };
    });
  });

  // Una hoja por marca, como el informe «Para la marca»
  conProblemas.forEach((m, k) => hojaParaMarca(wb.addWorksheet(hojas[k]), m.nombre, tablaParaMarca(m.filas, m.descuento), m.descuento, fecha));
  bajar(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }), `COMPETENCIA_marcas_bajo_dto_autorizado_${fechaArchivo(fecha)}.xlsx`);
  return conProblemas.length;
}
