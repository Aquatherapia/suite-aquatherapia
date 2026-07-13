"use client";

import { useState } from "react";
import Link from "next/link";

type Canal = "whatsapp" | "email";
type Tipo =
  | "extraviado"
  | "sin_stock"
  | "roto"
  | "equivocado"
  | "descatalogado"
  | "otro";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "extraviado", label: "Envío extraviado / no llega" },
  { value: "sin_stock", label: "No ha salido de almacén (rotura de stock)" },
  { value: "roto", label: "Producto llegado roto / dañado" },
  { value: "equivocado", label: "Producto equivocado (enviado mal)" },
  { value: "descatalogado", label: "Producto descatalogado (ofrecer otro)" },
  { value: "otro", label: "Otro" },
];

export default function ReclamacionesPage() {
  const [nombre, setNombre] = useState("");
  const [pedido, setPedido] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [tipo, setTipo] = useState<Tipo>("extraviado");
  const [fechaCompra, setFechaCompra] = useState("");
  const [productoPendiente, setProductoPendiente] = useState("");
  const [variosProductos, setVariosProductos] = useState<"si" | "no">("si");
  const [productoDescatalogado, setProductoDescatalogado] = useState("");
  const [productoAlternativo, setProductoAlternativo] = useState("");
  const [fotoRecibida, setFotoRecibida] = useState<"si" | "no">("no");
  const [hayStock, setHayStock] = useState<"si" | "no">("si");
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [mensajeCliente, setMensajeCliente] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [avisoInterno, setAvisoInterno] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function generar() {
    setCargando(true);
    setError("");
    setTexto("");
    setAvisoInterno(false);
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
          fechaCompra: tipo === "sin_stock" ? fechaCompra || undefined : undefined,
          productoPendiente:
            tipo === "sin_stock" ? productoPendiente.trim() || undefined : undefined,
          variosProductos: tipo === "sin_stock" ? variosProductos === "si" : undefined,
          productoDescatalogado:
            tipo === "descatalogado"
              ? productoDescatalogado.trim() || undefined
              : undefined,
          productoAlternativo:
            tipo === "descatalogado"
              ? productoAlternativo.trim() || undefined
              : undefined,
          fotoRecibida: pideFoto ? fotoRecibida === "si" : undefined,
          hayStock: pideStock ? hayStock === "si" : undefined,
          fechaLlegada:
            pideStock && hayStock === "no" && tipo !== "extraviado"
              ? fechaLlegada || undefined
              : undefined,
          mensajeCliente: mensajeCliente.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      setTexto(data.texto);
      setAvisoInterno(!!data.avisoInterno);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setCargando(false);
    }
  }

  // **negrita** → HTML (para la vista previa y el copiado a email con formato)
  function escapeHtml(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function toHtml(t: string) {
    return escapeHtml(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  async function copiar() {
    try {
      if (canal === "whatsapp") {
        // WhatsApp usa *un asterisco* para negrita
        const plano = texto.replace(/\*\*(.+?)\*\*/g, "*$1*");
        await navigator.clipboard.writeText(plano);
      } else {
        // Email: copiamos con formato real (negritas) + versión plano de reserva
        const html = toHtml(texto);
        const plano = texto.replace(/\*\*(.+?)\*\*/g, "$1");
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plano], { type: "text/plain" }),
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(plano);
        }
      }
    } catch {
      await navigator.clipboard.writeText(texto.replace(/\*\*(.+?)\*\*/g, "$1"));
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const pideFoto = tipo === "equivocado" || tipo === "roto";
  const pideStock = pideFoto || tipo === "sin_stock" || tipo === "extraviado";
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

          {tipo === "descatalogado" && (
            <>
              <label>
                Producto descatalogado{" "}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                  (opcional)
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Crema Hidratante XYZ 50 ml"
                value={productoDescatalogado}
                onChange={(e) => setProductoDescatalogado(e.target.value)}
              />

              <label>
                Producto alternativo que ofrecemos{" "}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                  (opcional)
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Crema Hidratante ABC 50 ml"
                value={productoAlternativo}
                onChange={(e) => setProductoAlternativo(e.target.value)}
              />
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}
              >
                Si dejas el alternativo vacío, no se inventa ninguno: se ofrece
                buscar una alternativa o el reembolso.
              </div>
            </>
          )}

          {pideFoto && (
            <>
              <label>
                ¿Nos ha enviado ya la foto del producto{" "}
                {tipo === "roto" ? "roto" : "incorrecto"}?
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["si", "no"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFotoRecibida(v)}
                    style={{
                      flex: 1,
                      marginTop: 0,
                      padding: "10px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: fotoRecibida === v ? "var(--accent)" : "#fff",
                      color: fotoRecibida === v ? "#fff" : "var(--ink)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    {v === "si" ? "Sí" : "No, aún no"}
                  </button>
                ))}
              </div>
            </>
          )}

          {tipo === "sin_stock" && (
            <>
              <label>
                Producto pendiente / que falta{" "}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                  (opcional)
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Sérum Vitamina C 30 ml"
                value={productoPendiente}
                onChange={(e) => setProductoPendiente(e.target.value)}
              />

              <label>¿El pedido lleva más productos aparte del que falta?</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                {(["si", "no"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVariosProductos(v)}
                    style={{
                      flex: 1,
                      marginTop: 0,
                      padding: "10px",
                      fontSize: 13,
                      fontWeight: 600,
                      background:
                        variosProductos === v ? "var(--accent)" : "#fff",
                      color: variosProductos === v ? "#fff" : "var(--ink)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    {v === "si" ? "Sí, lleva más" : "No, solo ese"}
                  </button>
                ))}
              </div>
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}
              >
                {variosProductos === "si"
                  ? "Se le ofrece enviar ya lo disponible y el pendiente después."
                  : "Solo ese producto: se le ofrece esperar la reposición o reembolso."}
              </div>

              <label>
                Fecha de la compra{" "}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                  (opcional)
                </span>
              </label>
              <input
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
              />
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}
              >
                Si han pasado más de 5 días laborables desde la compra, se le
                ofrece un regalo por la tardanza. 🎁
              </div>
            </>
          )}

          {pideStock && (
            <>
              <label>
                {tipo === "extraviado"
                  ? "¿Tenemos otro en almacén?"
                  : "¿Tenemos stock del producto?"}
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                {(["si", "no"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setHayStock(v)}
                    style={{
                      flex: 1,
                      marginTop: 0,
                      padding: "10px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: hayStock === v ? "var(--accent)" : "#fff",
                      color: hayStock === v ? "#fff" : "var(--ink)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    {v === "si" ? "Sí" : "No"}
                  </button>
                ))}
              </div>

              {hayStock === "si" ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginBottom: 16,
                  }}
                >
                  {tipo === "extraviado"
                    ? "Hay otro en almacén: se le envía otro hoy mismo. 📦"
                    : "Hay stock: se le dice que le sale hoy mismo. 📦"}
                </div>
              ) : tipo === "extraviado" ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginBottom: 16,
                  }}
                >
                  Sin stock en almacén: al generar saldrá un aviso interno para
                  que hagáis pedido de reposición. ⚠️
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      margin: "4px 0 8px",
                    }}
                  >
                    Sin stock. ¿Sabes cuándo os entra la reposición? Se le dirá
                    que le llega ~2 días laborables después.
                  </div>
                  <label>
                    ¿Cuándo os llega la reposición?{" "}
                    <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={fechaLlegada}
                    onChange={(e) => setFechaLlegada(e.target.value)}
                    style={{ marginBottom: 16 }}
                  />
                </>
              )}
            </>
          )}

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

          {avisoInterno && (
            <div
              style={{
                marginBottom: 14,
                padding: "12px 14px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
                color: "#9a3412",
              }}
            >
              <strong>⚠️ Aviso interno (no se envía al cliente):</strong> no hay
              otro en almacén para el pedido {pedido || "—"}. Hay que hacer{" "}
              <strong>pedido de reposición</strong> para poder reenviárselo.
            </div>
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
                  dangerouslySetInnerHTML={{ __html: toHtml(texto) }}
                />
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
