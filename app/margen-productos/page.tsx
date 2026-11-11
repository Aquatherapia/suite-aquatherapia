"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calcular, resumir, MARGEN_BAJO, MARGEN_RARO, type Datos, type Estado, type Producto, type ResumenMarca } from "./tipos";

const eur = (n: number | null) => n === null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const miles = (n: number) => n.toLocaleString("es-ES");
const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const POR_PAGINA = 100;

const ESTADOS: { estado: Estado | "todos"; titulo: string; ayuda: string }[] = [
  { estado: "todos", titulo: "Todos", ayuda: "" },
  { estado: "pierde", titulo: "Pierden dinero", ayuda: "Se venden por debajo del coste. Casi siempre es un coste mal cargado en el programa (como Selvert); si no, subir el precio o quitar la oferta." },
  { estado: "bajo", titulo: `Margen bajo (< ${MARGEN_BAJO * 100} %)`, ayuda: `Ganan algo, pero menos del ${MARGEN_BAJO * 100} % de la venta sin IVA. Mira «Sin oferta»: si ahí sube, lo que se come el margen es el descuento.` },
  { estado: "ok", titulo: "Margen normal", ayuda: "" },
  { estado: "raro", titulo: `Margen muy alto (> ${MARGEN_RARO * 100} %)`, ayuda: "Margen sospechosamente alto: suele ser un coste cargado de menos (el de una muestra, o con el descuento puesto dos veces)." },
  { estado: "sin-coste", titulo: "Sin coste", ayuda: "No tienen el «Precio de coste» en el programa, así que no se puede calcular su margen. Hay que cargarlo." },
];

type Orden = "margen-asc" | "margen-desc" | "euros-asc" | "euros-desc" | "descuento-desc" | "nombre";
const ORDENES: { orden: Orden; titulo: string }[] = [
  { orden: "margen-asc", titulo: "Margen %: de menos a más" },
  { orden: "margen-desc", titulo: "Margen %: de más a menos" },
  { orden: "euros-asc", titulo: "Margen €: de menos a más" },
  { orden: "euros-desc", titulo: "Margen €: de más a menos" },
  { orden: "descuento-desc", titulo: "Más descuento de oferta" },
  { orden: "nombre", titulo: "Marca y nombre" },
];

const clase = (p: number | null) => p === null ? "mp-gris" : p < 0 ? "mp-rojo" : p < MARGEN_BAJO ? "mp-ambar" : p > MARGEN_RARO ? "mp-azul" : "mp-verde";

