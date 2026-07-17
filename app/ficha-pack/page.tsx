"use client";

import { useState, useRef } from "react";
import Link from "next/link";

type Secciones = {
  titulo: string;
  descripcion: string;
  contenido: string;
  beneficios: string;
  activos: string;
  ingredientes: string;
  modo: string;
  ideal: string;
  metaTitle: string;
  metaDesc: string;
};

type Producto = { nombre: string; formato: string; url: string };

const SECCION_LABEL: Record<string, string> = {
  descripcion: "Descripción",
  beneficios: "Beneficios y propiedades",
  modo: "Modo de utilización",
};

export default function FichaPack() {
  const [form, setForm] = useState({
    nombre: "",
    linea: "",
    marca: "",
    descripcion: "",
    ingredientes: "",
    activosContexto: "",
  });
  const [productos, setProductos] = useState<Producto[]>([
    { nombre: "", formato: "", url: "" },
    { nombre: "", formato: "", url: "" },
  ]);
  const [incluirIngredientes, setIncluirIngredientes] = useState(false);
  const [incluirActivos, setIncluirActivos] = useState(false);
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

  function updateProducto(i: number, field: keyof Producto, value: string) {
    setProductos((ps) => ps.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }
  function addProducto() {
    setProductos((ps) => [...ps, { nombre: "", formato: "", url: "" }]);
  }
  function removeProducto(i: number) {
    setProductos((ps) => (ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps));
  }

  function payload() {
    return {
      ...form,
      // La API combina nombre + formato y enlaza ambas formas (con y sin el ml)
      productos: productos
        .filter((p) => p.nombre.trim())
        .map((p) => ({ nombre: p.nombre.trim(), formato: p.formato.trim(), url: p.url.trim() })),
      incluirIngredientes,
      incluirActivos,
    };
  }

  async function generar() {
    setLoading(true);
    setError("");
    setSecciones({});
    setCopied("");
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar la ficha del pack");
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
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), seccion, longitud }),
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
    secciones.contenido,
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
        <h1>Generador de fichas de packs</h1>
        <p>La Tienda de Cosméticos — monta la ficha de un pack o set y enlaza sus productos</p>
      </header>

      <div className="grid">
        {/* Formulario */}
        <div className="card">
          <label>Nombre del pack *</label>
          <input
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            placeholder="Ej: Set Firmeza Global"
          />
          <label>Línea / gama</label>
          <input
            value={form.linea}
            onChange={(e) => update("linea", e.target.value)}
            placeholder="Ej: Timexpert Lift_IN"
          />
          <label>Marca</label>
          <input
            value={form.marca}
            onChange={(e) => update("marca", e.target.value)}
            placeholder="Ej: Germaine"
          />

          <label>Productos del pack</label>
          <p className="pack-hint">
            Nombre, formato y enlace de cada producto. Se enlazarán automáticamente (nombre +
            formato) en la descripción, el modo de uso y el apartado &laquo;¿Qué contiene el
            pack?&raquo;.
          </p>
          <div className="pack-productos">
            {productos.map((p, i) => (
              <div className="pack-fila" key={i}>
                <div className="pack-fila-num">{i + 1}</div>
                <div className="pack-fila-inputs">
                  <div className="pack-nf">
                    <input
                      className="pack-nf-nombre"
                      value={p.nombre}
                      onChange={(e) => updateProducto(i, "nombre", e.target.value)}
                      placeholder="Nombre — Ej: Contorno de ojos"
                    />
                    <input
                      className="pack-nf-formato"
                      value={p.formato}
                      onChange={(e) => updateProducto(i, "formato", e.target.value)}
                      placeholder="Formato — Ej: 15ml"
                    />
                  </div>
                  <input
                    value={p.url}
                    onChange={(e) => updateProducto(i, "url", e.target.value)}
                    placeholder="Enlace — https://latiendadecosmeticos.com/..."
                  />
                </div>
                <button
                  type="button"
                  className="pack-quitar"
                  onClick={() => removeProducto(i)}
                  disabled={productos.length <= 1}
                  title="Quitar producto"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="pack-add" onClick={addProducto}>
            + Añadir producto
          </button>

          <label>Descripción / contexto del pack</label>
          <textarea
            rows={4}
            value={form.descripcion}
            onChange={(e) => update("descripcion", e.target.value)}
            placeholder="Pega aquí la descripción o para qué sirve el pack..."
          />

          <div className="pack-opciones">
            <label className="pack-check">
              <input
                type="checkbox"
                checked={incluirActivos}
                onChange={(e) => setIncluirActivos(e.target.checked)}
              />
              Incluir apartado de principios activos
            </label>
            {incluirActivos && (
              <textarea
                className="pack-cajetilla"
                rows={4}
                value={form.activosContexto}
                onChange={(e) => update("activosContexto", e.target.value)}
                placeholder="Principios activos (opcional) — si lo dejas vacío, la IA los redacta a partir de la descripción..."
              />
            )}
            <label className="pack-check">
              <input
                type="checkbox"
                checked={incluirIngredientes}
                onChange={(e) => setIncluirIngredientes(e.target.checked)}
              />
              Incluir apartado de ingredientes
            </label>
            {incluirIngredientes && (
              <textarea
                className="pack-cajetilla"
                rows={4}
                value={form.ingredientes}
                onChange={(e) => update("ingredientes", e.target.value)}
                placeholder="Ingredientes (INCI) — pega aquí la lista de ingredientes..."
              />
            )}
          </div>

          <button onClick={generar} disabled={!puedeGenerar}>
            {loading && <span className="spinner" />}
            {loading ? "Generando ficha..." : "Generar ficha del pack"}
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
                        <span className={`meta-chars ${secciones.metaTitle.length <= 60 ? "ok" : "warn"}`}>
                          {secciones.metaTitle.length} car.
                        </span>
                      )}
                      {editando === "metaTitle" && (
                        <span className={`meta-chars ${editMetaTexto.length <= 60 ? "ok" : "warn"}`}>
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
                          <button className="regen-btn" onClick={() => regenerar("titulo")} disabled={!!regenerando}>
                            {regenerando === "titulo" ? <><span className="spinner spinner-dark" /> Regenerando...</> : "↺ Regenerar"}
                          </button>
                          <button className="regen-btn" onClick={() => empezarEditar("titulo")}>✎ Editar</button>
                          <button className="copy-btn meta-copy" onClick={() => copiar(secciones.titulo!.replace(/<[^>]+>/g, ""), "titulo")}>
                            {copied === "titulo" ? "✓ Copiado" : "Copiar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {editando === "titulo" ? (
                    <div ref={editRef} contentEditable suppressContentEditableWarning className="titulo-preview output-editable" />
                  ) : (
                    <div className="titulo-preview" dangerouslySetInnerHTML={{ __html: secciones.titulo }} />
                  )}
                </div>
              )}

              {/* Botón copiar ficha completa */}
              <div className="copy-row">
                <button className="copy-btn" onClick={() => copiar(fichaHtml, "ficha", true)}>
                  {copied === "ficha" ? "✓ Copiado" : "Copiar ficha completa"}
                </button>
              </div>

              {/* Descripción (regenerable) */}
              {secciones.descripcion && (
                <SeccionRegenerable
                  keyName="descripcion"
                  label={SECCION_LABEL.descripcion}
                  html={secciones.descripcion}
                  editando={editando}
                  regenerando={regenerando}
                  editRef={editRef}
                  onCorto={() => regenerar("descripcion", "corto")}
                  onLargo={() => regenerar("descripcion", "largo")}
                  onRegen={() => regenerar("descripcion")}
                  onEditar={() => empezarEditar("descripcion")}
                  onGuardar={guardarEdicion}
                  onCancelar={() => setEditando("")}
                />
              )}

              {/* Beneficios (regenerable) */}
              {secciones.beneficios && (
                <SeccionRegenerable
                  keyName="beneficios"
                  label={SECCION_LABEL.beneficios}
                  html={secciones.beneficios}
                  editando={editando}
                  regenerando={regenerando}
                  editRef={editRef}
                  onCorto={() => regenerar("beneficios", "corto")}
                  onLargo={() => regenerar("beneficios", "largo")}
                  onRegen={() => regenerar("beneficios")}
                  onEditar={() => empezarEditar("beneficios")}
                  onGuardar={guardarEdicion}
                  onCancelar={() => setEditando("")}
                />
              )}

              {/* ¿Qué contiene el pack? (fija, enlaces garantizados) — debajo de beneficios */}
              {secciones.contenido && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">¿Qué contiene el pack?</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.contenido }} />
                </div>
              )}

              {/* Activos (fija, opcional) */}
              {secciones.activos && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">Principios activos</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.activos }} />
                </div>
              )}

              {/* Ingredientes (fija, opcional) */}
              {secciones.ingredientes && (
                <div className="seccion-bloque seccion-fija">
                  <div className="seccion-header">
                    <span className="seccion-tag">Ingredientes</span>
                  </div>
                  <div className="output" dangerouslySetInnerHTML={{ __html: secciones.ingredientes }} />
                </div>
              )}

              {/* Modo de utilización (regenerable) */}
              {secciones.modo && (
                <SeccionRegenerable
                  keyName="modo"
                  label={SECCION_LABEL.modo}
                  html={secciones.modo}
                  editando={editando}
                  regenerando={regenerando}
                  editRef={editRef}
                  onCorto={() => regenerar("modo", "corto")}
                  onLargo={() => regenerar("modo", "largo")}
                  onRegen={() => regenerar("modo")}
                  onEditar={() => empezarEditar("modo")}
                  onGuardar={guardarEdicion}
                  onCancelar={() => setEditando("")}
                />
              )}

              {/* Ideal para (fija) */}
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
            <div className="placeholder">La ficha del pack generada aparecerá aquí.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeccionRegenerable({
  keyName,
  label,
  html,
  editando,
  regenerando,
  editRef,
  onCorto,
  onLargo,
  onRegen,
  onEditar,
  onGuardar,
  onCancelar,
}: {
  keyName: string;
  label: string;
  html: string;
  editando: string;
  regenerando: string;
  editRef: React.RefObject<HTMLDivElement | null>;
  onCorto: () => void;
  onLargo: () => void;
  onRegen: () => void;
  onEditar: () => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="seccion-bloque">
      <div className="seccion-header">
        <span className="seccion-tag">{label}</span>
        <div className="seccion-acciones">
          {editando === keyName ? (
            <>
              <button className="regen-btn" onClick={onGuardar}>Guardar</button>
              <button className="regen-btn" onClick={onCancelar}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="regen-btn" onClick={onCorto} disabled={!!regenerando} title="Versión más breve">
                {regenerando === `${keyName}-corto` ? <span className="spinner spinner-dark" /> : "− Más corto"}
              </button>
              <button className="regen-btn" onClick={onLargo} disabled={!!regenerando} title="Versión más extensa">
                {regenerando === `${keyName}-largo` ? <span className="spinner spinner-dark" /> : "+ Más largo"}
              </button>
              <button className="regen-btn" onClick={onRegen} disabled={!!regenerando}>
                {regenerando === keyName ? <><span className="spinner spinner-dark" /> Regenerando...</> : "↺ Regenerar"}
              </button>
              <button className="regen-btn" onClick={onEditar}>✎ Editar</button>
            </>
          )}
        </div>
      </div>
      {editando === keyName ? (
        <div ref={editRef} contentEditable suppressContentEditableWarning className="output output-editable" />
      ) : (
        <div className="output" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
