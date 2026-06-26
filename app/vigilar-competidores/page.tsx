"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type EntradaCompetidor = { id: string; nombre: string; url: string };
type Marca = { id: string; nombre: string; competidores: EntradaCompetidor[] };
type Descuento = {
  titulo: string; precio: number; precioOriginal: number;
  descuento: number; url: string; nuevo: boolean; imagenUrl?: string;
};
type ResultadoCompetidor = {
  compId: string; nombre: string; url: string;
  descuentos: Descuento[]; error?: string;
};
type ResultadoMarca = { marcaId: string; nombre: string; competidores: ResultadoCompetidor[] };
type Config = {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  previos: Record<string, Record<string, number>>;
};

function tiempoDesde(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (m < 1) return "hace menos de 1 min";
  if (h < 1) return `hace ${m} min`;
  if (h < 24) return `hace ${h}h ${m % 60}min`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d > 1 ? "s" : ""}`;
}

function dominio(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

const MOSTRAR_INICIAL = 5;

function generarPDF(rm: ResultadoMarca, ultimaRevision: string | null) {
  const ahora = new Date();
  const fechaHora = ahora.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    + " a las " + ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const totalDesc = rm.competidores.reduce((s, c) => s + c.descuentos.length, 0);

  const secciones = rm.competidores
    .filter(c => c.descuentos.length > 0)
    .map(c => {
      const tarjetas = c.descuentos.map(d => `
        <a class="tarjeta" href="${d.url}" target="_blank" rel="noreferrer">
          ${d.imagenUrl ? `<div class="img-wrap"><img src="${d.imagenUrl}" alt="${d.titulo}" /></div>` : ""}
          <div class="info">
            <div class="nombre">${d.titulo}${d.nuevo ? ' <span class="nuevo">NUEVO</span>' : ""}</div>
            <div class="precios">
              <span class="precio-actual">${d.precio.toFixed(2)} €</span>
              <span class="precio-original">${d.precioOriginal.toFixed(2)} €</span>
              <span class="dto">−${d.descuento}%</span>
            </div>
            <div class="url-prod">Ver producto en ${dominio(d.url)} →</div>
          </div>
        </a>`).join("");
      return `<div class="seccion-comp"><div class="comp-titulo">${c.nombre}</div><div class="grid">${tarjetas}</div></div>`;
    }).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Descuentos ${rm.nombre}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 28px; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 24px; }
  .logo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #777; margin-bottom: 6px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 3px; }
  .meta { font-size: 11px; color: #555; }
  .seccion-comp { margin-bottom: 28px; }
  .comp-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .tarjeta { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; text-decoration: none; color: inherit; }
  .img-wrap { background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 150px; }
  .img-wrap img { max-height: 140px; max-width: 100%; object-fit: contain; }
  .info { padding: 10px; flex: 1; }
  .nombre { font-size: 12px; font-weight: 600; line-height: 1.4; margin-bottom: 6px; }
  .precios { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .precio-actual { font-size: 15px; font-weight: 700; }
  .precio-original { font-size: 12px; color: #999; text-decoration: line-through; }
  .dto { font-size: 12px; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 2px 6px; border-radius: 4px; }
  .url-prod { font-size: 10px; color: #2563eb; }
  .nuevo { display: inline-block; background: #fee2e2; color: #b91c1c; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 4px; vertical-align: middle; }
  .footer { margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 16px; } .tarjeta { break-inside: avoid; } .comp-titulo { break-after: avoid; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">Constancia de precios</div>
  <h1>${rm.nombre}</h1>
  <div class="meta">Capturado el ${fechaHora} · ${totalDesc} productos con descuento en ${rm.competidores.filter(c => c.descuentos.length > 0).length} competidores</div>
</div>
${secciones}
<div class="footer">Capturado el ${fechaHora}</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

function MarcaAccordion({
  rm, expandido, onToggle, ultimaRevision,
}: {
  rm: ResultadoMarca; expandido: boolean; onToggle: () => void; ultimaRevision: string | null;
}) {
  const [mostrarTodos, setMostrarTodos] = useState<Set<string>>(new Set());
  const totalDesc = rm.competidores.reduce((s, c) => s + c.descuentos.length, 0);
  const totalNuevos = rm.competidores.reduce((s, c) => s + c.descuentos.filter(d => d.nuevo).length, 0);
  const maxPct = rm.competidores.reduce((m, c) => Math.max(m, ...c.descuentos.map(d => d.descuento)), 0);

  function toggleMostrar(id: string) {
    setMostrarTodos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="vp-accordion">
      <button className="vp-accordion-header" onClick={onToggle}>
        <span className="vp-accordion-marca">{rm.nombre}</span>
        <div className="vp-accordion-right">
          {maxPct > 0 && <span className="vp-pill vp-pill-nuevo">−{maxPct}%</span>}
          <span className="vp-accordion-count">
            {totalDesc} prod.{totalNuevos > 0 && ` · ${totalNuevos} nuevos`}
          </span>
          {totalDesc > 0 && (
            <button
              className="regen-btn"
              onClick={e => { e.stopPropagation(); generarPDF(rm, ultimaRevision); }}
              title="Descargar PDF"
            >
              PDF
            </button>
          )}
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandido && (
        <div className="vp-accordion-content" style={{ padding: 0 }}>
          {rm.competidores.map(c => {
            const prodMostrar = mostrarTodos.has(c.compId) ? c.descuentos : c.descuentos.slice(0, MOSTRAR_INICIAL);
            return (
              <div key={c.compId} style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{dominio(c.url)}</span>
                  {c.descuentos.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                      {c.descuentos.length} prod.
                    </span>
                  )}
                </div>
                {c.error && <div className="vp-error-line">{c.error}</div>}
                {c.descuentos.length === 0 && !c.error && (
                  <p style={{ fontSize: 12, color: "var(--muted)", paddingBottom: 4 }}>Sin descuentos encontrados</p>
                )}
                {prodMostrar.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer" className="vp-producto">
                    <span className="vp-pct">−{d.descuento}%</span>
                    <span className="vp-prod-titulo">
                      {d.titulo}
                      {d.nuevo && <span className="vp-nuevo-pill">Nuevo</span>}
                    </span>
                    <div className="vp-prod-right">
                      <span className="vp-prod-precio">
                        {d.precio.toFixed(2)}€{" "}
                        <span className="vp-tachado">{d.precioOriginal.toFixed(2)}€</span>
                      </span>
                    </div>
                  </a>
                ))}
                {c.descuentos.length > MOSTRAR_INICIAL && (
                  <button className="vp-ver-mas" onClick={() => toggleMostrar(c.compId)}>
                    {mostrarTodos.has(c.compId) ? "Ver menos ▲" : `Ver ${c.descuentos.length - MOSTRAR_INICIAL} más →`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function VigilarCompetidores() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [addCompId, setAddCompId] = useState<string | null>(null);
  const [nuevoComp, setNuevoComp] = useState({ nombre: "", url: "" });
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/vigilar-comp").then(r => r.json()).then(setConfig);
  }, []);

  function toggle(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addMarca() {
    if (!nuevaMarca.trim()) return;
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addMarca", nombre: nuevaMarca.trim() }),
    });
    setConfig(await res.json());
    setNuevaMarca("");
  }

  async function deleteMarca(marcaId: string) {
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteMarca", marcaId }),
    });
    setConfig(await res.json());
  }

  async function addCompetidor(marcaId: string) {
    if (!nuevoComp.nombre.trim() || !nuevoComp.url.trim()) return;
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addCompetidor", marcaId, nombre: nuevoComp.nombre.trim(), url: nuevoComp.url.trim() }),
    });
    setConfig(await res.json());
    setNuevoComp({ nombre: "", url: "" });
    setAddCompId(null);
  }

  async function deleteCompetidor(marcaId: string, compId: string) {
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteCompetidor", marcaId, compId }),
    });
    setConfig(await res.json());
  }

  async function revisar() {
    setRevisando(true); setError("");
    try {
      const res = await fetch("/api/vigilar-comp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revisar" }),
      });
      const data: Config = await res.json();
      setConfig(data);
      setExpandidos(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(false);
    }
  }

  const resultados = config?.resultados ?? [];
  const conNuevos = resultados.filter(rm => rm.competidores.some(c => c.descuentos.some(d => d.nuevo)));
  const conocidos = resultados.filter(rm =>
    !rm.competidores.some(c => c.descuentos.some(d => d.nuevo)) &&
    rm.competidores.some(c => c.descuentos.length > 0)
  );
  const sinDesc = resultados.filter(rm =>
    rm.competidores.every(c => c.descuentos.length === 0 && !c.error)
  );
  const totalNuevos = resultados.reduce(
    (s, rm) => s + rm.competidores.reduce((ss, c) => ss + c.descuentos.filter(d => d.nuevo).length, 0), 0
  );
  const totalEntradas = config?.marcas.reduce((s, m) => s + m.competidores.length, 0) ?? 0;

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Vigilar competidores</h1>
      <p className="subtitle">Comprueba descuentos en otras tiendas por marca</p>

      <div className="two-col">
        {/* ── Columna izquierda ── */}
        <div className="left-col">
          <div className="vp-section-title">Marcas vigiladas</div>

          {config?.marcas && config.marcas.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {config.marcas.map(m => (
                <div key={m.id} style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {/* Cabecera de marca */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface-alt, var(--surface))" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{m.nombre}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {m.competidores.length} competidor{m.competidores.length !== 1 ? "es" : ""}
                      </span>
                      <button className="vp-delete-btn" onClick={() => deleteMarca(m.id)} title="Eliminar marca">×</button>
                    </div>
                  </div>

                  {/* Competidores de esta marca */}
                  {m.competidores.length > 0 && (
                    <ul className="vp-marcas-list" style={{ margin: 0, borderRadius: 0, border: "none", borderTop: "1px solid var(--border)" }}>
                      {m.competidores.map(c => (
                        <li key={c.id} className="vp-marca-item">
                          <div style={{ minWidth: 0 }}>
                            <div className="vp-marca-nombre" style={{ fontSize: 13 }}>{c.nombre}</div>
                            <div className="vp-marca-slug" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {dominio(c.url)}
                            </div>
                          </div>
                          <button className="vp-delete-btn" onClick={() => deleteCompetidor(m.id, c.id)}>×</button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Formulario añadir competidor */}
                  {addCompId === m.id ? (
                    <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                      <input
                        value={nuevoComp.nombre}
                        onChange={e => setNuevoComp(p => ({ ...p, nombre: e.target.value }))}
                        placeholder="Nombre (ej: Sonia González)"
                        style={{ marginBottom: 6 }}
                        autoFocus
                      />
                      <input
                        value={nuevoComp.url}
                        onChange={e => setNuevoComp(p => ({ ...p, url: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addCompetidor(m.id)}
                        placeholder="URL de la marca en esa tienda"
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => addCompetidor(m.id)} disabled={!nuevoComp.nombre.trim() || !nuevoComp.url.trim()}>
                          Añadir
                        </button>
                        <button
                          onClick={() => { setAddCompId(null); setNuevoComp({ nombre: "", url: "" }); }}
                          style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddCompId(m.id); setNuevoComp({ nombre: "", url: "" }); }}
                      style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", borderTop: "1px solid var(--border)", color: "var(--accent)", fontSize: 12, cursor: "pointer", textAlign: "left" }}
                    >
                      + Añadir competidor
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="vp-empty">Sin marcas añadidas</p>
          )}

          {/* Añadir marca */}
          <div className="vp-add-form">
            <input
              value={nuevaMarca}
              onChange={e => setNuevaMarca(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMarca()}
              placeholder="Nueva marca (ej: Casmara)"
            />
            <button onClick={addMarca} disabled={!nuevaMarca.trim()} style={{ marginTop: 8 }}>
              + Añadir marca
            </button>
          </div>
        </div>

        {/* ── Columna derecha ── */}
        <div className="right-col">
          <div className="vp-revision-header">
            <div className="vp-revision-time">
              {config?.ultimaRevision ? tiempoDesde(config.ultimaRevision) : "Sin revisar aún"}
            </div>
            <div className="vp-revision-right">
              {totalNuevos > 0 && (
                <span className="vp-badge-total vp-badge-rojo">
                  {totalNuevos} nuevo{totalNuevos !== 1 ? "s" : ""}
                </span>
              )}
              <button
                className="vp-revisar-btn"
                onClick={revisar}
                disabled={revisando || totalEntradas === 0}
              >
                {revisando && <span className="spinner" />}
                {revisando ? "Revisando…" : "Revisar ahora"}
              </button>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          {resultados.length === 0 && !revisando && (
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
              Pulsa "Revisar ahora" para comprobar precios.
            </p>
          )}

          {conNuevos.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo vp-seccion-nuevo">Nuevos hoy</div>
              {conNuevos.map(rm => (
                <MarcaAccordion key={rm.marcaId} rm={rm}
                  expandido={expandidos.has(rm.marcaId)} onToggle={() => toggle(rm.marcaId)}
                  ultimaRevision={config?.ultimaRevision ?? null} />
              ))}
            </div>
          )}

          {conocidos.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Ya conocidos</div>
              {conocidos.map(rm => (
                <MarcaAccordion key={rm.marcaId} rm={rm}
                  expandido={expandidos.has(rm.marcaId)} onToggle={() => toggle(rm.marcaId)}
                  ultimaRevision={config?.ultimaRevision ?? null} />
              ))}
            </div>
          )}

          {sinDesc.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Sin descuentos</div>
              <div className="vp-sin-desc-lista">
                {sinDesc.map(rm => <span key={rm.marcaId} className="vp-sin-desc-tag">{rm.nombre}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