export default function MargenProductosPage() {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<"marcas" | "productos">("productos");
  const [marca, setMarca] = useState("");
  const [estado, setEstado] = useState<Estado | "todos">("todos");
  const [buscar, setBuscar] = useState("");
  const [soloStock, setSoloStock] = useState(false);
  const [orden, setOrden] = useState<Orden>("margen-asc");
  const [ordenMarcas, setOrdenMarcas] = useState<"margen-asc" | "margen-desc" | "pierde" | "nombre">("margen-asc");
  const [cuantos, setCuantos] = useState(POR_PAGINA);

  async function actualizar() {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/margen-productos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "actualizar" }) });
      const v = await r.json();
      if (v.error) setError(v.error); else setDatos(v.datos);
    } catch {
      setError("No se pudo leer el feed de la web. Vuelve a intentarlo en un momento.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    fetch("/api/margen-productos", { cache: "no-store" }).then(r => r.json()).then(v => {
      setDatos(v.datos);
      if (!v.datos) actualizar(); // la primera vez se lee el feed directamente
    }).catch(() => setError("No se pudieron cargar los márgenes."));
  }, []);

  const productos = useMemo(() => (datos?.filas ?? []).map(calcular), [datos]);
  const marcas = useMemo(() => [...new Set(productos.map(p => p.marca))].sort((a, b) => a.localeCompare(b, "es")), [productos]);

  // Filtro común (marca, búsqueda, stock); el de estado va aparte para poder contar cada estado
  const base = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return productos.filter(p =>
      (!marca || p.marca === marca) && (!soloStock || p.stock) &&
      (!q || p.producto.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q) || p.ean.includes(q)));
  }, [productos, marca, buscar, soloStock]);

  const cuenta = useMemo(() => {
    const m = new Map<string, number>([["todos", base.length]]);
    for (const p of base) m.set(p.estado, (m.get(p.estado) ?? 0) + 1);
    return m;
  }, [base]);

  const filtrados = useMemo(() => {
    const l = base.filter(p => estado === "todos" || p.estado === estado);
    const nulos = (a: number | null, b: number | null, f: (x: number, y: number) => number) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : f(a, b);
    const cmp: Record<Orden, (a: Producto, b: Producto) => number> = {
      "margen-asc": (a, b) => nulos(a.margenPct, b.margenPct, (x, y) => x - y),
      "margen-desc": (a, b) => nulos(a.margenPct, b.margenPct, (x, y) => y - x),
      "euros-asc": (a, b) => nulos(a.margen, b.margen, (x, y) => x - y),
      "euros-desc": (a, b) => nulos(a.margen, b.margen, (x, y) => y - x),
      "descuento-desc": (a, b) => b.descuento - a.descuento,
      "nombre": (a, b) => a.marca.localeCompare(b.marca, "es") || a.producto.localeCompare(b.producto, "es"),
    };
    return l.sort((a, b) => cmp[orden](a, b) || a.producto.localeCompare(b.producto, "es"));
  }, [base, estado, orden]);

  const total = useMemo(() => resumir("Total", filtrados), [filtrados]);

  const resumenMarcas = useMemo(() => {
    const por = new Map<string, Producto[]>();
    for (const p of filtrados) por.set(p.marca, [...(por.get(p.marca) ?? []), p]);
    const l = [...por].map(([m, ps]) => resumir(m, ps));
    const n = (x: number | null, def: number) => x ?? def;
    if (ordenMarcas === "margen-asc") l.sort((a, b) => n(a.margenPct, 9) - n(b.margenPct, 9));
    else if (ordenMarcas === "margen-desc") l.sort((a, b) => n(b.margenPct, -9) - n(a.margenPct, -9));
    else if (ordenMarcas === "pierde") l.sort((a, b) => (b.pierde + b.bajo) - (a.pierde + a.bajo));
    else l.sort((a, b) => a.marca.localeCompare(b.marca, "es"));
    return l;
  }, [filtrados, ordenMarcas]);

  useEffect(() => { setCuantos(POR_PAGINA); }, [marca, estado, buscar, soloStock, orden]);

  const ayuda = ESTADOS.find(e => e.estado === estado)?.ayuda;
  const verMarca = (m: string) => { setMarca(m); setVista("productos"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="wrap rf mp">
      <Link href="/" className="volver-link">← Volver</Link>
      <header>
        <h1>Margen de cada producto</h1>
        <p className="subtitle">
          El margen de todos los productos de latiendadecosmeticos.com, sacado del feed de la web: precio de venta sin IVA
          menos el coste (con el descuento de la marca). Por marca y por producto, con los que pierden dinero o ganan poco.
        </p>
      </header>

      <section className="rf-estado">
        <div className="rf-estado-txt">
          {datos === undefined && !error && <span>Cargando…</span>}
          {cargando && <span><span className="spinner spinner-dark" /> Leyendo el feed de la web: tarda alrededor de un minuto…</span>}
          {!cargando && datos && <span>Datos del feed del <b>{fecha(datos.fecha)}</b> · {miles(productos.length)} productos (cada formato cuenta aparte)</span>}
        </div>
        <div className="rf-botones">
          <button className="vp-revisar-btn" onClick={actualizar} disabled={cargando}>{cargando ? "Leyendo…" : "Actualizar"}</button>
          <button className="regen-btn" disabled={!filtrados.length}
            onClick={() => descargarExcel(filtrados, resumenMarcas, total).catch(e => setError(e instanceof Error ? e.message : String(e)))}>
            Excel
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {datos && (
        <>
          <div className="mp-cifras">
            <div><b className={clase(total.margenPct)}>{pct(total.margenPct)}</b><span>margen medio sobre la venta</span></div>
            <div><b>{eur(total.margenMedio)}</b><span>margen medio por unidad</span></div>
            <div><b className={clase(total.margenPvpPct)}>{pct(total.margenPvpPct)}</b><span>margen si no hubiera ofertas</span></div>
          </div>

          <div className="rf-filtros">
            <select id="mp-marca" className="rc-select" value={marca} onChange={e => { setMarca(e.target.value); if (e.target.value) setVista("productos"); }} aria-label="Marca">
              <option value="">Todas las marcas ({marcas.length})</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="search" id="mp-buscar" placeholder="Buscar producto, marca o EAN…" value={buscar} onChange={e => setBuscar(e.target.value)} />
            <label className="rf-check">
              <input type="checkbox" id="mp-stock" checked={soloStock} onChange={e => setSoloStock(e.target.checked)} />
              Solo en stock
            </label>
          </div>

          <div className="rf-resumen">
            {ESTADOS.map(e => (
              <button key={e.estado} className={`rf-chip mp-chip${estado === e.estado ? " mp-chip-on" : ""}${(cuenta.get(e.estado) ?? 0) === 0 ? " rf-chip-cero" : ""}`}
                onClick={() => setEstado(e.estado)}>
                <b>{miles(cuenta.get(e.estado) ?? 0)}</b> {e.titulo}
              </button>
            ))}
          </div>
          {ayuda && <p className="rf-hacer">{ayuda}</p>}

          <div className="mp-pestanas">
            <button className={vista === "productos" ? "on" : ""} onClick={() => setVista("productos")}>Productos ({miles(filtrados.length)})</button>
            <button className={vista === "marcas" ? "on" : ""} onClick={() => setVista("marcas")}>Resumen por marca ({miles(resumenMarcas.length)})</button>
            {vista === "marcas" ? (
              <select className="rc-select" value={ordenMarcas} onChange={e => setOrdenMarcas(e.target.value as typeof ordenMarcas)} aria-label="Ordenar marcas">
                <option value="margen-asc">Margen: de menos a más</option>
                <option value="margen-desc">Margen: de más a menos</option>
                <option value="pierde">Más productos con margen bajo</option>
                <option value="nombre">Por nombre</option>
              </select>
            ) : (
              <select className="rc-select" value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar productos">
                {ORDENES.map(o => <option key={o.orden} value={o.orden}>{o.titulo}</option>)}
              </select>
            )}
          </div>

          {filtrados.length === 0 && <p className="rf-suave">No hay productos con estos filtros.</p>}

          {vista === "marcas" && (
            <ul className="mp-lista">
              {resumenMarcas.map(m => (
                <li key={m.marca}>
                  <button className="mp-marca" onClick={() => verMarca(m.marca)}>
                    <span className="mp-nombre">{m.marca}</span>
                    <span className={`mp-pct ${clase(m.margenPct)}`}>{pct(m.margenPct)}</span>
                  </button>
                  <div className="rf-suave">
                    {miles(m.productos)} producto{m.productos !== 1 ? "s" : ""} · {eur(m.margenMedio)} de media por unidad · sin ofertas {pct(m.margenPvpPct)}
                    {m.pierde > 0 && <> · <span className="mp-rojo">{m.pierde} pierden</span></>}
                    {m.bajo > 0 && <> · <span className="mp-ambar">{m.bajo} margen bajo</span></>}
                    {m.sinCoste > 0 && <> · {m.sinCoste} sin coste</>}
                    {m.raro > 0 && <> · <span className="mp-azul">{m.raro} muy alto</span></>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {vista === "productos" && (
            <>
              <ul className="mp-lista">
                {filtrados.slice(0, cuantos).map((p, i) => (
                  <li key={`${p.ficha}|${p.ean}|${i}`}>
                    <div className="mp-marca">
                      <a className="mp-nombre" href={p.ficha} target="_blank" rel="noreferrer">{p.producto}</a>
                      <span className={`mp-pct ${clase(p.margenPct)}`}>{p.estado === "sin-coste" ? "Sin coste" : pct(p.margenPct)}</span>
                    </div>
                    <div className="rf-suave">
                      {p.marca}{p.ean ? ` · EAN ${p.ean}` : ""}{!p.stock ? " · sin stock" : ""}
                    </div>
                    <div className="mp-numeros">
                      Venta {eur(p.venta)}{p.descuento > 0.005 ? <> (PVP {eur(p.pvp)}, −{Math.round(p.descuento * 100)} %)</> : null} · sin IVA {eur(p.ventaSinIva)} · coste con dto. {eur(p.coste)}
                      {p.margen !== null && <> · <b className={clase(p.margenPct)}>margen {eur(p.margen)}</b></>}
                      {p.descuento > 0.005 && p.margenPvpPct !== null && <> · sin oferta {pct(p.margenPvpPct)}</>}
                    </div>
                  </li>
                ))}
              </ul>
              {filtrados.length > cuantos && (
                <button className="regen-btn mp-mas" onClick={() => setCuantos(c => c + 500)}>
                  Ver más ({miles(filtrados.length - cuantos)} restantes)
                </button>
              )}
            </>
          )}

          <p className="rf-suave mp-nota">
            Margen = precio de venta sin IVA (÷ 1,21) − coste. El coste es el del programa, sin IVA y ya con el descuento de la marca.
            Es el margen de catálogo, antes de envíos, comisiones de pago y publicidad, y sin tener en cuenta cuántas unidades se venden.
            La media por marca está ponderada por precio.
          </p>
        </>
      )}
    </div>
  );
}

// Excel con lo que se ve (con los filtros puestos): resumen por marca y todos los productos
async function descargarExcel(productos: Producto[], marcas: ResumenMarca[], total: ResumenMarca) {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  const EUR = '#,##0.00 "€"';
  const PCT = "0.0%";
  const cabecera = (ws: import("exceljs").Worksheet) => {
    const c = ws.getRow(1);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1270B6" } };
    c.alignment = { wrapText: true, vertical: "middle" };
    c.height = 32;
  };
  const color = (p: number | null) => p === null ? undefined : p < 0 ? "FFF8D7DA" : p < MARGEN_BAJO ? "FFFFF3CD" : p > MARGEN_RARO ? "FFDBEAFE" : undefined;

  const wm = wb.addWorksheet("Por marca", { views: [{ state: "frozen", ySplit: 1 }] });
  wm.columns = [
    { header: "Marca", key: "marca", width: 26 },
    { header: "Productos", key: "productos", width: 11 },
    { header: "Margen % sobre venta", key: "margenPct", width: 12, style: { numFmt: PCT } },
    { header: "Margen medio por unidad", key: "margenMedio", width: 12, style: { numFmt: EUR } },
    { header: "Margen % sin ofertas", key: "margenPvpPct", width: 12, style: { numFmt: PCT } },
    { header: "Pierden dinero", key: "pierde", width: 10 },
    { header: `Margen bajo (< ${MARGEN_BAJO * 100} %)`, key: "bajo", width: 11 },
    { header: "Sin coste", key: "sinCoste", width: 9 },
    { header: `Margen muy alto (> ${MARGEN_RARO * 100} %)`, key: "raro", width: 11 },
  ];
  for (const m of [...marcas, total]) {
    const r = wm.addRow(m);
    const c = color(m.margenPct);
    if (c) r.getCell("margenPct").fill = { type: "pattern", pattern: "solid", fgColor: { argb: c } };
    if (m === total) r.font = { bold: true };
  }
  cabecera(wm);
  wm.autoFilter = { from: "A1", to: "I1" };

  const ESTADO: Record<Estado, string> = { pierde: "Pierde dinero", bajo: "Margen bajo", ok: "", raro: "Margen muy alto: ¿coste bien cargado?", "sin-coste": "Sin coste en el programa" };
  const wp = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  wp.columns = [
    { header: "Marca", key: "marca", width: 22 },
    { header: "Producto", key: "producto", width: 60 },
    { header: "EAN", key: "ean", width: 16 },
    { header: "PVP", key: "pvp", width: 10, style: { numFmt: EUR } },
    { header: "Precio de venta", key: "venta", width: 11, style: { numFmt: EUR } },
    { header: "Descuento", key: "descuento", width: 10, style: { numFmt: "0%" } },
    { header: "Venta sin IVA", key: "ventaSinIva", width: 11, style: { numFmt: EUR } },
    { header: "Coste con dto. (sin IVA)", key: "coste", width: 13, style: { numFmt: EUR } },
    { header: "Margen por unidad", key: "margen", width: 11, style: { numFmt: EUR } },
    { header: "Margen % sobre venta", key: "margenPct", width: 11, style: { numFmt: PCT } },
    { header: "Margen % sin oferta", key: "margenPvpPct", width: 11, style: { numFmt: PCT } },
    { header: "En stock", key: "stock", width: 8 },
    { header: "Revisar", key: "estado", width: 30 },
    { header: "Ficha", key: "ficha", width: 50 },
  ];
  for (const p of productos) {
    const r = wp.addRow({
      ...p, ean: p.ean, stock: p.stock ? "Sí" : "No", estado: ESTADO[p.estado],
      ventaSinIva: Math.round(p.ventaSinIva * 100) / 100, margen: p.margen === null ? null : Math.round(p.margen * 100) / 100,
      ficha: p.ficha ? { text: p.ficha, hyperlink: p.ficha } : "",
    });
    const c = color(p.margenPct);
    if (c) r.getCell("margenPct").fill = { type: "pattern", pattern: "solid", fgColor: { argb: c } };
  }
  cabecera(wp);
  wp.autoFilter = { from: "A1", to: "N1" };
  wp.getColumn("ficha").font = { color: { argb: "FF1270B6" }, underline: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `margen_por_producto_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
