"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Descuento = {
  titulo: string; precio: number; precioOriginal: number;
  descuento: number; url: string; nuevo: boolean;
};

type ResultadoMarca = {
  marca: string; slug: string; error?: string; descuentos: Descuento[];
};

type Config = {
  marcas: { nombre: string; slug: string }[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  urlsPrevias: Record<string, Record<string, number>>;
};

function toSlug(nombre: string) {
  return nombre.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

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

const MOSTRAR_INICIAL = 5;

function MarcaAccordion({
  r, expandido, esNuevo, onToggle, mostrarTodos, onToggleMostrar,
}: {
  r: ResultadoMarca; expandido: boolean; esNuevo: boolean;
  onToggle: () => void; mostrarTodos: boolean; onToggleMostrar: () => void;
}) {
  const maxPct = r.descuentos.reduce((m, d) => Math.max(m, d.descuento), 0);
  const numNuevos = r.descuentos.filter(d => d.nuevo).length;
  const prodMostrar = mostrarTodos ? r.descuentos : r.descuentos.slice(0, MOSTRAR_INICIAL);

  return (
    <div className="vp-accordion">
      <button className="vp-accordion-header" onClick={onToggle}>
        <span className="vp-accordion-marca">{r.marca}</span>
        <div className="vp-accordion-right">
          <span className="vp-pill vp-pill-nuevo">−{maxPct}%</span>
          <span className="vp-accordion-count">
            {r.descuentos.length} prod.
            {numNuevos > 0 && ` · ${numNuevos} nuevos`}
          </span>
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandido && (
        <div className="vp-accordion-content">
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

export default function VigilarPrecios() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [nuevoSlug, setNuevoSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarTodos, setMostrarTodos] = useState<Set<string>>(new Set());
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    fetch("/api/vigilar").then(r => r.json()).then(setConfig);
    if (typeof Notification !== "undefined") setNotifPerm(Notification.permission);
  }, []);

  function toggle(slug: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  function toggleMostrar(slug: string) {
    setMostrarTodos(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  function handleNombreChange(v: string) {
    setNuevaMarca(v);
    if (!slugManual) setNuevoSlug(toSlug(v));
  }

  async function addMarca() {
    if (!nuevaMarca.trim() || !nuevoSlug.trim()) return;
    const res = await fetch("/api/vigilar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addMarca", nombre: nuevaMarca.trim(), slug: nuevoSlug.trim() }),
    });
    setConfig(await res.json());
    setNuevaMarca(""); setNuevoSlug(""); setSlugManual(false);
  }

  async function deleteMarca(slug: string) {
    const res = await fetch("/api/vigilar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteMarca", slug }),
    });
    setConfig(await res.json());
  }

  async function revisar() {
    setRevisando(true); setError("");
    try {
      const res = await fetch("/api/vigilar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revisar" }),
      });
      const data: Config = await res.json();
      setConfig(data);
      setExpandidos(new Set());

      if (notifPerm === "granted") {
        const totalNuevos = data.resultados.reduce((s, r) => s + r.descuentos.filter(d => d.nuevo).length, 0);
        if (totalNuevos > 0) {
          new Notification("Vigilar precios", {
            body: `${totalNuevos} descuento${totalNuevos !== 1 ? "s" : ""} nuevo${totalNuevos !== 1 ? "s" : ""} en Cosméticos24h`,
          });
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(false);
    }
  }

  async function solicitarNotificaciones() {
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
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
      <h1>Vigilar precios en Cosméticos24h</h1>
      <p className="subtitle">Comprueba si alguna de tus marcas tiene descuento activo</p>

      <div className="two-col">
        {/* ── Columna izquierda ── */}
        <div className="left-col">
          <div className="vp-section-title">Marcas vigiladas</div>
          {config?.marcas && config.marcas.length > 0 ? (
            <ul className="vp-marcas-list">
              {config.marcas.map(m => (
                <li key={m.slug} className="vp-marca-item">
                  <div>
                    <div className="vp-marca-nombre">{m.nombre}</div>
                    <div className="vp-marca-slug">/collections/{m.slug}</div>
                  </div>
                  <button className="vp-delete-btn" onClick={() => deleteMarca(m.slug)}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vp-empty">Sin marcas añadidas</p>
          )}

          <div className="vp-add-form">
            <input
              value={nuevaMarca}
              onChange={e => handleNombreChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMarca()}
              placeholder="Ej: Atache"
              style={{ marginBottom: 8 }}
            />
            <div className="vp-slug-row">
              <span className="vp-slug-prefix">/collections/</span>
              <input
                className="vp-slug-input"
                value={nuevoSlug}
                onChange={e => { setNuevoSlug(e.target.value); setSlugManual(true); }}
                placeholder="atache"
              />
            </div>
            <div className="vp-slug-hint">Se rellena solo. Edítalo solo si la marca no se encuentra.</div>
            <button onClick={addMarca} disabled={!nuevaMarca.trim() || !nuevoSlug.trim()}>
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
                disabled={revisando || !config || config.marcas.length === 0}
              >
                {revisando && <span className="spinner" />}
                {revisando ? "Revisando…" : "Revisar ahora"}
              </button>
            </div>
          </div>

          {notifPerm === "default" && (
            <div className="vp-notif-bar">
              <span>Activa las notificaciones para avisos automáticos.</span>
              <button className="vp-notif-btn" onClick={solicitarNotificaciones}>Activar</button>
            </div>
          )}

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
                <MarcaAccordion key={r.slug} r={r} esNuevo={true}
                  expandido={expandidos.has(r.slug)} onToggle={() => toggle(r.slug)}
                  mostrarTodos={mostrarTodos.has(r.slug)} onToggleMostrar={() => toggleMostrar(r.slug)} />
              ))}
            </div>
          )}

          {conocidos.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Ya conocidos</div>
              {conocidos.map(r => (
                <MarcaAccordion key={r.slug} r={r} esNuevo={false}
                  expandido={expandidos.has(r.slug)} onToggle={() => toggle(r.slug)}
                  mostrarTodos={mostrarTodos.has(r.slug)} onToggleMostrar={() => toggleMostrar(r.slug)} />
              ))}
            </div>
          )}

          {sinDesc.length > 0 && (
            <div className="vp-seccion">
              <div className="vp-seccion-titulo">Sin descuentos</div>
              <div className="vp-sin-desc-lista">
                {sinDesc.map(r => <span key={r.slug} className="vp-sin-desc-tag">{r.marca}</span>)}
              </div>
            </div>
          )}

          {conError.length > 0 && (
            <div className="vp-seccion">
              {conError.map(r => (
                <div key={r.slug} className="vp-error-line">{r.marca}: {r.error}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
