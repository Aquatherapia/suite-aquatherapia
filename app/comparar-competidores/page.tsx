"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { COMPETIDORES, type FilaComp, type ResultadoComp, type EstadoComp } from "./competidores";

type Marca = { nombre: string; slug: string };
type Config = {
  marcas: Marca[];
  enlaces: Record<string, Record<string, string>>;
  resultados: Record<string, ResultadoComp>;
};

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = (x: number) => (x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " %";

function fechaExacta(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })} a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

// El competidor más barato de una fila (si hay alguno)
function masBarato(f: FilaComp): { id: string; precio: number } | null {
  let mejor: { id: string; precio: number } | null = null;
  for (const c of COMPETIDORES) {
    const p = f.precios[c.id];
    if (p && (!mejor || p.precio < mejor.precio)) mejor = { id: c.id, precio: p.precio };
  }
  return mejor;
}

function TablaCompetencia({ filas, estados }: { filas: FilaComp[]; estados: Record<string, EstadoComp> }) {
  // Solo las columnas de los competidores que venden la marca
  const cols = COMPETIDORES.filter(c => estados[c.id]?.url || filas.some(f => f.precios[c.id]));
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe cc-tabla">
        <thead>
          <tr className="cp-informe-grupos">
            <th colSpan={2}></th>
            <th colSpan={2} className="cp-g-nos">La Tienda de Cosméticos</th>
            {cols.map(c => <th key={c.id} colSpan={2} style={{ background: c.fondo, color: c.color }}>{c.nombre}</th>)}
            <th colSpan={2} className="cp-g-fin">Comparación</th>
          </tr>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th>PVP</th><th>Precio final</th>
            {cols.map(c => [
              <th key={`${c.id}-pvp`} style={{ background: c.color }}>PVP</th>,
              <th key={`${c.id}-precio`} style={{ background: c.color }}>Precio final</th>,
            ])}
            <th className="cp-h-fin">Más barato</th>
            <th className="cp-h-fin cp-tip" data-tip="Precio del competidor más barato menos el nuestro: en negativo, alguien vende más barato que nosotros">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const mb = masBarato(f);
            const diff = mb ? mb.precio - f.precio : null;
            const ganamos = diff != null && diff >= -0.005;
            return (
              <tr key={i}>
                <td className="cp-suave">{f.ean ?? ""}</td>
                <td className="cp-izq"><a href={f.url} target="_blank" rel="noreferrer" className="cp-prod">{f.nombre}</a></td>
                <td className="cp-azul">{eur(f.pvp)}</td>
                <td className="cp-fuerte cp-azul">{eur(f.precio)}{f.pvp - f.precio > 0.005 && <small className="cp-dto-celda">−{pct(1 - f.precio / f.pvp)}</small>}</td>
                {cols.map(c => {
                  const p = f.precios[c.id];
                  if (!p) return [<td key={`${c.id}-pvp`} className="cp-vacia">—</td>, <td key={`${c.id}-precio`} className="cp-vacia">—</td>];
                  const pvp = p.pvp ?? p.precio;
                  const masBaratoQueNos = p.precio < f.precio - 0.005;
                  const tip = `${p.titulo}${p.por !== "ean" ? ` · emparejado por ${p.por}` : ""}`;
                  return [
                    <td key={`${c.id}-pvp`} style={{ color: c.color }} title={tip}>{eur(pvp)}</td>,
                    <td key={`${c.id}-precio`} className="cp-fuerte" style={{ color: c.color }} title={tip}>
                      {masBaratoQueNos && <span className="cc-baja" title="Más barato que nosotros">▼</span>}
                      <a href={p.url} target="_blank" rel="noreferrer" className="cc-precio">{eur(p.precio)}</a>
                      {p.por !== "ean" && <span className="cc-por" title={`Emparejado por ${p.por}: a una de las dos fichas le falta el EAN`}>≈</span>}
                      {pvp - p.precio > 0.005 && <small className="cp-dto-celda">−{pct(1 - p.precio / pvp)}</small>}
                    </td>,
                  ];
                })}
                <td className={"cp-izq cp-fuerte " + (mb == null ? "cp-suave" : ganamos ? "cp-azul" : "")} style={mb && !ganamos ? { color: COMPETIDORES.find(c => c.id === mb.id)?.color } : undefined}>
                  {mb == null ? "—" : ganamos ? "La Tienda de Cosméticos" : COMPETIDORES.find(c => c.id === mb.id)?.corto}
                </td>
                <td className={"cp-fuerte " + (diff == null ? "cp-suave" : diff < -0.005 ? "cp-rojo" : "cp-verde")}>
                  {diff == null ? "—" : `${diff > 0.005 ? "+" : ""}${eur(diff)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EnlaceComp({ id, estado, enlace, nuestros, enlazados, onGuardar }: { id: string; estado?: EstadoComp; enlace?: string; nuestros?: number; enlazados?: number; onGuardar: (url: string) => void }) {
  const deNuestros = `${enlazados ?? estado?.emparejados ?? 0} de nuestros ${nuestros ?? "?"} enlazados`;
  const c = COMPETIDORES.find(x => x.id === id)!;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(enlace ?? "");
  const noVende = enlace === "";
  return (
    <div className="cc-enlace">
      <span className="cc-enlace-nombre" style={{ color: c.color }}>{c.nombre}</span>
      {c.tipo === "c24" ? (
        <span className="cc-enlace-estado">{estado?.error ?? `${deNuestros} · de su comparador`}</span>
      ) : editando ? (
        <span className="cc-enlace-edit">
          <input value={valor} onChange={e => setValor(e.target.value)} placeholder={`${c.web}/… (vacío = no la vende)`}
            onKeyDown={e => { if (e.key === "Enter") { onGuardar(valor); setEditando(false); } }} autoFocus />
          <button className="regen-btn" onClick={() => { onGuardar(valor); setEditando(false); }}>Guardar</button>
        </span>
      ) : (
        <span className="cc-enlace-estado">
          {enlace === undefined ? <span className="cp-suave-txt">se busca al revisar</span>
            : noVende ? <span className="cp-suave-txt">no la vende</span>
            : <a href={enlace} target="_blank" rel="noreferrer">ver listado ↗</a>}
          {estado?.error && <span className="cp-rojo"> · {estado.error}</span>}
          {!estado?.error && estado?.leidos != null && enlace && <span className="cp-suave-txt"> · <b>{deNuestros}</b> · {estado.leidos} suyos</span>}
          <button className="cc-cambiar" onClick={() => { setValor(enlace ?? ""); setEditando(true); }}>cambiar</button>
        </span>
      )}
    </div>
  );
}

function MarcaBloque({ marca, r, enlaces, revisando, ocupado, expandido, onToggle, onRevisar, onEnlace }: {
  marca: Marca; r?: ResultadoComp; enlaces: Record<string, string>; revisando: boolean; ocupado: boolean;
  expandido: boolean; onToggle: () => void; onRevisar: () => void; onEnlace: (comp: string, url: string) => void;
}) {
  const [todos, setTodos] = useState(false);
  const filas = r?.filas ?? [];
  const conCompetencia = filas.filter(f => Object.keys(f.precios).length > 0);
  const caros = conCompetencia.filter(f => { const mb = masBarato(f); return mb && mb.precio < f.precio - 0.005; });
  // De más caros a más baratos respecto al competidor más barato
  const orden = (todos ? filas : conCompetencia).slice().sort((a, b) => {
    const da = masBarato(a), db = masBarato(b);
    return (da ? a.precio - da.precio : -Infinity) - (db ? b.precio - db.precio : -Infinity);
  }).reverse();
  return (
    <div className="vp-accordion">
      <div className="vp-accordion-header" onClick={onToggle} role="button" tabIndex={0}>
        <span className="vp-accordion-marca">
          {marca.nombre}
          <span className="cp-revisado">{r ? `Revisada el ${fechaExacta(r.revisadoEn)}` : "Sin revisar todavía"}</span>
        </span>
        <div className="vp-accordion-right">
          {caros.length > 0 && <span className="vp-pill vp-pill-nuevo" title="Productos que algún competidor vende más barato que nosotros">{caros.length} más caros</span>}
          {r && <span className="vp-accordion-count">{conCompetencia.length} con competencia · {filas.length} nuestros</span>}
          <button className="regen-btn cp-revisar-btn" disabled={ocupado} onClick={e => { e.stopPropagation(); onRevisar(); }} title="Leer los precios de esta marca en todas las webs">
            {revisando ? "Revisando…" : "Revisar"}
          </button>
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </div>
      {expandido && (
        <div className="vp-accordion-content">
          <div className="cc-enlaces">
            {COMPETIDORES.map(c => (
              <EnlaceComp key={`${c.id}-${enlaces[c.id] ?? "x"}`} id={c.id} estado={r?.competidores[c.id]} enlace={enlaces[c.id]} nuestros={r?.filas.length} enlazados={r?.filas.filter(f => f.precios[c.id]).length} onGuardar={url => onEnlace(c.id, url)} />
            ))}
          </div>
          {r?.c24RevisadoEn && <div className="cc-nota">Los precios de Cosméticos24h son los de su comparador, revisado el {fechaExacta(r.c24RevisadoEn)}.</div>}
          {!r && <p className="cc-nota">Pulsa «Revisar»: se buscan solos los listados de la marca en cada web y se leen sus precios.</p>}
          {r && (
            <>
              <label className="cc-todos"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Ver también los productos que no tiene ningún competidor ({filas.length - conCompetencia.length})</label>
              {orden.length > 0 ? <TablaCompetencia filas={orden} estados={r.competidores} /> : <p className="cc-nota">Ningún competidor tiene productos de esta marca emparejados con los nuestros.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompararCompetidores() {
  const [config, setConfig] = useState<Config | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");

  useEffect(() => { fetch("/api/comparar-competidores").then(r => r.json()).then(setConfig); }, []);

  async function enviar(body: object) {
    const res = await fetch("/api/comparar-competidores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) { setError(data.error); return false; }
    setConfig(data);
    return true;
  }

  async function revisar(slug: string) {
    setRevisando(slug); setError("");
    try {
      if (await enviar({ action: "revisar", slug })) setExpandidos(prev => new Set(prev).add(slug));
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(null);
    }
  }

  function toggle(slug: string) {
    setExpandidos(prev => { const n = new Set(prev); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  }

  const marcas = (config?.marcas ?? []).filter(m => m.nombre.toLowerCase().includes(filtro.toLowerCase()));
  // Primero las ya revisadas, después el resto por orden alfabético
  marcas.sort((a, b) => (config?.resultados[b.slug] ? 1 : 0) - (config?.resultados[a.slug] ? 1 : 0) || a.nombre.localeCompare(b.nombre));

  return (
    <div className="wrap cp-wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Comparar precios con la competencia</h1>
      <p className="subtitle">Nuestros precios frente a los de {COMPETIDORES.map(c => c.nombre).join(", ")}, marca a marca y en una sola tabla. En rojo, quien vende más barato que nosotros.</p>

      <div className="vp-notif-bar" style={{ background: "var(--card-bg, #f7f7f8)" }}>
        <span>Las marcas son las del <Link href="/comparar-precios">comparador de Cosméticos24h</Link>. Pulsa <strong>«Revisar»</strong> en cada una: el listado de la marca en cada web se busca solo (puedes cambiarlo o marcar que no la venden) y los productos se emparejan por EAN o, si su web no lo publica, por nombre y formato (≈).</span>
      </div>
      <input className="cc-filtro" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar marca…" />
      {error && <div className="error">{error}</div>}
      {!config && <p className="cc-nota">Cargando…</p>}
      {marcas.map(m => (
        <MarcaBloque key={m.slug} marca={m} r={config?.resultados[m.slug]} enlaces={config?.enlaces[m.slug] ?? {}}
          revisando={revisando === m.slug} ocupado={revisando !== null}
          expandido={expandidos.has(m.slug)} onToggle={() => toggle(m.slug)}
          onRevisar={() => revisar(m.slug)} onEnlace={(comp, url) => enviar({ action: "enlace", slug: m.slug, comp, url })} />
      ))}
    </div>
  );
}
