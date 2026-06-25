"use client";

import { useState, useRef } from "react";
import Link from "next/link";

type Secciones = {
  titulo: string;
  descripcion: string;
  beneficios: string;
  activos: string;
  ingredientes: string;
  modo: string;
  ideal: string;
  metaTitle: string;
  metaDesc: string;
};

const SECCION_LABEL: Record<string, string> = {
  descripcion: "Descripción corta",
  beneficios: "Beneficios y propiedades",
  modo: "Modo de utilización",
};

export default function Home() {
  const [form, setForm] = useState({
    nombre: "",
    linea: "",
    marca: "",
    formato: "",
    descripcion: "",
    ingredientes: "",
  });
  const [secciones, setSecciones] = useState<Partial<Secciones>>({});
  const [loading, setLoading] = useState(false);
  const [regenerando, setRegenerando] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [editando, setEditando] = useState("");
  const [editMetaTexto, setEditMetaTexto] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function generar() {
    setLoading(true);
    setError("");
    setSecciones({});
    setCopied("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar la ficha");
      setSecciones(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function regenerar(seccion: string, longitud?: string) {
    const key = longitud ? `${seccion}-${longitud}` : seccion;
    setRegenerando(key);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, seccion, longitud }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al regenerar");
      setSecciones((prev) => ({ ...prev, [seccion]: data.html }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setRegenerando("");
    }
  }

  function empezarEditarMeta(key: string) {
    setEditando(key);
    setEditMetaTexto(secciones[key as keyof Secciones] || "");
  }

  function guardarEdicionMeta() {
    setSecciones((prev) => ({ ...prev, [editando]: editMetaTexto }));
    setEditando("");
  }

  function empezarEditar(key: string) {
    setEditando(key);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.innerHTML = secciones[key as keyof Secciones] || "";
        editRef.current.focus();
      }
    }, 0);
  }

  function guardarEdicion() {
    if (editRef.current) {
      setSecciones((prev) => ({ ...prev, [editando]: editRef.current!.innerHTML }));
    }
    setEditando("");
  }

  async function copiar(texto: string, key: string, esHtml = false) {
    if (esHtml) {
      try {
        const item = new ClipboardItem({
          "text/html": new Blob([texto], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } catch {
        await navigator.clipboard.writeText(texto);
      }
    } else {
      await navigator.clipboard.writeText(texto);
    }
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const fichaHtml = [
    secciones.descripcion,
    secciones.beneficios,
    secciones.activos,
    secciones.ingredientes,
    secciones.modo,
    secciones.ideal,
  ]
    .filter(Boolean)
    .join("\n");

  const hayFicha = !!fichaHtml;
  const puedeGenerar = form.nombre.trim() && !loading;

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="volver-link">← Herramientas IA</Link>
        <h1>Generador de fichas de producto</h1>
        <p>La Tienda de Cosméticos — rellena los datos y la IA redacta la ficha</p>
      </header>

      <div className="grid">
        {/* Formulario */}
        <div className="card">
          <label>Nombre del producto *</label>
          <input
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            placeholder="Ej: Sérum Rejuvenation"
          />
          <label>Línea / gama</label>
          <input
            value={form.linea}
            onChange={(e) => update("linea", e.target.value)}
            placeholder="Ej: The Botox"
          />
          <label>Marca</label>
          <input
            value={form.marca}
            onChange={(e) => update("marca", e.target.value)}
            placeholder="Ej: Fhos"
          />
          <label>Formato</label>
          <input
            value={form.formato}
            onChange={(e) => update("formato", e.target.value)}
            placeholder="Ej: 30ml  —  Si tiene más de un formato, sepáralos con comas"
          />
          <label>Descripción</label>
          <textarea
            rows={5}
            value={form.descripcion}
            onChange={(e) => update("descripcion", e.target.value)}
            placeholder="Pega aquí la descripción del producto..."
          />
          <label>Ingredientes (INCI)</label>
          <textarea
            rows={5}
            value={form.ingredientes}
            onChange={(e) => update("ingredientes", e.target.value)}
            placeholder="Pega aquí la lista de ingredientes..."
          />
          <button onClick={generar} disabled={!puedeGenerar}>
            {loading && <span className="spinner" />}
            {loading ? "Generando ficha..." : "Generar ficha"}
          </button>
          {error && <div className="error">{error}</div>}
        </div>

        {/* Resultado */}
        <div className="card">
          {hayFicha ? (
            <>
              {/* Meta etiquetas */}
              {(secciones.metaTitle || secciones.metaDesc) && (
                <div className="meta-box">
                  <div className="meta-row">
                    <div className="meta-label">
                      Meta title
                      {secciones.metaTitle && editando !== "metaTitle" && (
                        <span className={`meta-chars ${secciones.metaTitle.length >= 50 && secciones.metaTitle.length <= 60 ? "ok" : "warn"}`}>
                          {secciones.metaTitle.length} car.
                        </span>
                      )}
                      {editando === "metaTitle" && (
                        <span className={`meta-chars ${editMetaTexto.length >= 50 && editMetaTexto.length <= 60 ? "ok" : "warn"}`}>
                          {editMetaTexto.length} car.
                        </span>
                      )}
                    </div>
                    {editando === "metaTitle" ? (
                      <input
                        className="meta-input"
                        value={editMetaTexto}
                        onChange={(e) => setEditMetaTexto(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <div className="meta-value">{secciones.metaTitle}</div>
                    )}
                    <div className="meta-btns">
                      {editando === "metaTitle" ? (
                        <>
                          <button className="copy-btn meta-copy" onClick={guardarEdicionMeta}>Guardar</button>
                          <button className="copy-btn meta-copy" onClick={() => setEditando("")}>✕</button>
                        </>
                      ) : (
                        <>
                          <button className="copy-btn meta-copy" onClick={() => regenerar("metaTitle")} disabled={!!regenerando}>
                            {regenerando === "metaTitle" ? <span className="spinner spinner-dark" /> : "↺"}
                          </button>
                          <button className="copy-btn meta-copy" onClick={() => empezarEditarMeta("metaTitle")}>✎</button>
                          <button className="copy-btn meta-copy" onClick={() => copiar(secciones.metaTitle!, "metaTitle")}>
                            {copied === "metaTitle" ? "✓" : "Copiar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="meta-row">
                    <div className="meta-label">
                      Meta description
                      {secciones.metaDesc && editando !== "metaDesc" && (
                        <span className={`meta-chars ${secciones.metaDesc.length <= 160 ? "ok" : "warn"}`}>
                          {secciones.metaDesc.length} car.
                        </span>
                      )}
                      {editando === "metaDesc" && (
                        <span className={`meta-chars ${editMetaTexto.length <= 160 ? "ok" : "warn"}`}>
                          {editMetaTexto.length} car.
                        </span>
                      )}
                    </div>
                    {editando === "metaDesc" ? (
                      <textarea
                        className="meta-input"
                        value={editMetaTexto}
                        onChange={(e) => setEditMetaTexto(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                    ) : (
                      <div className="meta-value">{secciones.metaDesc}</div>
                    )}
                    <div className="meta-btns">
                      {editando === "metaDesc" ? (
                        <>
                          <button className="copy-btn meta-copy" onClick={guardarEdicionMeta}>Guardar</button>
                          <button className="copy-btn meta-copy" onClick={() => setEditando("")}>✕</button>
                        </>
                      ) : (
                        <>
                          <button className="copy-btn meta-copy" onClick={() => regenerar("metaDesc")} disabled={!!regenerando}>
                            {regenerando === "metaDesc" ? <span className="spinner spinner-dark" /> : "↺"}
                          </button>
                          <button className="copy-btn meta-copy" onClick={() => empezarEditarMeta("metaDesc")}>✎</button>
                          <button className="copy-btn meta-copy" onClick={() => copiar(secciones.metaDesc!, "metaDesc")}>
                            {copied === "metaDesc" ? "✓" : "Copiar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Título */}
              {secciones.titulo && (
                <div className="seccion-bloque titulo-bloque">
                  <div className="seccion-header">
                    <span className="seccion-tag">Título</span>
                    <div className="seccion-acciones">
                      {editando === "titulo" ? (
                        <>
                          <button className="regen-btn" onClick={guardarEdicion}>Guardar</button>
                          <button className="regen-btn" onClick={() => setEditando("")}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button
                            className="regen-btn"
                            onClick={() => regenerar("titulo")}
                            disabled={!!regenerando}
                          >
                            {regenerando === "titulo" ? <><span className="spinner spinner-dark" /> Regenerando...</> : "↺ Regenerar"}
                          </button>
                          <button className="regen-btn" onClick={() => empezarEditar("titulo")}>
                            ✎ Editar
                          </button>
                          <button className="copy-btn meta-copy" onClick={() => copiar(secciones.titulo!.replace(/<[^>]+>/g, ""), "titulo")}>
                            {copied === "titulo" ? "✓ Copiado" : "Copiar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {editando === "titulo" ? (
                    <div
                      ref={editRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="titulo-preview output-editable"
                    />
                  ) : (
                    <div
                      className="titulo-preview"
                      dangerouslySetInnerHTML={{ __html: secciones.titulo }}
                    />
                  )}
                </div>
              )}

              {/* Botón copiar ficha completa */}
              <div className="copy-row">
                <button className="copy-btn" onClick={() => copiar(fichaHtml, "ficha", true)}>
                  {copied === "ficha" ? "✓ Copiado" : "Copiar ficha completa"}
                </button>
              </div>

              {/* Secciones regenerables */}
              {(["descripcion", "beneficios", "modo"] as const).map((key) =>
                secciones[key] ? (
                  <div key={key} className="seccion-bloque">
                    <div className="seccion-header">
                      <span className="seccion-tag">{SECCION_LABEL[key]}</span>
                      <div className="seccion-acciones">
                        {editando === key ? (
                          <>
                            <button className="regen-btn" onClick={guardarEdicion}>Guardar</button>
                            <button className="regen-btn" onClick={() => setEditando("")}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button
                              className="regen-btn"
                              onClick={() => regenerar(key, "corto")}
                              disabled={!!regenerando}
                              title="Versión más breve"
                            >
                              {regenerando === `${key}-corto` ? <span className="spinner spinner-dark" /> : "− Más corto"}
                            </button>
                            <button
                              className="regen-btn"
                              onClick={() => regenerar(key, "largo")}
                              disabled={!!regenerando}
                              title="Versión más extensa"
                            >
                              {regenerando === `${key}-largo` ? <span className="spinner spinner-dark" /> : "+ Más largo"}
                            </button>
                            <button
                              className="regen-btn"
                              onClick={() => regenerar(key)}
                              disabled={!!regenerando}
                            >
                              {regenerando === key ? (
                                <><span className="spinner spinner-dark" /> Regenerando...</>
                              ) : (
                                "↺ Regenerar"
                              )}
                            </button>
                            <button className="regen-btn" onClick={() => empezarEditar(key)}>
                              ✎ Editar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editando === key ? (
                      <div
                        ref={editRef}
                        contentEditable
                        suppressContentEditableWarning
                        className="output output-editable"
                      />
                    ) : (
                      <div
                        className="output"
                        dangerouslySetInnerHTML={{ __html: secciones[key]! }}
                      />
                    )}
                  </div>
                ) : null
              )}

              {/* Secciones fijas (sin botón regenerar) */}
              {secciones.activos && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">Principios activos</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.activos }} />
                </div>
              )}
              {secciones.ingredientes && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">Ingredientes</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.ingredientes }} />
                </div>
              )}
              {secciones.ideal && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">Ideal para</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.ideal }} />
                </div>
              )}
            </>
          ) : (
            <div className="placeholder">
              La ficha generada aparecerá aquí.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
