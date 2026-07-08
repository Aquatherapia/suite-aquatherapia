"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Comparacion = {
  nombre: string; miPrecio: number; suPrecio: number; suPrecioTachado?: number;
  diff: number; confianza: number; miUrl: string; suUrl: string; esPack?: boolean; manual?: boolean;
};
type SoloEllos = { titulo: string; precio: number; url: string; esPack: boolean };
type MiSinEmparejar = { nombre: string; url: string; precio: number; esPack: boolean };
type ResultadoMarca = {
  marca: string; slug: string; error?: string;
  comparaciones: Comparacion[]; soloEllos: SoloEllos[]; misSinEmparejar: MiSinEmparejar[];
  misProductos: number; susProductos: number;
};

function nombreDesdeUrl(url: string) {
  return (url.split("/es/")[1] ?? url).replace(/-p\d+$/, "").replace(/-/g, " ");
}
type Marca = { nombre: string; slug: string; miToken: string };
type Excluido = {
  suUrl: string; titulo: string;
  tipo?: "comparacion" | "soloEllos";
  miPrecio?: number; suPrecio?: number; miUrl?: string; motivo?: string;
};
type Config = { marcas: Marca[]; ultimaRevision: string | null; resultados: ResultadoMarca[]; excluidos: Record<string, Excluido[]> };

