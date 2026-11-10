"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GRUPOS, TITULO, type Pasada, type ProblemaVista, type Tipo } from "./tipos";

type Vista = {
  problemas: ProblemaVista[];
  feed: { fecha: string; fichas: number; filas: number } | null;
  pasada: Pasada | null;
  enCurso: boolean;
  hayNuevos: boolean;
  error?: string;
};

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const miles = (n: number) => n.toLocaleString("es-ES");
const POR_TIPO = 50;

export default function RevisarFichasPage() {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<Tipo>>(new Set());
  const [todos, setTodos] = useState<Set<Tipo>>(new Set());
  const [lanzando, setLanzando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/revisar-fichas", { cache: "no-store" });
      setVista(await r.json());
    } catch {
      setError("No se pudo cargar la revisión. Vuelve a intentarlo en un momento.");
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  // Mientras se revisa, la página se pone al día sola cada 15 s
  useEffect(() => {
    if (!vista?.enCurso) return;
    const t = setInterval(cargar, 15_000);
    return () => clearInterval(t);
  }, [vista?.enCurso, cargar]);

  async function revisar() {
    setLanzando(true);
    setError("");
    try {
      const r = await fetch("/api/revisar-fichas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revisar" }) });
      const v = await r.json();
      if (v.error) setError(v.error); else setVista(v);
    } catch {
      setError("No se pudo empezar la revisión.");
    } finally {
      setLanzando(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (vista?.problemas ?? []).filter(p =>
      (!soloNuevos || p.nuevo) &&
      (!q || p.nombre.toLowerCase().includes(q) || (p.marca ?? "").toLowerCase().includes(q) || p.url.toLowerCase().includes(q)));
  }, [vista, buscar, soloNuevos]);

  const porTipo = useMemo(() => {
    const m = new Map<Tipo, ProblemaVista[]>();
    for (const p of filtrados) m.set(p.tipo, [...(m.get(p.tipo) ?? []), p]);
    for (const l of m.values()) l.sort((a, b) => Number(!!b.nuevo) - Number(!!a.nuevo) || (a.marca ?? "").localeCompare(b.marca ?? "") || a.nombre.localeCompare(b.nombre));
    return m;
  }, [filtrados]);

  const nuevos = vista?.problemas.filter(p => p.nuevo).length ?? 0;
  const p = vista?.pasada;
  const alternar = (set: Set<Tipo>, t: Tipo) => { const n = new Set(set); if (n.has(t)) n.delete(t); else n.add(t); return n; };

  return (
    <div className="wrap rf">
      <Link href="/" className="volver-link">← Volver</Link>
      <header>
        <h1>Revisar fichas de nuestra web</h1>
        <p className="subtitle">
          Cada mañana se revisan todas las fichas de latiendadecosmeticos.com y salen las que tienen algún problema:
          precio, EAN, descripción, meta, y las desactivadas que siguen en Google.
        </p>
      </header>

      <section className="rf-estado">
        <div className="rf-estado-txt">
          {!vista && <span>Cargando…</span>}
          {vista && !p && <span>Todavía no se ha revisado nunca. Pulsa «Revisar ahora»: tarda unos 25 minutos y puedes cerrar la página.</span>}
          {vista && p && vista.enCurso && (
            <>
              <span><span className="spinner spinner-dark" /> Revisando: <b>{miles(p.hechas)}</b> de {p.total ? miles(p.total) : "…"} fichas abiertas</span>
              <div className="rf-barra"><div style={{ width: `${p.total ? Math.round((p.hechas / p.total) * 100) : 2}%` }} /></div>
              <span className="rf-suave">Los problemas del feed ya están abajo. Puedes cerrar la página: la revisión sigue sola.</span>
            </>
          )}
          {vista && p && !vista.enCurso && p.fin && !p.error && (
            <span>Revisada el <b>{fecha(p.fin)}</b> ({p.origen === "cron" ? "revisión de la mañana" : "a mano"}) · {miles(p.total)} fichas abiertas{vista.feed ? ` · ${miles(vista.feed.fichas)} activas en el feed` : ""}</span>
          )}
          {vista && p && !vista.enCurso && p.fin && !p.error && (p.sinComprobar ?? 0) > 0 && (
            <span className="rf-suave">{miles(p.sinComprobar!)} fichas no respondieron a tiempo: de esas se muestra lo de la revisión anterior.</span>
          )}
          {vista && p && !vista.enCurso && !p.fin && (
            <span>La última revisión se cortó en {miles(p.hechas)} de {miles(p.total)} fichas. Pulsa «Revisar ahora» para hacer una completa.</span>
          )}
          {p?.error && <span className="error" style={{ margin: 0 }}>{p.error}</span>}
        </div>
        <div className="rf-botones">
          <button className="vp-revisar-btn" onClick={revisar} disabled={!vista || vista.enCurso || lanzando}>
            {vista?.enCurso ? "Revisando…" : lanzando ? "Empezando…" : "Revisar ahora"}
          </button>
          <button className="regen-btn" disabled={!filtrados.length}
            onClick={() => descargarExcel(filtrados).catch(e => setError(e instanceof Error ? e.message : String(e)))}>
            Excel
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {vista && vista.problemas.length > 0 && (
        <>
          <div className="rf-filtros">
            <input type="search" id="rf-buscar" placeholder="Buscar marca o producto…" value={buscar} onChange={e => setBuscar(e.target.value)} />
            {vista.hayNuevos && (
              <label className="rf-check">
                <input type="checkbox" id="rf-nuevos" checked={soloNuevos} onChange={e => setSoloNuevos(e.target.checked)} />
                Solo los nuevos de la última revisión ({miles(nuevos)})
              </label>
            )}
          </div>

          <div className="rf-resumen">
            {GRUPOS.flatMap(g => g.tipos).map(t => {
              const n = porTipo.get(t.tipo)?.length ?? 0;
              const nn = porTipo.get(t.tipo)?.filter(x => x.nuevo).length ?? 0;
              return (
                <a key={t.tipo} href={`#${t.tipo}`} className={`rf-chip${n ? "" : " rf-chip-cero"}`}
                  onClick={() => setAbiertos(s => new Set(s).add(t.tipo))}>
                  <b>{miles(n)}</b> {t.titulo}{nn > 0 && <span className="vp-pill vp-pill-nuevo">{nn} nuevo{nn !== 1 ? "s" : ""}</span>}
                </a>
              );
            })}
          </div>

          {GRUPOS.map(g => (
            <section key={g.nombre} className="rf-grupo">
              <h2>{g.nombre}</h2>
              {g.tipos.map(t => {
                const lista = porTipo.get(t.tipo) ?? [];
                const abierto = abiertos.has(t.tipo);
                const visibles = todos.has(t.tipo) ? lista : lista.slice(0, POR_TIPO);
                return (
                  <div key={t.tipo} id={t.tipo} className="rf-tipo">
                    <button className="rf-tipo-cab" onClick={() => setAbiertos(s => alternar(s, t.tipo))} aria-expanded={abierto}>
                      <span className="vp-chevron">{abierto ? "▼" : "▶"}</span>
                      <span className="rf-tipo-titulo">{t.titulo}</span>
                      <span className={`rf-num${lista.length ? "" : " rf-num-cero"}`}>{miles(lista.length)}</span>
                    </button>
                    {abierto && (
                      <div className="rf-tipo-cuerpo">
                        <p className="rf-suave">{t.ayuda}</p>
                        {lista.length === 0 && <p className="rf-suave">Ninguna. 👍</p>}
                        <ul className="rf-lista">
                          {visibles.map(x => (
                            <li key={`${x.url}|${x.nombre}|${x.detalle ?? ""}`}>
                              <a href={x.url} target="_blank" rel="noreferrer">{x.nombre}</a>
                              {x.nuevo && <span className="vp-pill vp-pill-nuevo">Nuevo</span>}
                              <div className="rf-suave">{[x.marca, x.detalle].filter(Boolean).join(" · ")}</div>
                            </li>
                          ))}
                        </ul>
                        {lista.length > visibles.length && (
                          <button className="regen-btn" onClick={() => setTodos(s => new Set(s).add(t.tipo))}>
                            Ver las {miles(lista.length)}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// Una hoja con todos los problemas (los que se ven con el filtro puesto), para pasarla a quien los arregla
async function descargarExcel(problemas: ProblemaVista[]) {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "La Tienda de Cosméticos";
  const ws = wb.addWorksheet("Fichas con problemas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Grupo", key: "grupo", width: 12 },
    { header: "Problema", key: "problema", width: 34 },
    { header: "Marca", key: "marca", width: 22 },
    { header: "Producto", key: "producto", width: 60 },
    { header: "Detalle", key: "detalle", width: 34 },
    { header: "Nuevo", key: "nuevo", width: 8 },
    { header: "Ficha", key: "ficha", width: 60 },
  ];
  const grupoDe = new Map(GRUPOS.flatMap(g => g.tipos.map(t => [t.tipo, g.nombre] as const)));
  const orden = new Map(GRUPOS.flatMap(g => g.tipos).map((t, i) => [t.tipo, i]));
  const filas = [...problemas].sort((a, b) => orden.get(a.tipo)! - orden.get(b.tipo)! || (a.marca ?? "").localeCompare(b.marca ?? "") || a.nombre.localeCompare(b.nombre));
  for (const p of filas) {
    ws.addRow({ grupo: grupoDe.get(p.tipo), problema: TITULO[p.tipo], marca: p.marca ?? "", producto: p.nombre, detalle: p.detalle ?? "", nuevo: p.nuevo ? "Sí" : "", ficha: { text: p.url, hyperlink: p.url } });
  }
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1270B6" } };
  ws.autoFilter = { from: "A1", to: "G1" };
  ws.getColumn("ficha").font = { color: { argb: "FF1270B6" }, underline: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fichas_con_problemas_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
