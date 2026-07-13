"use client";

import { useState } from "react";
import Link from "next/link";

type Canal = "whatsapp" | "email";
type Tipo =
  | "extraviado"
  | "sin_stock"
  | "contrareembolso"
  | "roto"
  | "equivocado"
  | "descatalogado"
  | "otro";
type SiNo = "si" | "no";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "sin_stock", label: "Retraso: no ha salido de almacén (rotura de stock)" },
  { value: "extraviado", label: "Envío extraviado / no llega (ya salió)" },
  { value: "contrareembolso", label: "Contrarreembolso recibido de vuelta" },
  { value: "roto", label: "Producto llegado roto / dañado" },
  { value: "equivocado", label: "Producto equivocado (enviado mal)" },
  { value: "descatalogado", label: "Producto descatalogado (ofrecer otro)" },
  { value: "otro", label: "Otro" },
];

// Grupo de botones tipo segmento (Sí / No, opciones...)
function Segmento<T extends string>({
  value,
  onChange,
  options,
  mb = 16,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
  mb?: number;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: mb }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            flex: 1,
            marginTop: 0,
            padding: "10px",
            fontSize: 13,
            fontWeight: 600,
            background: value === o.v ? "var(--accent)" : "#fff",
            color: value === o.v ? "#fff" : "var(--ink)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const hint = { fontSize: 12, color: "var(--muted)", marginBottom: 16 } as const;
const opcional = (
  <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>
);

export default function ReclamacionesPage() {
  const [nombre, setNombre] = useState("");
  const [pedido, setPedido] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [tipo, setTipo] = useState<Tipo>("sin_stock");
  // sin_stock
  const [productoPendiente, setProductoPendiente] = useState("");
  const [variosProductos, setVariosProductos] = useState<SiNo>("si");
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [fechaCompra, setFechaCompra] = useState("");
  // extraviado / contrareembolso
  const [incidencia, setIncidencia] = useState("");
  const [hayStock, setHayStock] = useState<SiNo>("si");
  const [contraRepetido, setContraRepetido] = useState<SiNo>("no");
  // roto / equivocado
  const [fotoRecibida, setFotoRecibida] = useState<SiNo>("no");
  const [hayQueRecoger, setHayQueRecoger] = useState<SiNo>("no");
  // descatalogado
  const [productoDescatalogado, setProductoDescatalogado] = useState("");
  const [alternativa1, setAlternativa1] = useState("");
  const [alternativa2, setAlternativa2] = useState("");
  // común
  const [mensajeCliente, setMensajeCliente] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [avisoInterno, setAvisoInterno] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const pideFoto = tipo === "equivocado" || tipo === "roto";

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
          // sin_stock
          productoPendiente:
            tipo === "sin_stock" ? productoPendiente.trim() || undefined : undefined,
          variosProductos: tipo === "sin_stock" ? variosProductos === "si" : undefined,
          fechaLlegada: tipo === "sin_stock" ? fechaLlegada || undefined : undefined,
          fechaCompra: tipo === "sin_stock" ? fechaCompra || undefined : undefined,
          // extraviado
          hayStock: tipo === "extraviado" ? hayStock === "si" : undefined,
          // extraviado + contrareembolso
          incidencia:
            tipo === "extraviado" || tipo === "contrareembolso"
              ? incidencia.trim() || undefined
              : undefined,
          // contrareembolso
          contraRepetido:
            tipo === "contrareembolso" ? contraRepetido === "si" : undefined,
          // roto / equivocado
          fotoRecibida: pideFoto ? fotoRecibida === "si" : undefined,
          hayQueRecoger:
            tipo === "roto" && fotoRecibida === "si"
              ? hayQueRecoger === "si"
              : undefined,
          // descatalogado
          productoDescatalogado:
            tipo === "descatalogado"
              ? productoDescatalogado.trim() || undefined
              : undefined,
          alternativa1:
            tipo === "descatalogado" ? alternativa1.trim() || undefined : undefined,
          alternativa2:
            tipo === "descatalogado" ? alternativa2.trim() || undefined : undefined,
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
        const plano = texto.replace(/\*\*(.+?)\*\*/g, "*$1*");
        await navigator.clipboard.writeText(plano);
      } else {
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
          <Segmento<Canal>
            value={canal}
            onChange={setCanal}
            mb={20}
            options={[
              { v: "whatsapp", label: "WhatsApp" },
              { v: "email", label: "Correo electrónico" },
            ]}
          />

          <label>Motivo de la reclamación</label>
          <select
            className="rc-select"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo)}
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* ── Retraso: no ha salido (rotura de stock) ── */}
          {tipo === "sin_stock" && (
            <>
              <label>Producto pendiente / que falta {opcional}</label>
              <input
                type="text"
                placeholder="Ej: Sérum Vitamina C 30 ml"
                value={productoPendiente}
                onChange={(e) => setProductoPendiente(e.target.value)}
              />

              <label>¿El pedido lleva más productos aparte del que falta?</label>
              <Segmento<SiNo>
                value={variosProductos}
                onChange={setVariosProductos}
                mb={4}
                options={[
                  { v: "si", label: "Sí, lleva más" },
                  { v: "no", label: "No, solo ese" },
                ]}
              />
              <div style={hint}>
                {variosProductos === "si"
                  ? "Se le ofrece esperar a tenerlo todo o enviar ya lo disponible y el pendiente después."
                  : "Solo ese producto: se le ofrece esperar la reposición o reembolso."}
              </div>

              <label>Fecha estimada de reposición {opcional}</label>
              <input
                type="date"
                value={fechaLlegada}
                onChange={(e) => setFechaLlegada(e.target.value)}
              />
              <div style={hint}>
                Si la sabes, se la indicamos al cliente; si no, no se da fecha.
              </div>

              <label>Fecha de la compra {opcional}</label>
              <input
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
              />
              <div style={hint}>
                Si han pasado más de 5 días laborables desde la compra, se le
                ofrece un regalo por la tardanza. 🎁
              </div>
            </>
          )}

          {/* ── Extraviado: ya salió y no llega ── */}
          {tipo === "extraviado" && (
            <>
              <label>¿Qué indica el seguimiento / incidencia del transporte? {opcional}</label>
              <textarea
                rows={2}
                placeholder="Ej: el paquete figura retenido en la delegación de reparto"
                value={incidencia}
                onChange={(e) => setIncidencia(e.target.value)}
              />

              <label>¿Tenemos otro en almacén?</label>
              <Segmento<SiNo>
                value={hayStock}
                onChange={setHayStock}
                mb={4}
                options={[
                  { v: "si", label: "Sí" },
                  { v: "no", label: "No" },
                ]}
              />
              <div style={hint}>
                {hayStock === "si"
                  ? "Se abre reclamación con transporte (plazo 24-72 h)."
                  : "Sin stock: además del aviso al cliente, saldrá un aviso interno para hacer pedido de reposición. ⚠️"}
              </div>
            </>
          )}

          {/* ── Contrareembolso con retraso ── */}
          {tipo === "contrareembolso" && (
            <>
              <label>¿Es la primera vez o ya había pasado antes?</label>
              <Segmento<SiNo>
                value={contraRepetido}
                onChange={setContraRepetido}
                mb={4}
                options={[
                  { v: "no", label: "Primera vez" },
                  { v: "si", label: "Ya había pasado" },
                ]}
              />
              <div style={hint}>
                {contraRepetido === "si"
                  ? "Ya pasó otra vez: esta vez se le pide el pago por adelantado antes de reenviar."
                  : "Primera vez: se le ofrece reenviarlo otra vez por contrarreembolso."}
              </div>

              <label>¿Por qué ha vuelto? (qué indica el transporte) {opcional}</label>
              <textarea
                rows={2}
                placeholder="Ej: no pudo entregarse / fue rechazado / no había nadie en el domicilio"
                value={incidencia}
                onChange={(e) => setIncidencia(e.target.value)}
              />
            </>
          )}

          {/* ── Roto / Equivocado: foto ── */}
          {pideFoto && (
            <>
              <label>
                ¿Nos ha enviado ya la foto del producto{" "}
                {tipo === "roto" ? "roto" : "incorrecto"}?
              </label>
              <Segmento<SiNo>
                value={fotoRecibida}
                onChange={setFotoRecibida}
                options={[
                  { v: "si", label: "Sí" },
                  { v: "no", label: "No, aún no" },
                ]}
              />

              {tipo === "roto" && fotoRecibida === "si" && (
                <>
                  <label>¿Hay que recoger el producto roto?</label>
                  <Segmento<SiNo>
                    value={hayQueRecoger}
                    onChange={setHayQueRecoger}
                    mb={4}
                    options={[
                      { v: "si", label: "Sí, recogerlo" },
                      { v: "no", label: "No hace falta" },
                    ]}
                  />
                  <div style={hint}>
                    {hayQueRecoger === "si"
                      ? "Recogida y entrega simultánea con el repartidor."
                      : "Se le envía una nueva unidad directamente."}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Descatalogado ── */}
          {tipo === "descatalogado" && (
            <>
              <label>Producto descatalogado {opcional}</label>
              <input
                type="text"
                placeholder="Ej: Crema Hidratante XYZ 50 ml"
                value={productoDescatalogado}
                onChange={(e) => setProductoDescatalogado(e.target.value)}
              />

              <label>Alternativa 1 que ofrecemos {opcional}</label>
              <input
                type="text"
                placeholder="Ej: Crema Hidratante ABC 50 ml"
                value={alternativa1}
                onChange={(e) => setAlternativa1(e.target.value)}
              />

              <label>Alternativa 2 que ofrecemos {opcional}</label>
              <input
                type="text"
                placeholder="Ej: Crema Hidratante DEF 50 ml"
                value={alternativa2}
                onChange={(e) => setAlternativa2(e.target.value)}
              />
              <div style={hint}>
                Si dejas las alternativas vacías, no se inventan: se ofrece
                buscar una alternativa o el reembolso.
              </div>
            </>
          )}

          <label>Lo que ha escrito la clienta/e {opcional}</label>
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
