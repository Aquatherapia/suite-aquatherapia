"use client";

import { useState } from "react";
import Link from "next/link";

type Canal = "whatsapp" | "email";
type Tipo = "extraviado" | "sin_stock" | "roto" | "otro";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "extraviado", label: "Envío extraviado / no llega" },
  { value: "sin_stock", label: "No ha salido de almacén (rotura de stock)" },
  { value: "roto", label: "Producto llegado roto / dañado" },
  { value: "otro", label: "Otro" },
];

export default function ReclamacionesPage() {
  const [nombre, setNombre] = useState("");
  const [pedido, setPedido] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [tipo, setTipo] = useState<Tipo>("extraviado");
  const [mensajeCliente, setMensajeCliente] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);

  async function generar() {
    setCargando(true);
    setError("");
    setTexto("");
    setCopiado(false);
    try {
      const res = await fetch("/api/reclamaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          pedido: pedido.trim(),
          canal,
          tipo,
          mensajeCliente: mensajeCliente.trim() || undefined,
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

  const puedeGenerar = nombre.trim() && pedido.trim() && !cargando;

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Reclamaciones de clientes</h1>
        <p className="subtitle">
          Rellena los datos del pedido y la reclamación, y la IA redacta la
          respuesta lista para enviar por WhatsApp o email, con tu tono
          habitual.
        </p>
      </header>

      <div className="two-col">
        {/* ── Columna izquierda: formulario ── */}
        <div className="left-col">
          <label>Nombre del cliente *</label>
          <input
            type="text"
            placeholder="Ej: Marta"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <label>Número de pedido *</label>
          <input
            type="text"
            placeholder="Ej: 10452"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
          />

          <label>Canal de respuesta</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["whatsapp", "email"] as Canal[]).map((c) => (
              <button
                key={c}
                onClick={() => setCanal(c)}
                style={{
                  flex: 1,
                  marginTop: 0,
                  padding: "10px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: canal === c ? "var(--accent)" : "#fff",
                  color: canal === c ? "#fff" : "var(--ink)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {c === "whatsapp" ? "WhatsApp" : "Correo electrónico"}
              </button>
            ))}
          </div>

          <label>Motivo de la reclamación</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <label>
            Lo que ha escrito la clienta/e{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
              (opcional)
            </span>
          </label>
          <textarea
            rows={6}
            placeholder="Pega aquí el mensaje del cliente…"
            value={mensajeCliente}
            onChange={(e) => setMensajeCliente(e.target.value)}
          />

          <button onClick={generar} disabled={!puedeGenerar}>
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
                    {canal === "whatsapp" ? "WhatsApp" : "Correo electrónico"}
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
