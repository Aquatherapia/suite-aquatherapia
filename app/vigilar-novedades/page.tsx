"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Producto {
  titulo: string;
  url: string;
  imagenUrl?: string;
  precio?: number;
  nuevo: boolean;
}
interface ResultadoMarca {
  marcaId: string;
  nombre: string;
  url: string;
  total: number;
  nuevos: number;
  productos: Producto[];
  error?: string;
}
interface Marca {
  id: string;
  nombre: string;
  url: string;
}
interface Config {
  marcas: Marca[];
  ultimaRevision: string | null;
  resultados: ResultadoMarca[];
  previos: Record<string, string[]>;
}

export default function VigilarNovedadesPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/vigilar-novedades")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("No se pudo cargar la configuración."));
  }, []);

  async function accion(body: object) {
    const res = await fetch("/api/vigilar-novedades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function addMarca() {
    if (!nombre.trim() || !url.trim()) return;
    setConfig(await accion({ action: "addMarca", nombre, url }));
    setNombre("");
    setUrl("");
  }

  async function deleteMarca(marcaId: string) {
    setConfig(await accion({ action: "deleteMarca", marcaId }));
  }

  async function revisar() {
    setRevisando(true);
    setError("");
    try {
      setConfig(await accion({ action: "revisar" }));
    } catch {
      setError("Error al revisar.");
    } finally {
      setRevisando(false);
    }
  }

  const resultadoDe = (id: string) =>
    config?.resultados.find((r) => r.marcaId === id);
  const esPrimera = (id: string) => !(config?.previos[id]?.length);
  const totalNuevos =
    config?.resultados.reduce((s, r) => s + r.nuevos, 0) ?? 0;

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Vigilar novedades de marcas</h1>
        <p className="subtitle">
          Detecta cuándo una marca sube productos nuevos a su web. Añade la marca
          con su URL y revisa con un clic.
        </p>
      </header>

      <div className="two-col">
        {/* ── Izquierda: marcas ── */}
        <div className="left-col">
          <p className="vp-section-title">Marcas vigiladas</p>

          {config && config.marcas.length === 0 && (
            <p className="vp-empty" style={{ fontSize: 13, color: "var(--muted)" }}>
              Aún no vigilas ninguna marca. Añade la primera abajo.
            </p>
          )}

          {config && config.marcas.length > 0 && (
            <ul className="vp-marcas-list">
              {config.marcas.map((m) => (
                <li key={m.id} className="vp-marca-item">
                  <div style={{ minWidth: 0 }}>
                    <div className="vp-marca-nombre">{m.nombre}</div>
                    <div className="vp-marca-slug" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.url}
                    </div>
                  </div>
                  <button className="vp-delete-btn" onClick={() => deleteMarca(m.id)} title="Borrar">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="vp-add-form">
            <label style={{ marginTop: 0 }}>Nombre de la marca</label>
            <input
              type="text"
              placeholder="Ej: Davines"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <label>URL de su tienda / catálogo</label>
            <input
              type="text"
              placeholder="https://www.lamarca.com/tienda"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMarca()}
            />
            <p className="vp-slug-hint">
              Mejor una página donde se vean sus productos (catálogo o
              “novedades”).
            </p>
            <button onClick={addMarca} disabled={!nombre.trim() || !url.trim()}>
              Añadir marca
            </button>
          </div>
        </div>

        {/* ── Derecha: resultados ── */}
        <div className="right-col">
          <div className="vp-revision-header">
            <div>
              <span className="vp-revision-time">
                {config?.ultimaRevision
                  ? `Última revisión: ${new Date(config.ultimaRevision).toLocaleString("es-ES")}`
                  : "Sin revisiones aún"}
              </span>
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
                {revisando ? (
                  <>
                    <span className="spinner" />
                    Revisando…
                  </>
                ) : (
                  "Revisar ahora"
                )}
              </button>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          {(!config || config.marcas.length === 0) && (
            <p className="placeholder">
              Añade una marca a la izquierda para empezar.
            </p>
          )}

          {config &&
            config.marcas.map((m) => {
              const r = resultadoDe(m.id);
              return (
                <div key={m.id} className="vp-seccion">
                  <div
                    className="vp-seccion-titulo"
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <span>{m.nombre}</span>
                    {r?.nuevos ? (
                      <span className="vp-pill vp-pill-nuevo">
                        {r.nuevos} nuevo{r.nuevos !== 1 ? "s" : ""}
                      </span>
                    ) : null}
                    {r && !r.error && (
                      <span className="vp-accordion-count">
                        {r.total} productos vistos
                      </span>
                    )}
                  </div>

                  {!r && (
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>
                      Pulsa “Revisar ahora” para empezar a vigilarla.
                    </p>
                  )}

                  {r?.error && (
                    <p className="vp-error-line">
                      No se pudo leer esta web (puede tener protección anti-robots
                      tipo Cloudflare, o la URL no lista productos).
                    </p>
                  )}

                  {r && !r.error && esPrimera(m.id) && (
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>
                      ✓ Foto inicial guardada ({r.total} productos).{" "}
                      {r.nuevos > 0
                        ? "Abajo, los añadidos en los últimos 45 días. "
                        : ""}
                      A partir de la próxima revisión te avisaré de cualquier
                      novedad.
                    </p>
                  )}

                  {r && !r.error && !esPrimera(m.id) && r.nuevos === 0 && (
                    <p style={{ fontSize: 13, color: "#2a7a2a" }}>
                      ✓ Sin novedades desde la última revisión.
                    </p>
                  )}

                  {r && r.productos.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: 12,
                        marginTop: 8,
                      }}
                    >
                      {r.productos.map((p, i) => (
                        <a
                          key={i}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: 8,
                            textDecoration: "none",
                            color: "var(--ink)",
                            background: "#fff",
                          }}
                        >
                          {p.imagenUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imagenUrl}
                              alt={p.titulo}
                              style={{
                                width: "100%",
                                height: 110,
                                objectFit: "contain",
                                marginBottom: 6,
                              }}
                            />
                          )}
                          <div style={{ fontSize: 12, lineHeight: 1.3 }}>
                            {p.titulo}
                          </div>
                          {p.precio ? (
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                marginTop: 4,
                              }}
                            >
                              {p.precio.toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              €
                            </div>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
