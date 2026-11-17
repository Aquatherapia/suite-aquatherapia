"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AVISO_SIN_PAGAR, cruzar, leerCsv, textoMarca, type MarcaPedido } from "./calculo";
import { leerXls } from "./leer-xls";

type Archivo<T> = { nombre: string; filas: T } | null;

const miles = (n: number) => n.toLocaleString("es-ES");

// El CSV de la tienda viene en UTF-8; si no, en Windows-1252
async function textoDe(f: File) {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch {
    const t = document.createElement("textarea");
    t.value = texto;
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

export default function PedidosMarcasPage() {
  const [ventas, setVentas] = useState<Archivo<string[][]>>(null);
  const [stock, setStock] = useState<Archivo<string[][]>>(null);
  const [error, setError] = useState("");
  const [stockMax, setStockMax] = useState(0);
  const [descatalogados, setDescatalogados] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [copiado, setCopiado] = useState("");
  const [encima, setEncima] = useState(false);

  async function cargar(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    for (const f of Array.from(files)) {
      const n = f.name.toLowerCase();
      try {
        if (n.endsWith(".xls") || n.endsWith(".xlsx")) {
          if (n.endsWith(".xlsx")) throw new Error("El informe de ventas tiene que ser el .xls tal cual lo descarga la tienda (no un .xlsx guardado de nuevo).");
          setVentas({ nombre: f.name, filas: leerXls(await f.arrayBuffer()) });
        } else if (n.endsWith(".csv") || n.endsWith(".txt")) {
          setStock({ nombre: f.name, filas: leerCsv(await textoDe(f)) });
        } else throw new Error(`«${f.name}»: sube el informe de ventas (.xls) y el control de stocks (.csv).`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const resultado = useMemo(() => {
    if (!ventas || !stock) return null;
    try { return cruzar(ventas.filas, stock.filas, { stockMax, incluirDescatalogados: descatalogados }); }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [ventas, stock, stockMax, descatalogados]);

  const marcas: MarcaPedido[] = useMemo(() => {
    if (!resultado || "error" in resultado) return [];
    const q = buscar.trim().toLowerCase();
    return q ? resultado.marcas.filter(m => m.marca.includes(q)) : resultado.marcas;
  }, [resultado, buscar]);

  async function copiarTexto(id: string, texto: string) {
    if (await copiar(texto)) { setCopiado(id); setTimeout(() => setCopiado(c => (c === id ? "" : c)), 2000); }
    else setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
  }

  const r = resultado && !("error" in resultado) ? resultado : null;
  const lineas = r ? r.marcas.reduce((n, m) => n + m.total, 0) : 0;

  return (
    <div className="wrap rf pm">
      <Link href="/" className="volver-link">← Volver</Link>
      <header>
        <h1>Pedidos a las marcas</h1>
        <p className="subtitle">
          Sube el informe de ventas (COMPRAS_….xls) y el control de stocks (control_stocks-….csv) de la tienda.
          Sale, marca por marca, lo vendido que se ha quedado sin stock, listo para copiar y mandar.
          Los archivos se leen en tu navegador: no se suben a ningún sitio.
        </p>
      </header>

      <label
        className={`pm-subir${encima ? " pm-subir-on" : ""}`}
        onDragOver={e => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={e => { e.preventDefault(); setEncima(false); cargar(e.dataTransfer.files); }}
      >
        <input type="file" multiple accept=".xls,.csv,application/vnd.ms-excel,text/csv" onChange={e => { cargar(e.target.files); e.target.value = ""; }} />
        <span className="mg-upload-btn">Elegir archivos</span>
        <span className="rf-suave">o arrástralos aquí. Puedes elegir los dos a la vez.</span>
      </label>

      <ul className="pm-archivos">
        <li className={ventas ? "ok" : ""}><b>Ventas:</b> {ventas ? ventas.nombre : "falta el COMPRAS_….xls"}</li>
        <li className={stock ? "ok" : ""}><b>Stock:</b> {stock ? stock.nombre : "falta el control_stocks-….csv"}</li>
      </ul>

      {error && <p className="error">{error}</p>}
      {resultado && "error" in resultado && <p className="error">{resultado.error}</p>}

      {r && (
        <>
          <div className="mp-cifras">
            <div><b>{miles(r.marcas.length)}</b><span>marcas con algo que pedir</span></div>
            <div><b>{miles(lineas)}</b><span>productos en la lista</span></div>
            <div><b>{miles(r.unidades)}</b><span>unidades vendidas en {miles(r.pedidos)} pedidos</span></div>
          </div>
          <p className="rf-suave pm-periodo">
            Ventas del <b>{r.desde || "—"}</b> al <b>{r.hasta || "—"}</b> (lo que traiga el informe: si quieres otro periodo, cambia las fechas al descargarlo).
            {r.anulados > 0 && <> No cuento {miles(r.anulados)} líneas canceladas o devueltas.</>}
          </p>

          <div className="rf-filtros">
            <select className="rc-select" value={stockMax} onChange={e => setStockMax(Number(e.target.value))} aria-label="Qué stock entra">
              <option value={0}>Stock 0 o menos</option>
              <option value={1}>Stock 1 o menos</option>
              <option value={2}>Stock 2 o menos</option>
            </select>
            <label className="rf-check">
              <input type="checkbox" checked={descatalogados} onChange={e => setDescatalogados(e.target.checked)} />
              Incluir descatalogados{r.descatalogados > 0 && !descatalogados ? ` (${r.descatalogados})` : ""}
            </label>
            <input type="search" placeholder="Buscar marca…" value={buscar} onChange={e => setBuscar(e.target.value)} />
            <button className="vp-revisar-btn pm-todo" disabled={!marcas.length}
              onClick={() => copiarTexto("*", marcas.map(textoMarca).join("\n\n"))}>
              {copiado === "*" ? "Copiado ✓" : "Copiar todas"}
            </button>
          </div>

          {r.marcas.length === 0 && <p className="rf-suave">No hay nada vendido en este periodo que esté sin stock.</p>}

          <div className="pm-marcas">
            {marcas.map(m => (
              <section key={m.marca} className="pm-marca">
                <div className="pm-cab">
                  <h2>{m.marca}</h2>
                  <span className="rf-suave">{m.total} producto{m.total !== 1 ? "s" : ""}</span>
                  <button className="copy-btn" onClick={() => copiarTexto(m.marca, textoMarca(m))}>{copiado === m.marca ? "Copiado ✓" : "Copiar"}</button>
                </div>
                {m.grupos.map(g => (
                  <div key={g.stock} className="pm-grupo">
                    <h3 className={g.stock < 0 ? "neg" : ""}>stock {g.stock}</h3>
                    <ul>
                      {g.filas.map(f => (
                        <li key={`${f.ean}|${f.producto}|${f.propiedad}`}>
                          <span className="pm-prod">{f.producto}</span>
                          <span className="pm-dato">{f.propiedad}</span>
                          <span className="pm-dato pm-ean">{f.ean}</span>
                          <span className="pm-ventas">−ventas <b>{f.ventas}</b></span>
                          {f.sinPagar > 0 && <span className="pm-sinpagar">{AVISO_SIN_PAGAR} ({f.sinPagar} ud{f.sinPagar !== 1 ? "s" : ""}.)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>

          {r.sinCruzar.length > 0 && (
            <details className="pm-aviso">
              <summary>Vendidos que no encuentro en el stock ({r.sinCruzar.length})</summary>
              <p className="rf-suave">Ni por EAN ni por nombre y formato. Suelen ser productos que ya no están en el catálogo o con el EAN cambiado: si alguno sigue a la venta, revísalo a mano.</p>
              <ul>
                {r.sinCruzar.map(s => (
                  <li key={`${s.ean}|${s.producto}|${s.propiedad}`}>{s.marca} · {s.producto} · {s.propiedad} · {s.ean || "sin EAN"} · ventas {s.ventas}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="rf-suave mp-nota">
            Entran los productos que se han vendido en el periodo del informe y tienen ahora un stock igual o menor que el elegido (STOCK ACTUAL del control de stocks).
            Se cruzan por EAN; los que no tienen EAN (packs, kits), por nombre y formato. Los de stock 0 que no se han vendido no salen.
            {r.enPacks > 0 && <> Los packs Dúo y Trío de un mismo producto cuentan como 2 y 3 unidades de ese producto ({miles(r.enPacks)} uds. en total).</>}
            {" "}Si un producto tiene pedidos sin enviar y sin pagar, sale con «{AVISO_SIN_PAGAR}»: su stock negativo puede deberse a una compra que no se ha completado.
            {r.sinControl > 0 && <> {r.sinControl} vendidos no tienen control de stock y no salen.</>}
            {" "}Las ventas son unidades e incluyen los pedidos pendientes de pago o envío.
          </p>
        </>
      )}
    </div>
  );
}
