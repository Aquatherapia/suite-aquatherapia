"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Plataforma = "shopify" | "prestashop" | "woocommerce";

type EntradaConfig = {
  id: string;
  competidor: string;
  url: string;
  plataforma: Plataforma;
};

type Descuento = {
  titulo: string; precio: number; precioOriginal: number;
  descuento: number; url: string; nuevo: boolean; imagenUrl?: string;
};

type ResultadoEntrada = {
  id: string; competidor: string; url: string;
  descuentos: Descuento[]; error?: string;
};

type Config = {
  entradas: EntradaConfig[];
  ultimaRevision: string | null;
  resultados: ResultadoEntrada[];
  previos: Record<string, Record<string, number>>;
};

const PLATAFORMAS: { value: Plataforma; label: string }[] = [
  { value: "prestashop", label: "PrestaShop" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "shopify", label: "Shopify" },
];

const PLATAFORMA_COLOR: Record<Plataforma, string> = {
  shopify: "#008060",
  prestashop: "#2563eb",
  woocommerce: "#7c3aed",
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

function etiquetaUrl(url: string): string {
  try {
    const u = new URL(url);
    const sq = u.searchParams.get("search_query") || u.searchParams.get("s");
    if (sq) return sq;
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return last.replace(/^\d+-/, "").replace(/-/g, " ") || dominio(url);
  } catch { return url; }
}

const MOSTRAR_INICIAL = 5;

function generarPDF(r: ResultadoEntrada, ultimaRevision: string | null) {
  const ahora = new Date();
  const fechaHora = ahora.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    + " a las " + ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const tarjetas = r.descuentos.map(d => `
    <div class="tarjeta">
      ${d.imagenUrl ? `<div class="img-wrap"><img src="${d.imagenUrl}" alt="${d.titulo}" /></div>` : ""}
      <div class="info">
        <div class="nombre">${d.titulo}${d.nuevo ? ' <span class="nuevo">NUEVO</span>' : ""}</div>
        <div class="precios">
          <span class="precio-actual">${d.precio.toFixed(2)} €</span>
          <span class="precio-original">${d.precioOriginal.toFixed(2)} €</span>
          <span class="dto">−${d.descuento}%</span>
        </div>
        <div class="url-prod">${d.url}</div>
      </div>
    </div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Descuentos ${r.competidor} — ${etiquetaUrl(r.url)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 28px; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 20px; }
  .logo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #777; margin-bottom: 6px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 3px; }
  .meta { font-size: 11px; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .tarjeta { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
  .img-wrap { background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 160px; }
  .img-wrap img { max-height: 150px; max-width: 100%; object-fit: contain; }
  .info { padding: 12px; flex: 1; }
  .nombre { font-size: 12px; font-weight: 600; line-height: 1.4; margin-bottom: 8px; }
  .precios { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .precio-actual { font-size: 16px; font-weight: 700; }
  .precio-original { font-size: 12px; color: #999; text-decoration: line-through; }
  .dto { font-size: 12px; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 2px 6px; border-radius: 4px; }
  .url-prod { font-size: 10px; color: #888; word-break: break-all; }
  .nuevo { display: inline-block; background: #fee2e2; color: #b91c1c; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 4px; vertical-align: middle; }
  .footer { margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 16px; } .tarjeta { break-inside: avoid; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">Constancia de precios</div>
  <h1>${r.competidor} — ${etiquetaUrl(r.url)}</h1>
  <div class="meta">Capturado el ${fechaHora} · ${r.descuentos.length} productos con descuento</div>
</div>
<div class="grid">${tarjetas}</div>
<div class="footer">Capturado el ${fechaHora}</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

function EntradaAccordion({
  r, expandido, onToggle, mostrarTodos, onToggleMostrar, ultimaRevision,
}: {
  r: ResultadoEntrada; expandido: boolean; onToggle: () => void;
  mostrarTodos: boolean; onToggleMostrar: () => void; ultimaRevision: string | null;
}) {
  const maxPct = r.descuentos.reduce((m, d) => Math.max(m, d.descuento), 0);
  const numNuevos = r.descuentos.filter(d => d.nuevo).length;
  const prodMostrar = mostrarTodos ? r.descuentos : r.descuentos.slice(0, MOSTRAR_INICIAL);

  return (
    <div className="vp-accordion">
      <button className="vp-accordion-header" onClick={onToggle}>
        <span className="vp-accordion-marca">
          {r.competidor}
          <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>
            {etiquetaUrl(r.url)}
          </span>
        </span>
        <div className="vp-accordion-right">
          {maxPct > 0 && <span className="vp-pill vp-pill-nuevo">−{maxPct}%</span>}
          <span className="vp-accordion-count">
            {r.descuentos.length} prod.
            {numNuevos > 0 && ` · ${numNuevos} nuevos`}
          </span>
          {r.descuentos.length > 0 && (
            <button
              className="regen-btn"
              onClick={e => { e.stopPropagation(); generarPDF(r, ultimaRevision); }}
              title="Descargar PDF"
            >
              PDF
            </button>
          )}
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandido && (
        <div className="vp-accordion-content">
          {r.error && <div className="vp-error-line">{r.error}</div>}
          {r.descuentos.length === 0 && !r.error && (
            <p style={{ padding: "12px 0", color: "var(--muted)", fontSize: 13 }}>Sin descuentos encontrados.</p>
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
          {r.descuentos.length > MOSTRAR_INICIAL && (
            <button className="vp-ver-mas" onClick={onToggleMostrar}>
              {mostrarTodos ? "Ver menos ▲" : `Ver ${r.descuentos.length - MOSTRAR_INICIAL} más →`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function VigilarCompetidores() {
  const [config, setConfig] = useState<Config | null>(null);
  const [competidor, setCompetidor] = useState("");
  const [url, setUrl] = useState("");
  const [plataforma, setPlataforma] = useState<Plataforma>("prestashop");
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarTodos, setMostrarTodos] = useState<Set<string>>(new Set());

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

  function toggleMostrar(id: string) {
    setMostrarTodos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addEntrada() {
    if (!competidor.trim() || !url.trim()) return;
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addEntrada", competidor: competidor.trim(), url, plataforma }),
    });
    setConfig(await res.json());
    setCompetidor(""); setUrl("");
  }

  async function deleteEntrada(id: string) {
    const res = await fetch("/api/vigilar-comp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteEntrada", id }),
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
  const conNuevos = resultados.filter(r => r.descuentos.some(d => d.nuevo));
  const conocidos = resultados.filter(r => !r.descuentos.some(d => d.nuevo) && r.descuentos.length > 0);
  const sinDesc = resultados.filter(r => r.descuentos.length === 0 && !r.error);
  const conError = resultados.filter(r => r.error);
  const totalNuevos = resultados.reduce((s, r) => s + r.descuentos.filter(d => d.nuevo).length, 0);

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Vigilar competidores</h1>
      <p className="subtitle">Comprueba descuentos en otras tiendas por marca</p>

      <div className="two-col">
        {/* ── Columna izquierda ── */}
        <div className="left-col">
          <div className="vp-section-title">Entradas vigiladas</div>
          {config?.entradas && config.entradas.length > 0 ? (
            <ul className="vp-marcas-list">
              {config.entradas.map(e => (
                <li key={e.id} className="vp-marca-item">
                  <div style={{ minWidth: 0 }}>
                    <div className="vp-marca-nombre">{e.competidor}</div>
                    <div className="vp-marca-slug" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          background: PLATAFORMA_COLOR[e.plataforma],
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 3,
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}
                      >
                        {e.plataforma}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {dominio(e.url)} — {etiquetaUrl(e.url)}
                      </span>
                    </div>
                  </div>
                  <button className="vp-delete-btn" onClick={() => deleteEntrada(e.id)}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vp-empty">Sin entradas añadidas</p>
          )}

          <div className="vp-add-form">
            <input
              value={competidor}
              onChange={e => setCompetidor(e.target.value)}
              placeholder="Competidor (ej: Sonia González)"
              style={{ marginBottom: 8 }}
            />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="URL de la marca (ej: https://tienda.../brand/18-anesi)"
              style={{ marginBottom: 8 }}
            />
            <select
              value={plataforma}
              onChange={e => setPlataforma(e.target.value as Plataforma)}
              style={{ marginBottom: 12, width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }}
            >
              {PLATAFORMAS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button onClick={addEntrada} disabled={!competidor.trim() || !url.trim()}>
              + Añadir entrada
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
                disabled={revisando || !config || config.entradas.length === 0}
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
              {conNuevos.map(r => (
                <EntradaAccordion key={r.id} r={r} expandido={expandidos.has(r.id)}
                  onToggle={() => toggle(r.id)} mostrarTodos={mostrarTodos.has(r.id)}
                  onToggleMostrar={() => toggleMostrar(r.id)} ultimaRevision={config?.ultimaRevision ?? null} />
              ))}
            </div>
          )}

          {conocidos.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Ya conocidos</div>
              {conocidos.map(r => (
                <EntradaAccordion key={r.id} r={r} expandido={expandidos.has(r.id)}
                  onToggle={() => toggle(r.id)} mostrarTodos={mostrarTodos.has(r.id)}
                  onToggleMostrar={() => toggleMostrar(r.id)} ultimaRevision={config?.ultimaRevision ?? null} />
              ))}
            </div>
          )}

          {sinDesc.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Sin descuentos</div>
              <div className="vp-sin-desc-lista">
                {sinDesc.map(r => (
                  <span key={r.id} className="vp-sin-desc-tag">{r.competidor} — {etiquetaUrl(r.url)}</span>
                ))}
              </div>
            </div>
          )}

          {conError.length > 0 && (
            <div className="vp-seccion">
              {conError.map(r => (
                <div key={r.id} className="vp-error-line">{r.competidor}: {r.error}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
