// Excel de Boardfy completado: se sube el informe de una marca que da Boardfy y se descarga el mismo Excel con
// nuestra columna (precio de nuestra web, enlazado a nuestra ficha) y cada precio de la competencia enlazado a su ficha.
// Boardfy no da los enlaces: la Suite busca cada EAN en la web de cada tienda y enlaza su ficha cuando es seguro
// que es ese producto; si la tienda no se deja leer (Notino, Amazon…), se enlaza la búsqueda de ese EAN.

type Mio = { nombre: string; url: string; precio: number; pvp: number };
type Tienda = { nombre: string; dominio: string; tipo: string };
type Fichas = { dominio?: string; plataforma?: string | null; enlaces?: Record<string, string>; error?: string };
type Respuesta = { mios: Record<string, Mio[]>; fichas: Record<string, Record<string, string>>; tiendas: Tienda[]; error?: string };

const AZUL = "FF1270B6", FONDO_NOS = "FFE8F1F9", ROJO = "FFB91C1C", ROJO_FONDO = "FFFDECEC", GRIS = "FF6B7280";
const EUROS = '#,##0.00 "€"';

const letras = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sinWww = (d: string) => d.toLowerCase().replace(/^www\./, "");
const eanDe = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, ""); return d.length >= 7 && d.length <= 14 ? d : ""; };
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return numero((v as { result: unknown }).result);
  const n = parseFloat(String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string => v && typeof v === "object" ? String((v as { text?: unknown; result?: unknown }).text ?? (v as { result?: unknown }).result ?? "") : String(v ?? "");

// Tiendas grandes que Boardfy nombra por su web y cómo se busca un EAN en ellas
const BUSQUEDA: Record<string, (ean: string) => string> = {
  "notino.es": e => `https://www.notino.es/search.asp?exps=${e}`,
  "amazon.es": e => `https://www.amazon.es/s?k=${e}`,
  "cosmeticos24h.com": e => `https://cosmeticos24h.com/search?q=${e}`,
  "makeup.es": e => `https://makeup.es/search/?q=${e}`,
};

// La web de una tienda a partir del nombre que le da Boardfy («Notino.es», «Amazon.es - Seller», «Perfumeria Marti»…)
function dominioDe(nombre: string, tiendas: Tienda[]): Tienda | null {
  const limpio = nombre.toLowerCase().replace(/\s*-\s*seller\s*$/i, "").trim();
  const comoWeb = limpio.match(/^[a-z0-9.-]+\.(es|com|eu|net|org|shop|store)$/)?.[0];
  if (comoWeb) return tiendas.find(t => sinWww(t.dominio) === comoWeb) ?? { nombre, dominio: comoWeb, tipo: "" };
  const k = letras(nombre).replace(/(sl|sa|slu)$/, "");
  if (k.length < 4) return null;
  return tiendas.find(t => t.nombre && letras(t.nombre) === k)
    ?? tiendas.find(t => { const d = letras(sinWww(t.dominio).replace(/\.[a-z]+$/, "")); return d.length >= 4 && (d.includes(k) || k.includes(d)); })
    ?? null;
}

function enlace(ean: string, nombre: string, t: Tienda | null, fichas: Record<string, string> | undefined): { url: string; ficha: boolean } {
  if (t) {
    const d = sinWww(t.dominio);
    const exacta = Object.entries(fichas ?? {}).find(([dom]) => sinWww(dom) === d || sinWww(dom).endsWith(`.${d}`) || d.endsWith(`.${sinWww(dom)}`));
    if (exacta) return { url: exacta[1], ficha: true };
    if (BUSQUEDA[d]) return { url: BUSQUEDA[d](ean), ficha: false };
    const base = `https://${t.dominio}`;
    if (t.tipo === "shopify" || t.tipo === "c24") return { url: `${base}/search?q=${ean}`, ficha: false };
    if (t.tipo === "woo") return { url: `${base}/?s=${ean}&post_type=product`, ficha: false };
    if (t.tipo === "presta") return { url: `${base}/index.php?controller=search&s=${ean}`, ficha: false };
    return { url: `https://www.google.com/search?q=${ean}+site%3A${d}`, ficha: false };
  }
  return { url: `https://www.google.com/search?q=${ean}+%22${encodeURIComponent(nombre)}%22`, ficha: false };
}

// Una celda con un número que además es un enlace (para poder seguir ordenando y filtrando por precio)
function numEnlazado(url: string, n: number) {
  return url.length <= 255 ? { formula: `HYPERLINK("${url.replace(/"/g, '""')}",${n})`, result: n } : n;
}

export async function completarBoardfy(archivo: File, pedir: (body: object) => Promise<Respuesta & Fichas>, progreso: (t: string) => void = () => {}): Promise<{ productos: number; nuestros: number; fichas: number; busquedas: number }> {
  const { default: Excel } = await import("exceljs");
  const entrada = new Excel.Workbook();
  await entrada.xlsx.load(await archivo.arrayBuffer());
  const hoja = entrada.worksheets[0];
  if (!hoja) throw new Error("El Excel está vacío");
  const cab = (hoja.getRow(1).values as unknown[]).slice(1).map(v => texto(v).trim());
  const busca = (re: RegExp) => cab.findIndex(c => re.test(c));
  const iEan = busca(/^ean$/i), iNombre = busca(/^nombre$/i), iPvp = busca(/^pvp$/i), iDto = busca(/^pvp\s*-\s*\d/i), iMb = busca(/m[aá]s\s*barato/i);
  if (iEan < 0 || iPvp < 0) throw new Error("No parece un informe de Boardfy: no encuentro las columnas EAN y PVP en la primera fila");
  const fijas = new Set([iEan, iNombre, iPvp, iDto, iMb].filter(i => i >= 0));
  const iTiendas = cab.map((_, i) => i).filter(i => i > Math.max(...fijas) && cab[i]);
  const pctDto = iDto >= 0 ? Number(cab[iDto].match(/(\d+(?:[.,]\d+)?)/)?.[1].replace(",", ".") ?? 0) : 0;

  const filas: { ean: string; nombre: string; pvp: number | null; mb: string; precios: (number | null)[] }[] = [];
  hoja.eachRow((row, n) => {
    if (n === 1) return;
    const v = (row.values as unknown[]).slice(1);
    const ean = eanDe(texto(v[iEan]) || v[iEan]);
    if (!ean) return;
    filas.push({ ean, nombre: iNombre >= 0 ? texto(v[iNombre]) : "", pvp: numero(v[iPvp]), mb: iMb >= 0 ? texto(v[iMb]) : "", precios: iTiendas.map(i => numero(v[i])) });
  });
  if (!filas.length) throw new Error("No he encontrado productos con EAN en el Excel");

  const r = await pedir({ action: "boardfy", eans: filas.map(f => f.ean) });
  if (r.error) throw new Error(r.error);
  const tiendas = iTiendas.map(i => ({ nombre: cab[i], t: dominioDe(cab[i], r.tiendas) }));

  // Fichas de cada tienda: una petición por tienda, de tres en tres
  let hechas = 0;
  const cola = tiendas.map((t, j) => ({ t, eans: filas.filter(f => f.precios[j] != null).map(f => f.ean) })).filter(x => x.eans.length);
  const total = cola.length;
  progreso(`Buscando las fichas en las tiendas (0 de ${total})…`);
  const trabajar = async () => {
    for (let x = cola.shift(); x; x = cola.shift()) {
      try {
        const f = await pedir({ action: "boardfy-fichas", tienda: x.t.nombre, eans: x.eans });
        if (f.dominio) x.t.t = { nombre: x.t.nombre, tipo: f.plataforma || x.t.t?.tipo || "", dominio: f.dominio };
        for (const [ean, url] of Object.entries(f.enlaces ?? {})) (r.fichas[ean] ??= {})[f.dominio!] = url;
      } catch { /* esa tienda se queda con la búsqueda */ }
      progreso(`Buscando las fichas en las tiendas (${++hechas} de ${total})…`);
    }
  };
  await Promise.all([trabajar(), trabajar(), trabajar()]);

  // El Excel de salida: las columnas de Boardfy con la nuestra detrás del PVP con descuento
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  const ws = wb.addWorksheet(hoja.name.slice(0, 31));
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  const titulos = ["EAN", "NOMBRE", "PVP", `PVP -${pctDto || 10}%`, "LA TIENDA DE COSMÉTICOS", "PVP MAS BARATO", ...tiendas.map(t => t.nombre)];
  const r1 = ws.getRow(1);
  titulos.forEach((t, i) => {
    const c = r1.getCell(i + 1); c.value = t;
    c.font = { bold: true, color: { argb: i === 4 ? "FFFFFFFF" : "FF000000" } };
    if (i === 4) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  r1.height = 30;
  ws.getColumn(1).width = 15; ws.getColumn(2).width = 60; ws.getColumn(5).width = 14; ws.getColumn(6).width = 22;
  [3, 4].forEach(i => ws.getColumn(i).width = 10);
  tiendas.forEach((_, j) => ws.getColumn(7 + j).width = 13);

  let nuestros = 0, nFichas = 0, nBusquedas = 0;
  filas.forEach((f, i) => {
    const row = ws.getRow(2 + i), opciones = r.mios[f.ean] ?? [];
    // Si un EAN está en varias fichas o formatos nuestros, el que se llama igual que en Boardfy
    const variante = (n: string) => n.includes("® - ") ? letras(n.slice(n.lastIndexOf("® - ") + 4)) : "";
    const mio = opciones.find(o => letras(o.nombre) === letras(f.nombre)) ?? opciones.find(o => variante(o.nombre) === variante(f.nombre));
    const pvp = f.pvp ?? mio?.pvp ?? null;
    const limite = pvp != null ? Math.round(pvp * (1 - (pctDto || 10) / 100) * 100) / 100 : null;
    row.getCell(1).value = f.ean;
    row.getCell(2).value = f.nombre;
    if (pvp != null) { row.getCell(3).value = pvp; row.getCell(3).numFmt = EUROS; }
    if (limite != null) { row.getCell(4).value = limite; row.getCell(4).numFmt = EUROS; }
    const nos = row.getCell(5);
    nos.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FONDO_NOS } };
    if (mio) {
      nuestros++;
      nos.value = numEnlazado(mio.url, mio.precio); nos.numFmt = EUROS;
      nos.font = { bold: true, underline: true, color: { argb: AZUL } };
    } else { nos.value = "No está en la web"; nos.font = { italic: true, color: { argb: GRIS } }; }
    row.getCell(6).value = f.mb;
    tiendas.forEach((t, j) => {
      const precio = f.precios[j];
      if (precio == null) return;
      const { url, ficha } = enlace(f.ean, t.nombre, t.t, r.fichas[f.ean]);
      if (ficha) nFichas++; else nBusquedas++;
      const c = row.getCell(7 + j);
      c.value = numEnlazado(url, precio); c.numFmt = EUROS;
      const masBarato = mio != null && precio < mio.precio - 0.005, bajo = limite != null && precio < limite - 0.005;
      c.font = { underline: true, italic: !ficha, bold: masBarato, color: { argb: masBarato ? ROJO : "FF1F2933" } };
      if (bajo) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO_FONDO } };
    });
  });
  const nota = ws.getRow(filas.length + 3).getCell(2);
  nota.value = "Cada precio lleva a la ficha de esa tienda. En cursiva: la Suite aún no conoce su ficha y lleva a la búsqueda del EAN en esa tienda. "
    + "En rojo, las tiendas más baratas que nosotros; con fondo rojo, por debajo del PVP con descuento.";
  nota.font = { italic: true, color: { argb: GRIS } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + filas.length, column: titulos.length } };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = archivo.name.replace(/\.xlsx$/i, "") + "_CON_NOSOTROS.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { productos: filas.length, nuestros, fichas: nFichas, busquedas: nBusquedas };
}
