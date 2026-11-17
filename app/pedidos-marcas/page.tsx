"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AVISO_SIN_PAGAR, DIAS_SIN_PAGAR, ESTADOS_PEDIDO, cruzar, leerCsv, textoMarca, type EstadoPedido, type MarcaPedido } from "./calculo";
import { leerXls } from "./leer-xls";

type Archivo<T> = { nombre: string; filas: T } | null;
type Pedido = { marca: string; fecha: string; estado: EstadoPedido; productos: { id: string; producto: string; propiedad: string; ean: string }[] };

const miles = (n: number) => n.toLocaleString("es-ES");
const diaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

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
  const [soloSinEnviar, setSoloSinEnviar] = useState(true);
  const [sinEnviarDesde, setSinEnviarDesde] = useState("");
  const [buscar, setBuscar] = useState("");
  const [copiado, setCopiado] = useState("");
  const [encima, setEncima] = useState(false);
  const [pedidos, setPedidos] = useState<Record<string, Pedido> | null>(null);
  const [errorSeg, setErrorSeg] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/pedidos-marcas", { cache: "no-store" }).then(r => r.json()).then(v => {
      if (v.error) setErrorSeg(v.error); else setPedidos(v.pedidos ?? {});
    }).catch(() => setErrorSeg("No se pudo cargar el seguimiento de pedidos."));
  }, []);

  async function enviar(cuerpo: object) {
    setGuardando(true);
    setErrorSeg("");
    try {
      const r = await fetch("/api/pedidos-marcas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const v = await r.json();
      if (v.error) setErrorSeg(v.error); else setPedidos(v.pedidos ?? {});
    } catch {
      setErrorSeg("No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      setGuardando(false);
    }
  }

  // Cada producto que está en un pedido abierto, con el estado de ese pedido y su fecha
  const enPedido = useMemo(() => {
    const m: Record<string, { estado: EstadoPedido; fecha: string }> = {};
    for (const p of Object.values(pedidos ?? {})) for (const x of p.productos) m[x.id] = { estado: p.estado, fecha: p.fecha };
    return m;
  }, [pedidos]);
  const estados = useMemo(() => Object.fromEntries(Object.entries(enPedido).map(([k, v]) => [k, v.estado])) as Record<string, EstadoPedido>, [enPedido]);
  const seguidos = useMemo(() => new Set(Object.keys(enPedido)), [enPedido]);

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
    try { return cruzar(ventas.filas, stock.filas, { stockMax, incluirDescatalogados: descatalogados, soloSinEnviar, sinEnviarDesde, seguidos }); }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [ventas, stock, stockMax, descatalogados, soloSinEnviar, sinEnviarDesde, seguidos]);

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
      {errorSeg && <p className="error">{errorSeg}</p>}

      {pedidos && Object.keys(pedidos).length > 0 && (
        <details className="pm-seguimiento">
          <summary>Pedidos a marcas sin recibir ({Object.keys(pedidos).length})
            {(["mal", "incorrecto"] as EstadoPedido[]).map(k => {
              const n = Object.values(pedidos).filter(x => x.estado === k).length;
              return n > 0 ? <span key={k} className={`pm-badge pm-estado-${k}`}>{n} {ESTADOS_PEDIDO[k].titulo.toLowerCase()}</span> : null;
            })}
          </summary>
          <p className="rf-suave">Cuando llegue un pedido, ponlo como «Recibido» y se quita.</p>
          <ul className="pm-pedidos">
            {Object.entries(pedidos).sort((a, b) => a[1].fecha.localeCompare(b[1].fecha)).map(([id, p]) => (
              <li key={id}>
                <div className="pm-pedido-cab">
                  <b>{p.marca}</b>
                  <span className="rf-suave">pedido el {diaHora(p.fecha)}</span>
                  <select className={`rc-select pm-estado pm-estado-${p.estado}`} value={p.estado} disabled={guardando}
                    onChange={e => enviar({ accion: "estado", id, estado: e.target.value })} aria-label={`Estado del pedido a ${p.marca}`}>
                    {(Object.keys(ESTADOS_PEDIDO) as EstadoPedido[]).map(k => <option key={k} value={k}>{ESTADOS_PEDIDO[k].titulo}</option>)}
                    <option value="recibido">Recibido (se quita)</option>
                  </select>
                </div>
                <details>
                  <summary className="rf-suave">{p.productos.length} producto{p.productos.length !== 1 ? "s" : ""}</summary>
                  <ul>{p.productos.map(x => <li key={x.id} className="rf-suave">{x.producto} · {x.propiedad} · {x.ean}</li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
      {resultado && "error" in resultado && <p className="error">{resultado.error}</p>}

      {r && (
        <>
          <div className="mp-cifras">
            <div><b>{miles(r.marcas.length)}</b><span>marcas con algo que pedir</span></div>
            <div><b>{miles(lineas)}</b><span>productos en la lista</span></div>
            <div><b>{miles(r.pedidosPendientes)}</b><span>pedidos sin enviar{r.pendDesde ? ` (el primero, del ${r.pendDesde.slice(0, 16)})` : ""}</span></div>
          </div>
          <p className="rf-suave pm-periodo">
            {soloSinEnviar
              ? <>Salen los productos de los pedidos que aún no se han enviado. El número de «-ventas» es lo vendido del <b>{r.desde || "—"}</b> al <b>{r.hasta || "—"}</b> ({miles(r.unidades)} uds. en {miles(r.pedidos)} pedidos): cuanto más largo el informe, más real.
                {r.antiguosSinEnviar > 0 && <> Hay {miles(r.antiguosSinEnviar)} pedidos sin enviar de antes del {r.sinEnviarDesde.split("-").reverse().join("/")} que no entran (suelen ser compras atascadas): cambia la fecha si quieres incluirlos.</>}</>
              : <>Salen todos los productos vendidos del <b>{r.desde || "—"}</b> al <b>{r.hasta || "—"}</b> ({miles(r.unidades)} uds. en {miles(r.pedidos)} pedidos).</>}
            {r.anulados > 0 && <> No cuento {miles(r.anulados)} líneas canceladas o devueltas.</>}
          </p>

          <div className="rf-filtros">
            <select className="rc-select" value={stockMax} onChange={e => setStockMax(Number(e.target.value))} aria-label="Qué stock entra">
              <option value={0}>Stock 0 o menos</option>
              <option value={1}>Stock 1 o menos</option>
              <option value={2}>Stock 2 o menos</option>
            </select>
            <label className="rf-check">
              <input type="checkbox" checked={soloSinEnviar} onChange={e => setSoloSinEnviar(e.target.checked)} />
              Solo pedidos sin enviar
            </label>
            {soloSinEnviar && (
              <label className="rf-check">
                desde el
                <input type="date" className="pm-fecha" value={r.sinEnviarDesde} onChange={e => setSinEnviarDesde(e.target.value)} />
              </label>
            )}
            <label className="rf-check">
              <input type="checkbox" checked={descatalogados} onChange={e => setDescatalogados(e.target.checked)} />
              Incluir descatalogados{r.descatalogados > 0 && !descatalogados ? ` (${r.descatalogados})` : ""}
            </label>
            <input type="search" placeholder="Buscar marca…" value={buscar} onChange={e => setBuscar(e.target.value)} />
            <button className="vp-revisar-btn pm-todo" disabled={!marcas.length}
              onClick={() => copiarTexto("*", marcas.map(m => textoMarca(m, estados)).filter(Boolean).join("\n\n"))}>
              {copiado === "*" ? "Copiado ✓" : "Copiar todas"}
            </button>
          </div>

          {r.marcas.length === 0 && <p className="rf-suave">{soloSinEnviar ? "En los pedidos sin enviar no hay nada que esté sin stock." : "No hay nada vendido en este periodo que esté sin stock."}</p>}

          <div className="pm-marcas">
            {marcas.map(m => (
              <section key={m.marca} className="pm-marca">
                <div className="pm-cab">
                  <h2>{m.marca}</h2>
                  <span className="rf-suave">{m.total} producto{m.total !== 1 ? "s" : ""}</span>
                  {(() => {
                    const texto = textoMarca(m, estados);
                    const sinPedir = m.grupos.flatMap(g => g.filas).filter(f => !estados[f.id]);
                    return <>
                      {sinPedir.length > 0 && pedidos && (
                        <button className="regen-btn" disabled={guardando} title="Apunta el pedido a esta marca para seguirlo hasta que llegue"
                          onClick={() => enviar({ accion: "crear", marca: m.marca, productos: sinPedir.map(f => ({ id: f.id, producto: f.producto, propiedad: f.propiedad, ean: f.ean })) })}>
                          Marcar como pedido
                        </button>
                      )}
                      <button className="copy-btn" disabled={!texto} onClick={() => copiarTexto(m.marca, texto)}>
                        {copiado === m.marca ? "Copiado ✓" : texto ? "Copiar" : "Todo pedido"}
                      </button>
                    </>;
                  })()}
                </div>
                {m.grupos.map(g => (
                  <div key={g.stock} className="pm-grupo">
                    <h3 className={g.stock < 0 ? "neg" : ""}>stock {g.stock}</h3>
                    <ul>
                      {g.filas.map(f => (
                        <li key={`${f.ean}|${f.producto}|${f.propiedad}`} className={estados[f.id] ? `pm-li-${estados[f.id]}` : ""}>
                          <span className="pm-prod">{f.producto}</span>
                          <span className="pm-dato">{f.propiedad}</span>
                          <span className="pm-dato pm-ean">{f.ean}</span>
                          <span className="pm-ventas">−ventas <b>{f.ventas}</b></span>
                          {f.sinPagar > 0 && <span className="pm-sinpagar">{AVISO_SIN_PAGAR} ({f.sinPagar} ud{f.sinPagar !== 1 ? "s" : ""}.)</span>}
                          {enPedido[f.id] && (
                            <span className={`pm-tag pm-estado-${enPedido[f.id].estado}`}>
                              {enPedido[f.id].estado === "esperando" ? "Pedido" : ESTADOS_PEDIDO[enPedido[f.id].estado].titulo} el {diaHora(enPedido[f.id].fecha)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>

          {r.caducados.length > 0 && (
            <details className="pm-aviso">
              <summary>Pedidos sin pagar de más de {DIAS_SIN_PAGAR} días: anúlalos en la tienda ({r.caducados.length})</summary>
              <p className="rf-suave">Aquí no cuentan como venta ni sacan productos para pedir. En la tienda siguen como pendientes y gastan stock: al anularlos allí, el stock se corrige.</p>
              <ul>
                {r.caducados.map(c => (
                  <li key={c.id}>Pedido {c.id}{c.codigo ? ` (${c.codigo})` : ""} · {c.fecha.slice(0, 16)} · {c.formaPago || "sin forma de pago"} · {c.total}</li>
                ))}
              </ul>
            </details>
          )}

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
            Entran los productos {soloSinEnviar ? "de los pedidos sin enviar" : "vendidos en el periodo del informe"} que tienen ahora un stock igual o menor que el elegido (STOCK ACTUAL del control de stocks).
            Se cruzan por EAN; los que no tienen EAN (packs, kits), por nombre y formato. Los de stock 0 que no se han vendido no salen.
            {r.enPacks > 0 && <> Los packs Dúo y Trío de un mismo producto cuentan como 2 y 3 unidades de ese producto ({miles(r.enPacks)} uds. en total).</>}
            {" "}Tras mandar el pedido a una marca, pulsa «Marcar como pedido»: esos productos ya no salen al copiar (para no pedirlos dos veces) y siguen en la lista con la etiqueta «Pedido» mientras tengan pedidos sin enviar.
            Si el pedido llega mal o no es el correcto, sus productos vuelven a salir al copiar con la nota. Al ponerlo como «Recibido» se quita; si con lo recibido el stock sigue sin cubrir los pedidos, el producto volverá a salir para pedir.
            {" "}Si un producto tiene pedidos sin enviar y sin pagar, sale con «{AVISO_SIN_PAGAR}»: su stock negativo puede deberse a una compra que no se ha completado.
            {r.sinControl > 0 && <> {r.sinControl} vendidos no tienen control de stock y no salen.</>}
            {" "}Las ventas son unidades e incluyen los pedidos pendientes de pago o envío.
          </p>
        </>
      )}
    </div>
  );
}
