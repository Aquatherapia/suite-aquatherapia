"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AVISO_SIN_PAGAR, DIAS_HISTORICO, DIAS_SIN_PAGAR, ESTADOS_PEDIDO, cruzar, leerCsv, ordenFecha, recortarStock, recortarVentas, lineasParaHistorico, textoMarca, type Compra, type EstadoPedido, type FilaPedido, type Historico, type MarcaPedido } from "./calculo";
import { leerXls } from "./leer-xls";

// Pedido mínimo a una marca: productos que tiene que juntar para salir en la lista
const MIN_PRODUCTOS_MARCA = 5;
import { Segmentos } from "../_google/ui";

type Archivo<T> = { nombre: string; filas: T } | null;
type Contacto = { email: string; whatsapp: string };
type Hist = Historico & { ids: string[] };
type Pedido = { marca: string; fecha: string; estado: EstadoPedido; productos: { id: string; producto: string; propiedad: string; ean: string; compras?: string[]; stock?: number; ventas?: number; pedir?: number }[]; hasta?: number };

const miles = (n: number) => n.toLocaleString("es-ES");
const diaTxt = (d: string) => d ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : "—";
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

// Preferencias de esta pantalla que se recuerdan en este navegador
function usePref<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(inicial);
  useEffect(() => {
    try { const g = localStorage.getItem(`pm-${clave}`); if (g !== null) setV(JSON.parse(g)); } catch { /* sin almacenamiento */ }
  }, [clave]);
  return [v, (n: T) => { setV(n); try { localStorage.setItem(`pm-${clave}`, JSON.stringify(n)); } catch { /* sin almacenamiento */ } }];
}

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

