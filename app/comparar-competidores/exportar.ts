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

// ── Informe de la marca en Excel ───────────────────────────────────────
export async function descargarExcel(marca: string, filasIn: FilaComp[], _estados: Record<string, EstadoComp>, descuento: number | null, cupon: CuponComp, fecha = new Date()) {
  const { default: Excel } = await import("exceljs");
  const filas = ordenar(filasIn);
  const calc = filas.map(f => calcularFila(f, descuento));
  const cols = columnasDe(filas, {});
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
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
      const pc = celda(7 + j * 2, { text: `${eur(p.precio)}${p.por !== "ean" ? " ≈" : ""}`, hyperlink: p.url }, undefined,
        { bold: true, color: { argb: "FF" + (kc.bajoMinimo ? BAJO : hex(c.color)) } }, kc.bajoMinimo ? BAJO_FONDO : undefined);
      pc.alignment = { vertical: "middle", horizontal: "right" };
    });
    const mbColor = !k.mb ? SUAVE : k.diferencia != null && k.diferencia < -0.005 ? hex(COMPETIDORES.find(c => c.id === k.mb!.id)!.color) : AZUL;
    celda(fin, k.masBarato, undefined, { bold: true, color: { argb: "FF" + mbColor } });
    celda(fin + 1, k.diferencia ?? "-", k.diferencia != null ? EUROS_SIGNO : undefined, { bold: true, color: { argb: "FF" + (k.diferencia == null ? SUAVE : k.diferencia < -0.005 ? ROJO : VERDE) } });
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
        return [eur(kc.suPvp) + (kc.pvpSinActualizar ? "\nsin actualizar" : ""), `${eur(p.precio)}${p.por !== "ean" ? " ~" : ""}` + (kc.dto > 0.0005 ? `\n-${pctTexto(kc.dto)}` : "")];
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
      if (c === fin) s.textColor = !k.mb ? rgb(SUAVE) : k.diferencia != null && k.diferencia < -0.005 ? rgb(COMPETIDORES.find(x => x.id === k.mb!.id)!.color) : rgb(AZUL);
      if (c === fin + 1) s.textColor = k.diferencia == null ? rgb(SUAVE) : k.diferencia < -0.005 ? rgb(ROJO) : rgb(VERDE);
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

// ── «Para la marca» ────────────────────────────────────────────────────
export type FilaParaMarca = { ean: string; producto: string; tienda: string; color: string; url: string; pvp: number; minimo: number; suPrecio: number; dtoSobrePvp: number; porDebajo: number };

