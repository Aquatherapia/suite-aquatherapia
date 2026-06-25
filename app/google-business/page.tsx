"use client";

import { useState } from "react";
import Link from "next/link";

type Negocio = "tienda" | "aquatherapia";

export default function GoogleBusinessPage() {
  const [negocio, setNegocio] = useState<Negocio>("tienda");
  const [tema, setTema] = useState("");
  const [marca, setMarca] = useState("");
  const [servicio, setServicio] = useState("");
  const [productos, setProductos] = useState("");
  const [detalles, setDetalles] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);

  const campoSecundario = negocio === "tienda" ? marca : servicio;
  const puedeGenerar = tema.trim() && campoSecundario.trim();

  async function generar() {
    if (!puedeGenerar) return;
    setCargando(true);
    setError("");
    setTexto("");
    setCopiado(false);
    try {
      const res = await fetch("/api/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negocio,
          tema: tema.trim(),
          marca: negocio === "tienda" ? marca.trim() : undefined,
          servicio: negocio === "aquatherapia" ? servicio.trim() : undefined,
          productos: productos.trim() || undefined,
          detalles: detalles.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      setTexto(data.texto);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setCargando(false);
    }
  }

  function copiar() {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function cambiarNegocio(n: Negocio) {
    setNegocio(n);
    setTema("");
    setMarca("");
    setServicio("");
    setProductos("");
    setDetalles("");
    setTexto("");
    setError("");
  }

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Post para Google Business</h1>
        <p className="subtitle">
          Genera el texto para mantener tu ficha de Google actualizada.
        </p>
      </header>

      <div className="two-col">
        {/* ── Columna izquierda: formulario ── */}
        <div className="left-col">

          {/* Selector de negocio */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["tienda", "aquatherapia"] as Negocio[]).map((n) => (
              <button
                key={n}
                onClick={() => cambiarNegocio(n)}
                style={{
                  flex: 1,
                  marginTop: 0,
                  padding: "10px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: negocio === n ? "var(--accent)" : "#fff",
                  color: negocio === n ? "#fff" : "var(--ink)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {n === "tienda" ? "La Tienda de Cosméticos" : "Aquatherapia"}
              </button>
            ))}
          </div>

          <label>Tema *</label>
          <input
            type="text"
            placeholder={
              negocio === "tienda"
                ? "Ej: nuevos protectores solares, packs día de la madre, oferta verano..."
                : "Ej: ritual verano, promoción junio, nuevo tratamiento facial..."
            }
            value={tema}
            onChange={(e) => setTema(e.target.value)}
          />

          {negocio === "tienda" ? (
            <>
              <label>Marca *</label>
              <input
                type="text"
                placeholder="Ej: Mesoestetic, Casmara, Fhos, Medik8..."
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
              />
            </>
          ) : (
            <>
              <label>Servicio *</label>
              <input
                type="text"
                placeholder="Ej: Ritual hidratante, Masaje relajante, Peeling facial..."
                value={servicio}
                onChange={(e) => setServicio(e.target.value)}
              />
            </>
          )}

          <label>
            Productos a mencionar{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
              (opcional)
            </span>
          </label>
          <textarea
            rows={4}
            placeholder={
              negocio === "tienda"
                ? "Ej:\n- Mesoestetic Mesoprotech Solar Gel SPF50+\n- Mesoestetic Dry Touch Fluid SPF50+"
                : "Ej:\n- Ritual antimanchas\n- Masaje descontracturante"
            }
            value={productos}
            onChange={(e) => setProductos(e.target.value)}
          />

          <label>
            Detalles extra{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
              (opcional)
            </span>
          </label>
          <input
            type="text"
            placeholder="Ej: 20% descuento, solo hasta el 30 de junio, edición limitada..."
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generar()}
          />

          <button onClick={generar} disabled={cargando || !puedeGenerar}>
            {cargando ? (
              <>
                <span className="spinner" />
                Generando...
              </>
            ) : (
              "Generar post"
            )}
          </button>

          {error && <p className="error">{error}</p>}

          <div
            style={{
              marginTop: 20,
              padding: 14,
              background: "#f9f8f5",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--muted)",
              }}
            >
              Cómo publicar en GBP
            </p>
            <ol
              style={{
                margin: 0,
                paddingLeft: 16,
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.7,
              }}
            >
              <li>Abre Google Business Profile</li>
              <li>Añadir actualización → Actualización</li>
              <li>Pega el texto y sube una foto</li>
            </ol>
          </div>
        </div>

        {/* ── Columna derecha: resultado ── */}
        <div className="right-col">
          {!texto && !cargando && (
            <p className="placeholder">El resultado aparecerá aquí.</p>
          )}

          {texto && (
            <>
              <div className="seccion-bloque" style={{ marginBottom: 14 }}>
                <div className="seccion-header">
                  <span className="seccion-tag">
                    {negocio === "tienda"
                      ? "La Tienda de Cosméticos"
                      : "Aquatherapia"}
                  </span>
                  <div className="seccion-acciones">
                    <span className="meta-chars">{texto.length} chars</span>
                    <button className="regen-btn" onClick={copiar}>
                      {copiado ? "Copiado ✓" : "Copiar"}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    padding: "16px 14px",
                    fontSize: 14,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {texto}
                </div>
              </div>

              <button
                onClick={generar}
                disabled={cargando}
                style={{
                  background: "#fff",
                  color: "var(--ink)",
                  border: "1px solid var(--border)",
                }}
              >
                {cargando ? (
                  <>
                    <span className="spinner spinner-dark" />
                    Generando...
                  </>
                ) : (
                  "Regenerar versión diferente"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