const MOTIVOS = [
  "Compara productos diferentes",
  "Ya lo tengo (no lo detecta)",
  "No me interesa",
  "Otro motivo",
];

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
  r, ocultos, expandido, onToggle, mostrarTodos, onToggleMostrar, onExcluir, onIncluir, onMotivo, onMapear, onDesmapear,
}: {
  r: ResultadoMarca; ocultos: Excluido[]; expandido: boolean; onToggle: () => void;
  mostrarTodos: boolean; onToggleMostrar: () => void;
  onExcluir: (item: Excluido) => void;
  onIncluir: (suUrl: string) => void;
  onMotivo: (suUrl: string, motivo: string) => void;
  onMapear: (miUrl: string, suUrl: string) => Promise<void>;
  onDesmapear: (miUrl: string) => void;
}) {
  const [verOcultos, setVerOcultos] = useState(false);
  const [verSinEmp, setVerSinEmp] = useState(false);
  const [editando, setEditando] = useState<string | null>(null); // suUrl de la fila en edición
  const [urlInput, setUrlInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errLink, setErrLink] = useState("");

  async function guardarEnlace(miUrl: string) {
    if (!urlInput.trim()) return;
    setGuardando(true); setErrLink("");
    try {
      await onMapear(miUrl, urlInput.trim());
      setEditando(null); setUrlInput("");
    } catch (e) {
      setErrLink(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }
  function abrirEditor(filaId: string, suUrlActual: string) {
    setEditando(filaId); setUrlInput(suUrlActual); setErrLink("");
  }

  // Estado de la sección "sin emparejar"
  const [linkVals, setLinkVals] = useState<Record<string, string>>({});
  const [guardandoSin, setGuardandoSin] = useState<string | null>(null);
  const [errSin, setErrSin] = useState<Record<string, string>>({});
  async function guardarEnlaceSin(miUrl: string) {
    const val = (linkVals[miUrl] ?? "").trim();
    if (!val) return;
    setGuardandoSin(miUrl); setErrSin(e => ({ ...e, [miUrl]: "" }));
    try {
      await onMapear(miUrl, val);
      setLinkVals(v => { const n = { ...v }; delete n[miUrl]; return n; });
    } catch (e) {
      setErrSin(er => ({ ...er, [miUrl]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setGuardandoSin(null);
    }
  }

  const masCaro = r.comparaciones.filter(c => c.diff > 0.01);
  const soloEllosReal = r.soloEllos.filter(s => !s.esPack);
  const packs = r.soloEllos.filter(s => s.esPack);
  const sinEmp = (r.misSinEmparejar ?? []).filter(m => !m.esPack);
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
                <span />
              </div>
              {compMostrar.map((c, i) => {
                const caro = c.diff > 0.01;
                return (
                  <div key={i}>
                    <div className="cp-fila">
                      <a href={c.miUrl} target="_blank" rel="noreferrer" className="cp-nombre">
                        {c.esPack && <span className="cp-pack-tag">pack</span>}
                        {c.manual && <span className="cp-manual-tag" title="Enlazado a mano">✓ manual</span>}
                        {c.nombre}
                        {!c.manual && c.confianza < 0.5 && <span className="cp-baja" title="Emparejamiento de baja confianza: revísalo o enlázalo a mano con ✎">≈</span>}
                      </a>
                      <span className="cp-col-num">{c.miPrecio.toFixed(2)}€</span>
                      <a href={c.suUrl} target="_blank" rel="noreferrer" className="cp-col-num cp-c24">{c.suPrecio.toFixed(2)}€</a>
                      <span className={"cp-col-num " + (caro ? "cp-caro" : c.diff < -0.01 ? "cp-barato" : "")}>
                        {c.diff > 0 ? "+" : ""}{c.diff.toFixed(2)}€
                      </span>
                      <div className="cp-acciones">
                        <button className="cp-editar" title="Corregir el enlace: pegar la URL correcta de Cosméticos24h" onClick={() => abrirEditor(c.suUrl, c.suUrl)}>✎</button>
                        <button className="cp-ocultar" title="Ocultar (match erróneo)" onClick={() => onExcluir({ suUrl: c.suUrl, titulo: c.nombre, tipo: "comparacion", miPrecio: c.miPrecio, suPrecio: c.suPrecio, miUrl: c.miUrl })}>×</button>
                      </div>
                    </div>
                    {editando === c.suUrl && (
                      <div className="cp-editor">
                        <div className="cp-editor-lbl">Pega la URL correcta de este producto en Cosméticos24h:</div>
                        <div className="cp-editor-row">
                          <input
                            className="cp-editor-input"
                            value={urlInput}
                            onChange={e => setUrlInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && guardarEnlace(c.miUrl)}
                            placeholder="https://cosmeticos24h.com/products/…"
                            autoFocus
                          />
                          <button className="cp-editor-save" disabled={guardando} onClick={() => guardarEnlace(c.miUrl)}>
                            {guardando ? "…" : "Enlazar"}
                          </button>
                          <button className="cp-editor-cancel" onClick={() => { setEditando(null); setErrLink(""); }}>Cancelar</button>
                        </div>
                        {c.manual && (
                          <button className="cp-editor-undo" onClick={() => { onDesmapear(c.miUrl); setEditando(null); }}>Quitar enlace manual (volver al automático)</button>
                        )}
                        {errLink && <div className="cp-editor-err">{errLink}</div>}
                      </div>
                    )}
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
                <div key={i} className="cp-fila cp-solo">
                  <a href={s.url} target="_blank" rel="noreferrer" className="cp-nombre">{s.titulo}</a>
                  <span className="cp-col-num cp-c24">{s.precio.toFixed(2)}€</span>
                  <button className="cp-ocultar" title="Ocultar" onClick={() => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })}>×</button>
                </div>
              ))}
            </>
          )}

          {packs.length > 0 && (
            <>
              <div className="cp-subtit" style={{ marginTop: 16 }}>
                Packs/estuches que tienen ellos y tú no ({packs.length})
              </div>
              {packs.map((s, i) => (
                <div key={i} className="cp-fila cp-solo">
                  <a href={s.url} target="_blank" rel="noreferrer" className="cp-nombre">{s.titulo}</a>
                  <span className="cp-col-num cp-c24">{s.precio.toFixed(2)}€</span>
                  <button className="cp-ocultar" title="Ocultar" onClick={() => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })}>×</button>
                </div>
              ))}
            </>
          )}

          {sinEmp.length > 0 && (
            <div className="cp-ocultos-box">
              <button className="cp-ocultos-toggle" onClick={() => setVerSinEmp(v => !v)}>
                {verSinEmp ? "▲" : "▼"} Tus productos sin emparejar ({sinEmp.length}) — enlázalos a mano
              </button>
              {verSinEmp && (
                <div className="cp-ocultos-lista">
                  <div className="cp-packs-nota" style={{ padding: "0 0 8px" }}>
                    Estos productos tuyos no se han cruzado con ninguno de Cosméticos24h. Si tienen equivalente, pega su URL de C24h para enlazarlos (queda guardado).
                  </div>
                  {sinEmp.map((m, i) => (
                    <div key={i} className="cp-sinemp-item">
                      <div className="cp-oculto-info">
                        <a href={m.url} target="_blank" rel="noreferrer" className="cp-oculto-nombre">
                          {m.esPack && <span className="cp-pack-tag">pack</span>}{m.nombre}
                        </a>
                        <div className="cp-oculto-precios">Tu precio: <strong>{m.precio.toFixed(2)}€</strong></div>
                        <div className="cp-editor-row">
                          <input
                            className="cp-editor-input"
                            value={linkVals[m.url] ?? ""}
                            onChange={e => setLinkVals(v => ({ ...v, [m.url]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && guardarEnlaceSin(m.url)}
                            placeholder="URL de este producto en cosmeticos24h.com…"
                          />
                          <button className="cp-editor-save" disabled={guardandoSin === m.url} onClick={() => guardarEnlaceSin(m.url)}>
                            {guardandoSin === m.url ? "…" : "Enlazar"}
                          </button>
                        </div>
                        {errSin[m.url] && <div className="cp-editor-err">{errSin[m.url]}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {ocultos.length > 0 && (
            <div className="cp-ocultos-box">
              <button className="cp-ocultos-toggle" onClick={() => setVerOcultos(v => !v)}>
                {verOcultos ? "▲" : "▼"} Ocultos ({ocultos.length})
              </button>
              {verOcultos && (
                <div className="cp-ocultos-lista">
                  {ocultos.map((o, i) => (
                    <div key={i} className="cp-oculto-item">
                      <div className="cp-oculto-info">
                        <a href={o.miUrl ?? o.suUrl} target="_blank" rel="noreferrer" className="cp-oculto-nombre">{o.titulo}</a>
                        <div className="cp-oculto-precios">
                          {o.tipo === "soloEllos" ? (
                            <span className="cp-oculto-tag">Tienen ellos y tú no · C24h {o.suPrecio?.toFixed(2)}€</span>
                          ) : o.tipo === "comparacion" ? (
                            <span>
                              Tú <strong>{o.miPrecio?.toFixed(2)}€</strong> · C24h <strong>{o.suPrecio?.toFixed(2)}€</strong>
                              {o.miPrecio != null && o.suPrecio != null && (
                                <span className={o.miPrecio - o.suPrecio > 0.01 ? "cp-caro" : o.miPrecio - o.suPrecio < -0.01 ? "cp-barato" : ""}>
                                  {" "}({o.miPrecio - o.suPrecio > 0 ? "+" : ""}{(o.miPrecio - o.suPrecio).toFixed(2)}€)
                                </span>
                              )}
                            </span>
                          ) : null}
                        </div>
                        <label className="cp-motivo-row">
                          Oculto por:
                          <select
                            className="cp-motivo-select"
                            value={o.motivo ?? ""}
                            onChange={e => onMotivo(o.suUrl, e.target.value)}
                          >
                            <option value="">— Sin especificar —</option>
                            {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                      </div>
                      <button className="cp-restaurar" onClick={() => onIncluir(o.suUrl)}>Restaurar</button>
                    </div>
                  ))}
                  <div className="cp-packs-nota" style={{ padding: "6px 0 0" }}>Al restaurar, reaparece en la próxima revisión.</div>
                </div>
              )}
            </div>
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
  const [revisando, setRevisando] = useState<string | null>(null);
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

  async function excluir(slug: string, item: Excluido) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "excluir", slug, item }),
    });
    setConfig(await res.json());
  }

  async function cambiarMotivo(slug: string, suUrl: string, motivo: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "motivo", slug, suUrl, motivo }),
    });
    setConfig(await res.json());
  }

  async function incluir(slug: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "incluir", slug, suUrl }),
    });
    setConfig(await res.json());
  }

  async function mapear(slug: string, miUrl: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mapear", slug, miUrl, suUrl }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setConfig(data);
  }

  async function desmapear(slug: string, miUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "desmapear", slug, miUrl }),
    });
    setConfig(await res.json());
  }

  async function revisar(slug: string) {
    setRevisando(slug); setError("");
    try {
      const res = await fetch("/api/comparar-precios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revisar", slug }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setConfig(data);
      setExpandidos(prev => new Set(prev).add(slug));
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
          </div>

          <div className="vp-notif-bar" style={{ background: "var(--card-bg, #f7f7f8)" }}>
            <span>La revisión es <strong>marca a marca</strong>: usa el botón "Revisar" de cada marca (columna izquierda). Así es rápido y no satura tu web.</span>
          </div>

          {error && <div className="error">{error}</div>}

          {resultados.length === 0 && !revisando && (
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
              Añade una marca y pulsa "Revisar" para comparar precios.
            </p>
          )}

          {resultados.map(r => (
            <MarcaBloque
              key={r.slug} r={r} ocultos={config?.excluidos?.[r.slug] ?? []}
              expandido={expandidos.has(r.slug)} onToggle={() => toggle(r.slug)}
              mostrarTodos={mostrarTodos.has(r.slug)} onToggleMostrar={() => toggleMostrar(r.slug)}
              onExcluir={(item) => excluir(r.slug, item)}
              onIncluir={(suUrl) => incluir(r.slug, suUrl)}
              onMotivo={(suUrl, motivo) => cambiarMotivo(r.slug, suUrl, motivo)}
              onMapear={(miUrl, suUrl) => mapear(r.slug, miUrl, suUrl)}
              onDesmapear={(miUrl) => desmapear(r.slug, miUrl)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