// Cada precio de la competencia por debajo de nuestro PVP con el dto. autorizado (sin dto. autorizado, por debajo del PVP)
export function filasParaMarca(filas: FilaComp[], descuento: number): FilaParaMarca[] {
  const out: FilaParaMarca[] = [];
  for (const f of filas) {
    const pvp = f.pvp || f.precio;
    const minimo = Math.round(pvp * (1 - descuento / 100) * 100) / 100;
    for (const c of COMPETIDORES) {
      const p = f.precios[c.id];
      if (!p || p.precio >= minimo - 0.005) continue;
      out.push({ ean: f.ean ?? "", producto: f.nombre, tienda: c.nombre, color: c.color, url: p.url, pvp, minimo, suPrecio: p.precio, dtoSobrePvp: pvp > 0 ? 1 - p.precio / pvp : 0, porDebajo: Math.round((minimo - p.precio) * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.dtoSobrePvp - a.dtoSobrePvp);
}

export async function descargarParaMarca(marca: string, filas: FilaComp[], descuento: number, formato: "pdf" | "excel", fecha = new Date()) {
  const lista = filasParaMarca(filas, descuento);
  const que = descuento > 0 ? `nuestro PVP con el descuento autorizado (-${num(descuento)} %)` : "el PVP";
  const titulo = `${marca} · precios de la competencia por debajo de ${descuento > 0 ? "lo autorizado" : "PVP"}`;
  const sub = `Tiendas online que venden por debajo de ${que} · ${fechaCorta(fecha)}`;
  const nombre = `${limpio(marca)}_COMPETENCIA_bajo_${descuento > 0 ? "dto_autorizado" : "PVP"}_${fechaArchivo(fecha)}`;
  const titulos = ["EAN", "PRODUCTO", "TIENDA", "PVP", descuento > 0 ? `PVP -${num(descuento)} %` : "MÍNIMO", "SU PRECIO", "DTO. SOBRE PVP", "POR DEBAJO"];

  if (formato === "excel") {
    const { default: Excel } = await import("exceljs");
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet(marca.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    ws.views = [{ showGridLines: false }];
    ws.mergeCells("A1:H1"); ws.getCell("A1").value = titulo; ws.getCell("A1").font = { name: "Calibri", size: 15, bold: true, color: { argb: "FF" + AZUL } };
    ws.mergeCells("A2:H2"); ws.getCell("A2").value = sub; ws.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: "FF" + SUAVE } };
    const cab = ws.getRow(4);
    titulos.forEach((t, i) => { const c = cab.getCell(i + 1); c.value = t; c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + AZUL } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    cab.height = 28;
    [15, 50, 18, 11, 12, 14, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    lista.forEach((x, i) => {
      const row = ws.getRow(5 + i);
      row.values = [x.ean, x.producto, x.tienda, x.pvp, x.minimo, { text: eur(x.suPrecio), hyperlink: x.url }, x.dtoSobrePvp, x.porDebajo];
      row.eachCell((c, n) => {
        c.font = { name: "Calibri", size: 10, color: { argb: "FF" + (n === 3 || n === 6 ? hex(x.color) : n === 8 ? BAJO : TEXTO) }, bold: n >= 6 };
        if (n === 4 || n === 5 || n === 8) c.numFmt = EUROS;
        if (n === 7) c.numFmt = PORC;
        c.alignment = { vertical: "middle", horizontal: n <= 3 ? "left" : "right", wrapText: n === 2 };
        c.border = { bottom: { style: "thin", color: { argb: "FF" + LINEA } } };
      });
    });
    bajar(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX }), `${nombre}.xlsx`);
    return;
  }
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...rgb(AZUL)); doc.text(titulo, 10, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...rgb(SUAVE)); doc.text(sub, 10, 21);
  autoTable(doc, {
    startY: 26, margin: { left: 10, right: 10 }, theme: "plain",
    styles: { font: "helvetica", fontSize: 8, textColor: rgb(TEXTO), halign: "right", valign: "middle", cellPadding: 1.6 },
    headStyles: { fillColor: rgb(AZUL), textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 7.5 },
    head: [titulos],
    body: lista.map(x => [x.ean, x.producto, x.tienda, eur(x.pvp), eur(x.minimo), eur(x.suPrecio), `-${pctTexto(x.dtoSobrePvp)}`, eur(x.porDebajo)]),
    columnStyles: { 0: { cellWidth: 26, halign: "left", textColor: rgb(SUAVE) }, 1: { halign: "left" }, 2: { cellWidth: 30, halign: "left", fontStyle: "bold" }, 3: { cellWidth: 20 }, 4: { cellWidth: 22 }, 5: { cellWidth: 22, fontStyle: "bold" }, 6: { cellWidth: 22 }, 7: { cellWidth: 22, textColor: rgb(BAJO), fontStyle: "bold" } },
    didParseCell: d => {
      if (d.section !== "body") return;
      const x = lista[d.row.index];
      d.cell.styles.fillColor = d.row.index % 2 ? rgb(CEBRA) : [255, 255, 255];
      d.cell.styles.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
      d.cell.styles.lineColor = rgb(LINEA);
      if (x && (d.column.index === 2 || d.column.index === 5)) d.cell.styles.textColor = rgb(x.color);
    },
    didDrawCell: d => {
      if (d.section === "body" && d.column.index === 5 && lista[d.row.index]) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: lista[d.row.index].url });
    },
  });
  bajar(doc.output("blob"), `${nombre}.pdf`);
}