// «17/11/2026 07:21:56» → «17/11 07:21»
const fechaCorta = (s: string) => { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}(?:\s+(\d{1,2}:\d{2}))?/); return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}${m[3] ? " " + m[3] : ""}` : s; };

export default function PedidosMarcasPage() {
  const [ventas, setVentas] = useState<Archivo<string[][]>>(null);
  const [stock, setStock] = useState<Archivo<string[][]>>(null);
  const [error, setError] = useState("");
  const [stockMax, setStockMax] = usePref("stock-max", 1);
  const [soloSinEnviar, setSoloSinEnviar] = useState(true);
  const [sinEnviarDesde, setSinEnviarDesde] = useState("");
  const [buscar, setBuscar] = useState("");
  const [copiado, setCopiado] = useState("");
  const [encima, setEncima] = useState(false);
  const [pedidos, setPedidos] = useState<Record<string, Pedido> | null>(null);
  const [errorSeg, setErrorSeg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [contactos, setContactos] = useState<Record<string, Contacto>>({});
  const [editando, setEditando] = useState("");
  const [pestana, setPestana] = usePref<"pedir" | "recibir" | "historico">("pestana", "pedir");
  const [hist, setHist] = useState<Hist | null | undefined>(undefined);
  const [histMsg, setHistMsg] = useState("");
  const [usarHist, setUsarHist] = useState(true);
  const [cobertura, setCobertura] = usePref("cobertura", 14);
  const [conCantidad, setConCantidad] = usePref("con-cantidad", true);
  const [diasAviso, setDiasAviso] = usePref("dias-aviso", 7);

  useEffect(() => {
    fetch("/api/pedidos-marcas", { cache: "no-store" }).then(r => r.json()).then(v => {
      if (v.error) setErrorSeg(v.error); else { setPedidos(v.pedidos ?? {}); setContactos(v.contactos ?? {}); }
    }).catch(() => setErrorSeg("No se pudo cargar el seguimiento de pedidos."));
    fetch("/api/pedidos-marcas/archivos", { cache: "no-store" }).then(r => r.json()).then(v => {
      if (v.error) return;
      const cuando = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
      if (v.ventas?.filas?.length) setVentas(a => a ?? { nombre: `${v.ventas.nombre} (subido el ${cuando(v.ventas.fecha)})`, filas: v.ventas.filas });
      if (v.stock?.filas?.length) setStock(a => a ?? { nombre: `${v.stock.nombre} (subido el ${cuando(v.stock.fecha)})`, filas: v.stock.filas });
    }).catch(() => {});
    fetch("/api/pedidos-marcas/ventas", { cache: "no-store" }).then(r => r.json()).then(v => {
      if (v.error) { setHist(null); setHistMsg(v.error); } else setHist(v);
    }).catch(() => { setHist(null); setHistMsg("No se pudo leer el histórico de ventas guardado."); });
  }, []);

  // Suma al histórico guardado los pedidos del informe que aún no estaban (en tandas, para no mandar demasiado de golpe)
  async function guardarHistorico(filas: string[][], conocido: Hist | null | undefined) {
    const todos = lineasParaHistorico(filas);
    const ya = new Set(conocido?.ids ?? []);
    const nuevos = Object.entries(todos).filter(([id]) => !ya.has(id));
    if (!nuevos.length) { setHistMsg("Este informe no trae pedidos nuevos: ya estaban guardados."); return; }
    setHistMsg(`Guardando ${miles(nuevos.length)} pedidos nuevos en el histórico…`);
    let ultimo: Hist | null = null;
    let añadidos = 0;
    try {
      for (let i = 0; i < nuevos.length; i += 1500) {
        const r = await fetch("/api/pedidos-marcas/ventas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedidos: Object.fromEntries(nuevos.slice(i, i + 1500)) }) });
        const v = await r.json();
        if (v.error) throw new Error(v.error);
        ultimo = v;
        añadidos += v.añadidos ?? 0;
        setHistMsg(`Guardando en el histórico… ${miles(Math.min(i + 1500, nuevos.length))} de ${miles(nuevos.length)} pedidos`);
      }
      if (ultimo) setHist(ultimo);
      setHistMsg(`Añadidos ${miles(añadidos)} pedidos nuevos al histórico.`);
    } catch (e) {
      if (ultimo) setHist(ultimo);
      setHistMsg(`No se pudo guardar todo en el histórico: ${e instanceof Error ? e.message : String(e)}. Vuelve a subir el informe.`);
    }
  }

  async function borrarHistorico() {
    if (!window.confirm("¿Borrar todo el histórico de ventas guardado? Tendrás que volver a subir un informe largo.")) return;
    const r = await fetch("/api/pedidos-marcas/ventas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "borrar" }) });
    const v = await r.json();
    if (v.error) setHistMsg(v.error); else { setHist(v); setHistMsg("Histórico borrado."); }
  }

  async function enviar(cuerpo: object) {
    setGuardando(true);
    setErrorSeg("");
    try {
      const r = await fetch("/api/pedidos-marcas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const v = await r.json();
      if (v.error) setErrorSeg(v.error); else { setPedidos(v.pedidos ?? {}); setContactos(v.contactos ?? {}); }
    } catch {
      setErrorSeg("No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      setGuardando(false);
    }
  }

  // Cada producto que está en un pedido abierto, con el estado de ese pedido y su fecha
  const enPedido = useMemo(() => {
  // y las compras de clientes que ya cubre: por ID (marcado en la Suite), por hora (pedido pegado de WhatsApp: las de
  // hasta esa hora) o todas (pedido antiguo, sin compras apuntadas)
    const m: Record<string, { estado: EstadoPedido; fecha: string; ids: Set<string>; hasta: number; todo: boolean }> = {};
    for (const p of Object.values(pedidos ?? {}).sort((a, b) => a.fecha.localeCompare(b.fecha))) for (const x of p.productos) {
      const e = m[x.id] ?? { estado: p.estado, fecha: p.fecha, ids: new Set<string>(), hasta: 0, todo: false };
      e.estado = p.estado; e.fecha = p.fecha;
      if (p.hasta) e.hasta = Math.max(e.hasta, p.hasta);
      else if (x.compras) x.compras.forEach(c => e.ids.add(c));
      else e.todo = true;
      m[x.id] = e;
    }
    return m;
  }, [pedidos]);
  const seguidos = useMemo(() => new Set(Object.keys(enPedido)), [enPedido]);

  // Guarda en la Suite los archivos subidos (recortados), en partes de 1.500 filas
  async function guardarArchivo(campo: "ventas" | "stock", nombre: string, filas: string[][]) {
    const partes = Math.max(1, Math.ceil(filas.length / 1500));
    try {
      for (let i = 0; i < partes; i++) {
        const r = await fetch("/api/pedidos-marcas/archivos", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campo, nombre, parte: i, partes, filas: filas.slice(i * 1500, (i + 1) * 1500) }) });
        const v = await r.json();
        if (v.error) throw new Error(v.error);
      }
    } catch (e) {
      setError(`No se pudo guardar «${nombre}» en la Suite (al recargar habrá que subirlo otra vez): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function cargar(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    for (const f of Array.from(files)) {
      const n = f.name.toLowerCase();
      try {
        if (n.endsWith(".xls") || n.endsWith(".xlsx")) {
          if (n.endsWith(".xlsx")) throw new Error("El informe de ventas tiene que ser el .xls tal cual lo descarga la tienda (no un .xlsx guardado de nuevo).");
          const filas = leerXls(await f.arrayBuffer());
          setVentas({ nombre: f.name, filas });
          if (hist !== null) guardarHistorico(filas, hist);
          guardarArchivo("ventas", f.name, recortarVentas(filas));
        } else if (n.endsWith(".csv") || n.endsWith(".txt")) {
          const filas = leerCsv(await textoDe(f));
          setStock({ nombre: f.name, filas });
          guardarArchivo("stock", f.name, recortarStock(filas));
        } else throw new Error(`«${f.name}»: sube el informe de ventas (.xls) y el control de stocks (.csv).`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const resultado = useMemo(() => {
    if (!ventas || !stock) return null;
    try { return cruzar(ventas.filas, stock.filas, {
      stockMax, incluirDescatalogados: false, soloSinEnviar, sinEnviarDesde, seguidos, diasCobertura: cobertura,
      historico: usarHist && hist && hist.pedidos ? hist : undefined,
    }); }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [ventas, stock, stockMax, soloSinEnviar, sinEnviarDesde, seguidos, cobertura, usarHist, hist]);

  const marcas: MarcaPedido[] = useMemo(() => (!resultado || "error" in resultado ? [] : resultado.marcas), [resultado]);

  // Compras de clientes que han llegado después de pedir el producto a la marca: el producto vuelve a salir para pedirlo
  const nuevas = (f: FilaPedido): Compra[] => {
    const e = enPedido[f.id];
    if (!e) return f.compras;
    return e.todo ? [] : f.compras.filter(c => !e.ids.has(c.id) && !(e.hasta && ordenFecha(c.fecha) <= e.hasta));
  };
  // Estado de cada producto a la vista: «esperando» solo si el pedido cubre todas sus compras pendientes
  const estados = useMemo(() => {
    const out: Record<string, EstadoPedido> = {};
    for (const m of marcas) for (const g of m.grupos) for (const f of g.filas) {
      const e = enPedido[f.id];
      if (e && !(e.estado === "esperando" && nuevas(f).length)) out[f.id] = e.estado;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, enPedido]);
  // Lo ya pedido (y esperando) pasa a «Sin recibir» y deja de salir aquí. Si vuelve a salir por compras nuevas,
  // se piden solo las unidades nuevas.
  const marcasPend: MarcaPedido[] = useMemo(() => marcas.map(m => {
    const grupos: MarcaPedido["grupos"] = m.grupos.map(g => ({ ...g, filas: g.filas.filter(f => estados[f.id] !== "esperando").map(f => {
      const e = enPedido[f.id];
      if (!e || e.estado !== "esperando") return f;
      const n = nuevas(f);
      return n.length ? { ...f, pedir: Math.max(1, Math.ceil(n.reduce((t, c) => t + c.q, 0))) } : f;
    }) })).filter(g => g.filas.length);
    let total = grupos.reduce((t, g) => t + g.filas.length, 0);
    // Si hay algo en negativo, el pedido se hace sí o sí: se completa hasta el mínimo con otros productos de la marca
    // que tienen ventas, de menos a más stock (2, 3, 4…)
    if (total > 0 && total < MIN_PRODUCTOS_MARCA && grupos.some(g => g.stock < 0)) {
      const ya = new Set(grupos.flatMap(g => g.filas.map(f => f.id)));
      for (const f of m.relleno) {
        if (total >= MIN_PRODUCTOS_MARCA) break;
        if (ya.has(f.id) || enPedido[f.id]?.estado === "esperando") continue;
        ya.add(f.id);
        const g = grupos.find(x => x.relleno && x.stock === f.stock);
        if (g) g.filas.push(f); else grupos.push({ stock: f.stock, filas: [f], relleno: true });
        total++;
      }
    }
    return { ...m, grupos, total };
  }).filter(m => m.total > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [marcas, enPedido, estados]);
  const marcasVista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? marcasPend.filter(m => m.marca.includes(q)) : marcasPend;
  }, [marcasPend, buscar]);
  // Pedido mínimo: una marca sale para pedir cuando junta al menos 5 productos, o si tiene algo en negativo (aunque no
  // llegue a 5 con lo que tiene); las demás esperan en una lista aparte
  const sePide = (m: MarcaPedido) => m.total >= MIN_PRODUCTOS_MARCA || m.grupos.some(g => g.stock < 0);
  const listas = marcasVista.filter(sePide);
  const pocas = marcasVista.filter(m => !sePide(m));
  const nListas = marcasPend.filter(sePide).length;
  const aPedido = (f: FilaPedido) => ({ id: f.id, producto: f.producto, propiedad: f.propiedad, ean: f.ean, compras: f.compras.map(c => c.id), stock: f.stock, ventas: f.ventas, pedir: f.pedir });

  async function copiarTexto(id: string, texto: string) {
    if (await copiar(texto)) { setCopiado(id); setTimeout(() => setCopiado(c => (c === id ? "" : c)), 2000); }
    else setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
  }

  const r = resultado && !("error" in resultado) ? resultado : null;
  const lineas = marcasPend.reduce((n, m) => n + m.total, 0);

  const tarjeta = (m: MarcaPedido) => (
              <section key={m.marca} className="pm-marca">
                <div className="pm-cab">
                  <h2>{m.marca}</h2>
                  <span className="rf-suave">{m.total} producto{m.total !== 1 ? "s" : ""}</span>
                  {(() => {
                    const texto = textoMarca(m, estados, conCantidad);
                    const sinPedir = m.grupos.flatMap(g => g.filas).filter(f => !estados[f.id]);
                    return <>
                      {sinPedir.length > 0 && pedidos && (
                        <button className="regen-btn" disabled={guardando} title="Apunta el pedido a esta marca para seguirlo hasta que llegue"
                          onClick={() => enviar({ accion: "crear", marca: m.marca, productos: sinPedir.map(aPedido) })}>
                          Marcar como pedido
                        </button>
                      )}
                      <button className="copy-btn" disabled={!texto} onClick={() => copiarTexto(m.marca, texto)}>
                        {copiado === m.marca ? "Copiado ✓" : texto ? "Copiar" : "Todo pedido"}
                      </button>
                      {texto && (contactos[m.marca]?.email || contactos[m.marca]?.whatsapp) ? (() => {
                        const c = contactos[m.marca];
                        const marcar = () => { if (sinPedir.length) enviar({ accion: "crear", marca: m.marca, productos: sinPedir.map(aPedido) }); };
                        const asunto = `Pedido La Tienda de Cosméticos ${new Date().toLocaleDateString("es-ES")}`;
                        return <>
                          {c.email && <a className="copy-btn pm-enviar" href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`} onClick={marcar}>Email</a>}
                          {c.whatsapp && <a className="copy-btn pm-enviar" href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" onClick={marcar}>WhatsApp</a>}
                        </>;
                      })() : null}
                      {pedidos && <button className="regen-btn" onClick={() => setEditando(editando === m.marca ? "" : m.marca)} title="Email y WhatsApp de la marca">
                        {contactos[m.marca] ? "✎" : "+ contacto"}
                      </button>}
                    </>;
                  })()}
                </div>
                {editando === m.marca && (
                  <form className="pm-contacto" onSubmit={e => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    enviar({ accion: "contacto", marca: m.marca, email: d.get("email"), whatsapp: d.get("whatsapp") });
                    setEditando("");
                  }}>
                    <input name="email" type="email" placeholder="Email de pedidos de la marca" defaultValue={contactos[m.marca]?.email ?? ""} />
                    <input name="whatsapp" type="tel" placeholder="WhatsApp (con prefijo, p. ej. 34600111222)" defaultValue={contactos[m.marca]?.whatsapp ?? ""} />
                    <button type="submit" className="vp-revisar-btn" disabled={guardando}>Guardar</button>
                  </form>
                )}
                {m.grupos.map((g, i) => (
                  <div key={`${g.relleno ? "r" : ""}${g.stock}`} className="pm-grupo">
                    {g.relleno && !m.grupos[i - 1]?.relleno && <p className="pm-relleno-titulo">Para llegar al pedido mínimo de {MIN_PRODUCTOS_MARCA} productos</p>}
                    <h3 className={g.stock < 0 ? "neg" : ""}>stock {g.stock}</h3>
                    <ul>
                      {g.filas.map(f => (
                        <li key={`${f.ean}|${f.producto}|${f.propiedad}`} className={estados[f.id] ? `pm-li-${estados[f.id]}` : ""}>
                          <span className="pm-prod">{f.producto}</span>
                          <span className="pm-dato">{f.propiedad}</span>
                          <span className="pm-dato pm-ean">{f.ean}</span>
                          <span className="pm-ventas">−ventas <b>{f.ventas}</b> · pedir <b className="pm-pedir">{f.pedir}</b></span>
                          {f.compras.length > 0 && (
                            <span className="pm-compras">
                              Compra{f.compras.length > 1 ? "s" : ""} del cliente:{" "}
                              {f.compras.map((c, i) => (
                                <span key={i} className={c.pagada ? "" : "pm-compra-sinpagar"}>{i > 0 ? ", " : ""}{fechaCorta(c.fecha)}{c.pagada ? "" : " (sin pagar)"}</span>
                              ))}
                            </span>
                          )}
                          {f.sinPagar > 0 && <span className="pm-sinpagar">{AVISO_SIN_PAGAR} ({f.sinPagar} ud{f.sinPagar !== 1 ? "s" : ""}.)</span>}
                          {enPedido[f.id] && (
                            <span className={`pm-tag pm-estado-${enPedido[f.id].estado}`}>
                              {enPedido[f.id].estado === "esperando" ? "Pedido" : ESTADOS_PEDIDO[enPedido[f.id].estado].titulo} el {diaHora(enPedido[f.id].fecha)}
                            </span>
                          )}
                          {enPedido[f.id]?.estado === "esperando" && nuevas(f).length > 0 && (
                            <span className="pm-tag pm-nuevas">
                              {nuevas(f).length === 1 ? "1 compra nueva" : `${nuevas(f).length} compras nuevas`} después del pedido: hay que pedir{nuevas(f).length === 1 ? "la" : "las"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
  );

  return (
    <div className="wrap rf pm">
      <Link href="/" className="volver-link">← Volver</Link>
      <header>
        <h1>Pedidos a las marcas</h1>
        <p className="subtitle">
          Cada día, sube el informe de ventas del día (COMPRAS_….xls) y el control de stocks (control_stocks-….csv) de la tienda.
          Sale, marca por marca, lo que se ha quedado sin stock en los pedidos sin enviar, con lo que hay que pedir, listo para mandar.
          De las ventas solo se guarda en la Suite cuánto se vende de cada producto y cada día (sin datos de clientes); el stock no se guarda.
        </p>
      </header>

      <Segmentos
        opciones={[
          { valor: "pedir" as const, nombre: `Para pedir${r ? ` (${nListas})` : ""}` },
          { valor: "recibir" as const, nombre: `Sin recibir${pedidos ? ` (${Object.keys(pedidos).length})` : ""}` },
          { valor: "historico" as const, nombre: "Histórico de ventas" },
        ]}
        valor={pestana}
        onChange={setPestana}
      />

      {error && <p className="error">{error}</p>}
      {errorSeg && <p className="error">{errorSeg}</p>}

      {pestana === "recibir" && pedidos && Object.keys(pedidos).length === 0 && <p className="rf-suave pm-vacio">No hay pedidos a marcas pendientes de recibir.</p>}
      {pestana === "recibir" && pedidos && Object.keys(pedidos).length > 0 && (
        <section className="pm-seguimiento">
          <h2 className="pm-seg-titulo">Pedidos a marcas sin recibir ({Object.keys(pedidos).length})
            {(() => { const n = Object.values(pedidos).filter(x => diasDesde(x.fecha) > diasAviso).length; return n > 0 ? <span className="pm-badge pm-estado-mal">{n} con más de {diasAviso} días</span> : null; })()}
            {(["mal", "incorrecto"] as EstadoPedido[]).map(k => {
              const n = Object.values(pedidos).filter(x => x.estado === k).length;
              return n > 0 ? <span key={k} className={`pm-badge pm-estado-${k}`}>{n} {ESTADOS_PEDIDO[k].titulo.toLowerCase()}</span> : null;
            })}
          </h2>
          <p className="rf-suave">
            Cuando llegue un pedido, ponlo como «Recibido» y se quita. Se marcan en rojo los que llevan más de
            <input type="number" min={1} max={60} className="pm-dias" value={diasAviso} onChange={e => setDiasAviso(Math.max(1, Number(e.target.value) || 7))} aria-label="Días para avisar" />
            días sin llegar.
          </p>
          <ul className="pm-pedidos">
            {Object.entries(pedidos).sort((a, b) => a[1].fecha.localeCompare(b[1].fecha)).map(([id, p]) => (
              <li key={id}>
                <div className="pm-pedido-cab">
                  <b>{p.marca}</b>
                  <span className={diasDesde(p.fecha) > diasAviso ? "pm-tarde" : "rf-suave"}>pedido el {diaHora(p.fecha)}{diasDesde(p.fecha) > diasAviso ? ` · lleva ${diasDesde(p.fecha)} días: reclámalo` : ""}</span>
                  <select className={`rc-select pm-estado pm-estado-${p.estado}`} value={p.estado} disabled={guardando}
                    onChange={e => enviar({ accion: "estado", id, estado: e.target.value })} aria-label={`Estado del pedido a ${p.marca}`}>
                    {(Object.keys(ESTADOS_PEDIDO) as EstadoPedido[]).map(k => <option key={k} value={k}>{ESTADOS_PEDIDO[k].titulo}</option>)}
                    <option value="recibido">Recibido (se quita)</option>
                  </select>
                </div>
                <details>
                  <summary className="rf-suave">{p.productos.length} producto{p.productos.length !== 1 ? "s" : ""}</summary>
                  <ul className="pm-ped-prods">{p.productos.map(x => (
                    <li key={x.id}>
                      <span className="rf-suave">{x.producto} · {x.propiedad} · {x.ean}</span>
                      {(x.stock !== undefined || x.ventas !== undefined || x.pedir !== undefined) && (
                        <span className="pm-ped-datos">
                          {x.stock !== undefined && <span className={x.stock < 0 ? "neg" : ""}>stock {x.stock}</span>}
                          {x.ventas !== undefined && <span>−ventas <b>{x.ventas}</b></span>}
                          {x.pedir !== undefined && <span>pedido <b>{x.pedir}</b></span>}
                        </span>
                      )}
                    </li>
                  ))}</ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pestana === "historico" && (
        <div className="pm-hist">
        {hist === undefined && <span className="rf-suave">Leyendo el histórico de ventas…</span>}
        {hist && hist.pedidos > 0 && (
          <span className="rf-suave">
            <b>Histórico de ventas guardado:</b> {miles(hist.pedidos)} pedidos del {diaTxt(hist.desde)} al {diaTxt(hist.hasta)}. «-ventas» cuenta los últimos {Math.round(DIAS_HISTORICO / 30.5)} meses.
          </span>
        )}
        {hist && !hist.pedidos && <span className="rf-suave"><b>Aún no hay histórico de ventas.</b> La primera vez, sube un informe de los últimos 6 meses; después basta con el del día.</span>}
        {histMsg && <span className="rf-suave">{histMsg}</span>}
        {hist && hist.pedidos > 0 && (
          <span className="pm-hist-opc">
            <label className="rf-check"><input type="checkbox" checked={usarHist} onChange={e => setUsarHist(e.target.checked)} /> Usar el histórico</label>
            <button className="regen-btn" onClick={borrarHistorico}>Borrar histórico</button>
          </span>
        )}
      </div>

      )}

      {pestana === "pedir" && <>
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

      {histMsg && <p className="rf-suave">{histMsg}</p>}
      {resultado && "error" in resultado && <p className="error">{resultado.error}</p>}

      {r && (
        <>
          <div className="mp-cifras">
            <div><b>{miles(nListas)}</b><span>marcas para pedir ({MIN_PRODUCTOS_MARCA} productos o más, o algo en negativo)</span></div>
            <div><b>{miles(lineas)}</b><span>productos en la lista</span></div>
            <div><b>{miles(r.pedidosPendientes)}</b><span>pedidos sin enviar{r.pendDesde ? ` (el primero, del ${r.pendDesde.slice(0, 16)})` : ""}</span></div>
          </div>
          <p className="rf-suave pm-periodo">
            {soloSinEnviar
              ? <>Salen los productos de los pedidos que aún no se han enviado. El número de «-ventas» es lo vendido del <b>{r.desde || "—"}</b> al <b>{r.hasta || "—"}</b> ({miles(r.unidades)} uds.{r.usaHistorico ? ", del histórico guardado" : `, de este informe: cuanto más largo, más real`}).
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
            <select className="rc-select" value={cobertura} onChange={e => setCobertura(Number(e.target.value))} aria-label="Días de venta que cubre el pedido">
              {[7, 14, 21, 30, 45].map(d => <option key={d} value={d}>Pedir para {d} días</option>)}
            </select>
            <label className="rf-check">
              <input type="checkbox" checked={conCantidad} onChange={e => setConCantidad(e.target.checked)} />
              Cantidad al copiar
            </label>
            <input type="search" placeholder="Buscar marca…" value={buscar} onChange={e => setBuscar(e.target.value)} />
            <button className="vp-revisar-btn pm-todo" disabled={!listas.length}
              onClick={() => copiarTexto("*", listas.map(m => textoMarca(m, estados, conCantidad)).filter(Boolean).join("\n\n"))}>
              {copiado === "*" ? "Copiado ✓" : "Copiar todas"}
            </button>
          </div>

          {marcasPend.length === 0 && <p className="rf-suave">{r.marcas.length ? "Todo lo que hay que pedir ya está pedido: lo tienes en «Sin recibir»." : soloSinEnviar ? "En los pedidos sin enviar no hay nada que esté sin stock." : "No hay nada vendido en este periodo que esté sin stock."}</p>}

          <div className="pm-marcas">
            {listas.map(tarjeta)}
          </div>

          {pocas.length > 0 && (
            <details className="pm-aviso pm-pocas">
              <summary>Marcas que aún no llegan al pedido mínimo de {MIN_PRODUCTOS_MARCA} productos y no tienen nada en negativo ({pocas.length})</summary>
              <p className="rf-suave">Se quedan aquí hasta que junten {MIN_PRODUCTOS_MARCA} productos que pedir. Si alguna corre prisa, puedes pedirla igual desde aquí.</p>
              <div className="pm-marcas">{pocas.map(tarjeta)}</div>
            </details>
          )}

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
            {" "}Tras mandar el pedido a una marca, pulsa «Marcar como pedido»: esos productos pasan a «Sin recibir» y dejan de salir aquí, salvo que entre una compra nueva después. Los archivos subidos se quedan guardados: al recargar no hace falta volver a subirlos.
            Si el pedido llega mal o no es el correcto, sus productos vuelven a salir al copiar con la nota. Al ponerlo como «Recibido» se quita; si con lo recibido el stock sigue sin cubrir los pedidos, el producto volverá a salir para pedir.
            {" "}Si un producto tiene pedidos sin enviar y sin pagar, sale con «{AVISO_SIN_PAGAR}»: su stock negativo puede deberse a una compra que no se ha completado.
            {r.sinControl > 0 && <> {r.sinControl} vendidos no tienen control de stock y no salen.</>}
            {" "}No salen los descatalogados{r.descatalogados > 0 ? ` (${r.descatalogados})` : ""} ni los que tienen una sola venta y aún les queda stock{r.unaVenta > 0 ? ` (${r.unaVenta})` : ""}.
            {" "}Una marca sale para pedir cuando junta {MIN_PRODUCTOS_MARCA} productos o más (pedido mínimo). Si tiene algo en negativo se pide siempre: si no llega a {MIN_PRODUCTOS_MARCA}, se completa con otros productos suyos con ventas, de menos a más stock. Las demás esperan en la lista plegada.
            {" "}«Pedir» = lo que falta para cubrir el stock negativo más la venta media de {cobertura} días ({r.diasPeriodo} días de ventas), y como mínimo 1.
            {" "}Al mandar el pedido por email o WhatsApp desde aquí, se marca como pedido solo.
            {" "}Los pedidos sin pagar de más de {DIAS_SIN_PAGAR} días se dan por anulados: no cuentan como venta. Las ventas son unidades.
          </p>
        </>
      )}
      </>}
    </div>
  );
}
