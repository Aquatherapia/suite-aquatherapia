// PDF por marca con el mismo diseño que la tabla de la web y el Excel:
// mismas columnas, cálculos (calcularFila) y colores. A4 apaisado, para descargar o enviar.
import { calcularFila, explicaDtoMax, type CuponExcel, type FilaExcel, type SoloEllosExcel } from "./excel";

type RGB = [number, number, number];
const AZUL: RGB = [18, 112, 182];
const ROSA: RGB = [181, 101, 95];
const FONDO_NOSOTROS: RGB = [232, 241, 249];
const FONDO_ELLOS: RGB = [251, 238, 236];
const CEBRA: RGB = [248, 250, 252];
const LINEA: RGB = [229, 231, 235];
const TEXTO: RGB = [31, 41, 51];
const TEXTO_SUAVE: RGB = [107, 114, 128];
const ROJO: RGB = [180, 35, 24];
const ROJO_FONDO: RGB = [253, 236, 236];
const MORADO: RGB = [107, 63, 181];
const MORADO_FONDO: RGB = [241, 235, 251];
const AMBAR: RGB = [180, 83, 9];
const AMBAR_FONDO: RGB = [254, 246, 231];
const VERDE: RGB = [6, 118, 71];

// Las fuentes estándar del PDF no tienen el signo menos tipográfico: se usa el guion
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const pct = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;
const num = (n: number) => String(n).replace(".", ",");

function fechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function nombrePdf(marca: string, fecha = new Date()): string {
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const limpio = marca.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${limpio}_COSMETICOS24H_${dd}-${mm}-${fecha.getFullYear()}_informe.pdf`;
}

// Columna de su precio final con cupón (se quita si no hay cupón)
const COL_CUPON = 8;

export async function construirPdf(marca: string, filas: FilaExcel[], soloEllos: SoloEllosExcel[], descuento: number | null, cupon: CuponExcel, fecha = new Date()): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const M = 10;

  const orden = [...filas].sort((a, b) => b.diff - a.diff);
  const calc = orden.map(f => calcularFila(f, descuento));
  const dto = descuento != null ? `${num(descuento)} %` : "";
  const hayCupon = !!cupon && cupon.pct > 0;
  const cuponTxt = hayCupon ? `${num(cupon!.pct)} %${cupon!.codigo ? ` ${cupon!.codigo}` : ""}` : "";
  const masCaros = orden.filter(f => f.diff > 0.01).length;
  const bajo = calc.filter(k => k.bajoMinimo.suyo).length;
  const pvpDist = calc.filter(k => k.pvpDistinto).length;

  // Título, subtítulo y resumen
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...AZUL);
  doc.text(`Comparativa de precios · ${marca}`, M, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...TEXTO_SUAVE);
  doc.text(`La Tienda de Cosméticos frente a Cosméticos24h · emparejado por EAN · ${fechaCorta(fecha)}` +
    (hayCupon ? ` · su precio final lleva el cupón de carrito del ${cuponTxt}` : ""), M, 21);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...TEXTO);
  doc.text(`${orden.length} productos comparados  ·  ${masCaros} en los que vamos más caros  ·  ` +
    (descuento != null ? `${bajo} que Cosméticos24h vende más barato que nuestro dto. máx. (PVP -${dto})  ·  ` : "") +
    `${pvpDist} con PVP distinto`, M, 27);

  const cab = (t: string, ellos = false) => ({ content: t, styles: { fillColor: ellos ? ROSA : AZUL } });
  const cuerpo: string[][] = orden.map((f, i) => {
      const k = calc[i];
      return [
        f.ean ?? "", [f.nombre, f.descatalogado ? `DESCATALOGADO EN NUESTRA WEB${f.stock != null ? ` (${f.stock} u)` : ""}${f.stock === 0 ? " · SIN STOCK: DESACTIVAR FICHA" : ""}` : ""].filter(Boolean).join("\n"), eur(k.pvp) + (k.revisarPvp ? "\n(revisar precio)" : k.esPack ? "\nsuma de productos" : ""), k.limite != null ? eur(k.limite) : "-", eur(f.miPrecio), pct(k.miDto),
        eur(k.suPvp), k.suDtoWeb > 0.0005 ? `${eur(k.suWeb)}\n-${pct(k.suDtoWeb)}` : eur(k.suWeb), eur(f.suPrecio), pct(k.suDto),
        `${f.diff > 0.005 ? "+" : ""}${eur(f.diff)}${explicaDtoMax(f, k, descuento) ? `\n${explicaDtoMax(f, k, descuento)!.replace(/−/g, "-")}` : ""}`, k.masBarato, k.igualar.replace(/−/g, "-"),
      ].filter((_, c) => hayCupon || c !== COL_CUPON);
    });
  // Sin cupón, su precio final es el mismo que el precio web: esa columna no sale.
  // col() pasa del índice de la tabla al de la tabla completa (con la columna del cupón)
  const col = (c: number) => hayCupon || c < COL_CUPON ? c : c + 1;
  const anchos: Record<number, object> = {
    0: { cellWidth: 18, halign: "left", textColor: TEXTO_SUAVE },
    1: { cellWidth: 64, halign: "left" },
    2: { cellWidth: 15 }, 3: { cellWidth: 15, textColor: TEXTO_SUAVE }, 4: { cellWidth: 15, fontStyle: "bold" }, 5: { cellWidth: 11, textColor: AZUL },
    6: { cellWidth: 15, textColor: ROSA }, 7: { cellWidth: 15, textColor: ROSA }, 8: { cellWidth: 18, textColor: ROSA, fontStyle: "bold" }, 9: { cellWidth: 12, textColor: ROSA, fontStyle: "bold" },
    10: { cellWidth: 19, fontStyle: "bold" }, 11: { cellWidth: 22, halign: "center" },
    12: { halign: "left" },
  };
  const columnStyles = Object.fromEntries(Array.from({ length: hayCupon ? 13 : 12 }, (_, c) => [c, anchos[col(c)]]));
  autoTable(doc, {
    startY: 31,
    margin: { left: M, right: M },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 7, textColor: TEXTO, cellPadding: { top: 1.6, bottom: 1.6, left: 1.2, right: 1.2 }, valign: "middle", halign: "right", lineColor: LINEA },
    headStyles: { fontStyle: "bold", fontSize: 6.5, textColor: [255, 255, 255], halign: "center", valign: "middle" },
    head: [
      [
        { content: "", colSpan: 2, styles: { fillColor: [255, 255, 255] } },
        { content: "NOSOTROS", colSpan: 4, styles: { fillColor: FONDO_NOSOTROS, textColor: AZUL } },
        { content: "COSMÉTICOS24H", colSpan: hayCupon ? 4 : 3, styles: { fillColor: FONDO_ELLOS, textColor: ROSA } },
        { content: "", colSpan: 3, styles: { fillColor: [255, 255, 255] } },
      ],
      [
        cab("EAN"), cab("PRODUCTO"), cab("PVP"), cab(descuento != null ? `CON DTO. MÁX. (-${dto})` : "CON DTO. MÁX."), cab("PRECIO FINAL"), cab("DTO."),
        cab("PVP", true), cab("PRECIO WEB", true),
        ...(hayCupon ? [cab(`PRECIO FINAL (${cupon!.codigo ?? "cupón"} -${num(cupon!.pct)} %${cupon!.directo ? ", DIRECTO EN CARRITO" : ""}${cupon!.hasta ? `, HASTA ${cupon!.hasta.slice(8, 10)}/${cupon!.hasta.slice(5, 7)}` : ""})`, true)] : []),
        cab("DTO. TOTAL", true),
        cab("DIFERENCIA"), cab("MÁS BARATO"), cab("¿PODEMOS IGUALAR?"),
      ],
    ],
    body: cuerpo,
    columnStyles,
    didParseCell: d => {
      if (d.section !== "body") return;
      const i = d.row.index, c = col(d.column.index), f = orden[i], k = calc[i];
      const s = d.cell.styles;
      s.fillColor = i % 2 === 1 ? CEBRA : [255, 255, 255];
      s.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
      // Mismos resaltados que el Excel: precio bajo nuestro mínimo y PVP distinto
      if ((c === 4 || c === 5) && k.bajoMinimo.mio) { if (c === 4) s.fillColor = ROJO_FONDO; s.textColor = ROJO; s.fontStyle = "bold"; }
      if (c === 10 && k.bajoMinimo.suyo) s.fillColor = MORADO_FONDO;
      if ((c === 2 || c === 6) && k.pvpDistinto) { s.fillColor = AMBAR_FONDO; s.textColor = AMBAR; s.fontStyle = "bold"; }
      if (c === 1 && f.descatalogado) s.textColor = ROJO;
      if (c === 10) s.textColor = f.diff > 0.01 ? ROJO : f.diff < -0.01 ? VERDE : TEXTO;
      if (c === 11) { s.textColor = k.masBarato === "Cosméticos24h" ? ROJO : k.masBarato === "Nosotros" ? VERDE : TEXTO_SUAVE; s.fontStyle = k.masBarato === "Igual" ? "normal" : "bold"; }
      if (c === 12) { s.textColor = k.igualar.startsWith("No") ? ROJO : VERDE; s.fontStyle = k.igualar.startsWith("No") ? "bold" : "normal"; }
    },
    didDrawCell: d => {
      if (d.section !== "body") return;
      // Una fila partida entre dos páginas llega con índice -1: se busca por su contenido
      const f = orden[d.row.index] ?? orden[cuerpo.indexOf(d.row.raw as string[])];
      if (!f) return;
      // Enlace: el producto lleva a nuestra ficha
      if (d.column.index === 1) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: f.miUrl });
    },
  });

  // Leyenda
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const leyenda: [RGB, RGB, string][] = [
    [MORADO_FONDO, MORADO, descuento != null ? `Más allá de nuestro dto. máx.: venden por debajo de nuestro PVP -${dto} y no podemos igualarlos` : "Esta marca no tiene descuento máximo"],
    [ROJO_FONDO, ROJO, "Nuestro precio está por debajo del PVP con el descuento máximo"],
    [AMBAR_FONDO, AMBAR, "PVP distinto en las dos webs (¿tarifa sin actualizar?)"],
  ];
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
  for (const [fondo, color, texto] of leyenda) {
    if (y > 195) { doc.addPage(); y = 15; }
    doc.setFillColor(...fondo); doc.rect(M, y - 3, 8, 4, "F");
    doc.setTextColor(...color); doc.text(texto, M + 11, y);
    y += 5.5;
  }
  doc.setFont("helvetica", "italic"); doc.setTextColor(...TEXTO_SUAVE);
  doc.text(doc.splitTextToSize("PVP: precio sin descuento. Con dto. máx.: nuestro PVP con el descuento máximo al que podemos llegar en la marca (Boardfy o el puesto en la app). Precio web: el de su web, con su descuento sobre el PVP. Precio final: el de su web con el cupón que aplican en el carrito. Dto. total: lo que rebajan sobre su PVP contando el cupón. Diferencia: nuestro precio menos su precio final.", 277), M, y);

  // Lo que tienen ellos y nosotros no
  if (soloEllos.length > 0) {
    doc.addPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...ROSA);
    doc.text(`Solo en Cosméticos24h · ${marca}`, M, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...TEXTO_SUAVE);
    doc.text(`Productos que venden ellos y no tienen nuestro mismo EAN · ${soloEllos.length} productos · ${fechaCorta(fecha)}`, M, 21);
    autoTable(doc, {
      startY: 26,
      margin: { left: M, right: M },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, textColor: TEXTO, cellPadding: 1.8 },
      headStyles: { fillColor: ROSA, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center" },
      head: [["EAN", "PRODUCTO", "PRECIO", "TIPO"]],
      body: soloEllos.map(s => [s.ean ?? "", s.titulo, eur(s.precio), s.esPack ? "Pack" : "Producto"]),
      columnStyles: { 0: { cellWidth: 28, halign: "left", textColor: TEXTO_SUAVE }, 1: { halign: "left" }, 2: { cellWidth: 25, halign: "right" }, 3: { cellWidth: 22, halign: "center", textColor: TEXTO_SUAVE } },
      didParseCell: d => { if (d.section === "body" && d.row.index % 2 === 1) d.cell.styles.fillColor = CEBRA; },
      didDrawCell: d => { const s = soloEllos[d.row.index]; if (d.section === "body" && d.column.index === 1 && s) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: s.url }); },
    });
  }

  // Pie con página
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...TEXTO_SUAVE);
    doc.text(`La Tienda de Cosméticos · Comparativa con Cosméticos24h · ${p}/${n}`, 287, 203, { align: "right" });
  }
  return doc.output("blob");
}
