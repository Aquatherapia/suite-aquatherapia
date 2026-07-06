"use client";

import { useState } from "react";
import Link from "next/link";

type Negocio = "tienda" | "aquatherapia";

export default function ResponderResenasPage() {
  const [negocio, setNegocio] = useState<Negocio>("tienda");
  const [autor, setAutor] = useState("");
  const [estrellas, setEstrellas] = useState<number>(5);
  const [resena, setResena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);

  const puedeGenerar = resena.trim().length > 0;

  async function generar() {
    if (!puedeGenerar) return;
    setCargando(true);
    setError("");
    setTexto("");
    setCopiado(false);
    try {
      const res = await fetch("/api/responder-resenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negocio,
          autor: autor.trim() || undefined,
          estrellas,
          resena: resena.trim(),
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

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Responder reseñas de Google</h1>
        <p className="subtitle">
          Pega la reseña de un cliente y la IA redacta una respuesta profesional
          lista para publicar.
        </p>
      </header>

      <div className="two-col">
        {/* ── Columna izquierda: formulario ── */}
        <div className="left-col">
          {/* Selector de negocio */}
          <label>¿De qué negocio es la reseña? *</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["tienda", "aquatherapia"] as Negocio[]).map((n) => (
              <button
                key={n}
                onClick={() => setNegocio(n)}
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

          <label>
            Nombre del cliente{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
              (opcional)
            </span>
          </label>
          <input
            type="text"
            placeholder="Ej: María G."
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
          />

          <label>Valoración</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setEstrellas(n)}
                title={`${n} estrella${n !== 1 ? "s" : ""}`}
                style={{
                  marginTop: 0,
                  width: 40,
                  padding: "8px 0",
                  fontSize: 18,
                  lineHeight: 1,
                  background: n <= estrellas ? "#fef3c7" : "#fff",
                  color: n <= estrellas ? "#d97706" : "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {n <= estrellas ? "★" : "☆"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
            {estrellas} de 5 — ayuda a ajustar el tono de la respuesta.
          </div>

          <label>Texto de la reseña *</label>
          <textarea
            rows={7}
            placeholder="Pega aquí lo que ha escrito el cliente en Google…"
            value={resena}
            onChange={(e) => setResena(e.target.value)}
          />

          <button onClick={generar} disabled={cargando || !puedeGenerar}>
            {cargando ? (
              <>
                <span className="spinner" />
                Generando…
              </>
            ) : (
              "Redactar respuesta"
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
              Cómo publicar la respuesta
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
              <li>Abre Google Business Profile → Reseñas</li>
              <li>Busca la reseña y pulsa "Responder"</li>
              <li>Pega el texto y publícalo</li>
            </ol>
          </div>
        </div>

        {/* ── Columna derecha: resultado ── */}
        <div className="right-col">
          {!texto && !cargando && (
            <p className="placeholder">La respuesta aparecerá aquí.</p>
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
                    Generando…
                  </>
                ) : (
                  "Redactar otra versión"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
