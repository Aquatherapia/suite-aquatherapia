"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Comparacion = {
  nombre: string; miPrecio: number; suPrecio: number; suPrecioTachado?: number;
  diff: number; confianza: number; miUrl: string; suUrl: string;
};
type SoloEllos = { titulo: string; precio: number; url: string; esPack: boolean };
type ResultadoMarca = {
  marca: string; slug: string; error?: string;
  comparaciones: Comparacion[]; soloEllos: SoloEllos[];
  misProductos: number; susProductos: number;
};
type Marca = { nombre: string; slug: string; miToken: string };
type Config = { marcas: Marca[]; ultimaRevision: string | null; resultados: ResultadoMarca[] };

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

function fechaExacta(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    + " a las " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const MOSTRAR_INICIAL = 6;

function MarcaBloque({
  r, expandido, onToggle, mostrarTodos, onToggleMostrar,
}: {
  r: ResultadoMarca; expandido: boolean; onToggle: () => void;
  mostrarTodos: boolean; onToggleMostrar: () => void;
}) {
  const masCaro = r.comparaciones.filter(c => c.diff > 0.01);
  const soloEllosReal = r.soloEllos.filter(s => !s.esPack);
  const packs = r.soloEllos.filter(s => s.esPack);
  const compMostrar = mostrarTodos ? r.comparaciones : r.comparaciones.slice(0, MOSTRAR_INICIAL);

  return (
    <div className="vp-accordion">
      <button className="vp-accordion-header" onClick={onToggle}>
        <span className="vp-accordion-marca">{r.marca}</span>
        <div className="vp-accordion-right">
          {masCaro.length > 0 && (
            <span className="vp-pill vp-pill-nuevo">{masCaro.length} caro{masCaro.length !== 1 ? "s" : ""}</span>
          )}
          <span className="vp-accordion-count">
            {r.comparaciones.length} comparados · {soloEllosReal.length} solo ellos
          </span>
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandido && (
        <div className="vp-accordion-content">
          {r.error && <div className="error" style={{ margin: 8 }}>{r.error}</div>}

          {r.comparaciones.length > 0 && (
            <>
              <div className="cp-subtit">Comparación de precios (tú vs. Cosméticos24h)</div>
              <div className="cp-tabla-head">
                <span>Producto</span>
                <span className="cp-col-num">Tú</span>
                <span className="cp-col-num">C24h</span>
                <span className="cp-col-num">Dif.</span>
              </div>
              {compMostrar.map((c, i) => {
                const caro = c.diff > 0.01;
                return (
                  <div key={i} className="cp-fila">
                    <a href={c.miUrl} target="_blank" rel="noreferrer" className="cp-nombre">
                      {c.nombre}
                      {c.confianza < 0.5 && <span className="cp-baja" title="Emparejamiento de baja confianza: revísalo">≈</span>}
                    </a>
                    <span className="cp-col-num">{c.miPrecio.toFixed(2)}€</span>
                    <a href={c.suUrl} target="_blank" rel="noreferrer" className="cp-col-num cp-c24">{c.suPrecio.toFixed(2)}€</a>
                    <span className={"cp-col-num " + (caro ? "cp-caro" : c.diff < -0.01 ? "cp-barato" : "")}>
                      {c.diff > 0 ? "+" : ""}{c.diff.toFixed(2)}€
                    </span>
                  </div>
                );
              })}
              {r.comparaciones.length > MOSTRAR_INICIAL && (
                <button className="vp-ver-mas" onClick={onToggleMostrar}>
                  {mostrarTodos ? "Ver menos ▲" : `Ver ${r.comparaciones.length - MOSTRAR_INICIAL} más →`}
                </button>
              )}
            </>
          )}

          {soloEllosReal.length > 0 && (
            <>
              <div className="cp-subtit" style={{ marginTop: 16 }}>
                Tienen ellos y tú no ({soloEllosReal.length}) — posibles novedades
              </div>
              {soloEllosReal.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="cp-fila cp-solo">
                  <span className="cp-nombre">{s.titulo}</span>
                  <span className="cp-col-num cp-c24">{s.precio.toFixed(2)}€</span>
                </a>
              ))}
            </>
          )}

          {packs.length > 0 && (
            <div className="cp-packs-nota">+ {packs.length} packs/estuches suyos que no tienes (no comparados por ser lotes)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompararPrecios() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [nuevoSlug, setNuevoSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [revisando, setRevisando] = useState<string | "todas" | null>(null);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarTodos, setMostrarTodos] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/comparar-precios").then(r => r.json()).then(setConfig);
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
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addMarca", nombre: nuevaMarca.trim(), slug: nuevoSlug.trim(), miToken: nuevoSlug.trim() }),
    });
    setConfig(await res.json());
    setNuevaMarca(""); setNuevoSlug(""); setSlugManual(false);
  }

  async function deleteMarca(slug: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteMarca", slug }),
    });
    setConfig(await res.json());
  }

  async function revisar(slug?: string) {
    setRevisando(slug ?? "todas"); setError("");
    try {
      const res = await fetch("/api/comparar-precios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revisar", ...(slug ? { slug } : {}) }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setConfig(data);
      if (slug) setExpandidos(prev => new Set(prev).add(slug));
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(null);
    }
  }

  const resultados = config?.resultados ?? [];

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Comparar mis precios con Cosméticos24h</h1>
      <p className="subtitle">Cruza tus precios con los de Cosméticos24h, marca a marca. Marca en rojo dónde vas más caro y lista lo que ellos tienen y tú no.</p>

      <div className="two-col">
        {/* ── Columna izquierda ── */}
        <div className="left-col">
          <div className="vp-section-title">Marcas a comparar</div>
          {config?.marcas && config.marcas.length > 0 ? (
            <ul className="vp-marcas-list">
              {config.marcas.map(m => (
                <li key={m.slug} className="vp-marca-item">
                  <div>
                    <div className="vp-marca-nombre">{m.nombre}</div>
                    <div className="vp-marca-slug">/collections/{m.slug}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      className="regen-btn"
                      onClick={() => revisar(m.slug)}
                      disabled={revisando !== null}
                      title="Revisar solo esta marca"
                    >
                      {revisando === m.slug ? "…" : "Revisar"}
                    </button>
                    <button className="vp-delete-btn" onClick={() => deleteMarca(m.slug)}>×</button>
                  </div>
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
            <div className="vp-slug-hint">El mismo texto se usa para localizar la marca en tu web. Edítalo solo si no la encuentra.</div>
            <button onClick={addMarca} disabled={!nuevaMarca.trim() || !nuevoSlug.trim()}>
              + Añadir marca
            </button>
          </div>
        </div>

        {/* ── Columna derecha ── */}
        <div className="right-col">
          <div className="vp-revision-header">
            <div className="vp-revision-time">
              {config?.ultimaRevision ? (
                <>
                  Análisis actualizado el {fechaExacta(config.ultimaRevision)}
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted)", fontWeight: 400, marginTop: 2 }}>
                    {tiempoDesde(config.ultimaRevision)}
                  </span>
                </>
              ) : "Sin revisar aún"}
            </div>
            <div className="vp-revision-right">
              <button
                className="vp-revisar-btn"
                onClick={() => revisar()}
                disabled={revisando !== null || !config || config.marcas.length === 0}
              >
                {revisando === "todas" && <span className="spinner" />}
                {revisando === "todas" ? "Revisando…" : "Revisar todas"}
              </button>
            </div>
          </div>

          <div className="vp-notif-bar" style={{ background: "var(--card-bg, #f7f7f8)" }}>
            <span>Consejo: revisa <strong>marca a marca</strong> (botón "Revisar" de cada una). Es más rápido y evita esperas largas.</span>
          </div>

          {error && <div className="error">{error}</div>}

          {resultados.length === 0 && !revisando && (
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
              Añade una marca y pulsa "Revisar" para comparar precios.
            </p>
          )}

          {resultados.map(r => (
            <MarcaBloque
              key={r.slug} r={r}
              expandido={expandidos.has(r.slug)} onToggle={() => toggle(r.slug)}
              mostrarTodos={mostrarTodos.has(r.slug)} onToggleMostrar={() => toggleMostrar(r.slug)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
