"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface Archivo {
  name: string;
  content: string;
}

function recortar(content: string, maxLineas = 250): string {
  const lineas = content.split(/\r?\n/);
  return lineas.length > maxLineas
    ? lineas.slice(0, maxLineas).join("\n") +
        `\n…(+${lineas.length - maxLineas} filas más)`
    : content;
}

// ── Convertir el texto del informe en bloques con formato ──
type Bloque = { type: "h2" | "h3" | "bullet" | "p"; text: string };

function esMayus(s: string): boolean {
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letras.length > 0 && letras === letras.toUpperCase();
}

function clasificar(texto: string): Bloque[] {
  const out: Bloque[] = [];
  for (const raw of texto.replace(/\r/g, "").split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    if (/^\d{1,2}\.\s+/.test(t) && esMayus(t)) {
      out.push({ type: "h2", text: t });
    } else if (/^[-•]\s+/.test(t)) {
      out.push({ type: "bullet", text: t.replace(/^[-•]\s+/, "") });
    } else if (esMayus(t) && t.length <= 75) {
      out.push({ type: "h3", text: t });
    } else if (t.endsWith(":") && t.length <= 75) {
      out.push({ type: "h3", text: t });
    } else {
      out.push({ type: "p", text: t });
    }
  }
  return out;
}

// Divide un texto resaltando los porcentajes (+ verde / − rojo).
function trozosPct(text: string): { t: string; color?: string }[] {
  const partes: { t: string; color?: string }[] = [];
  const re = /([+-]\d[\d.,]*\s?%)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) partes.push({ t: text.slice(last, m.index) });
    partes.push({ t: m[0], color: m[0].startsWith("-") ? "#b00020" : "#2a7a2a" });
    last = m.index + m[0].length;
  }
  if (last < text.length) partes.push({ t: text.slice(last) });
  return partes;
}

export default function InformesPage() {
  const [periodo, setPeriodo] = useState("");
  const [periodoComparacion, setPeriodoComparacion] = useState("");
  const [notas, setNotas] = useState("");
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [arrastrando, setArrastrando] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [informe, setInforme] = useState("");
  const [copiado, setCopiado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function añadirFicheros(fileList: FileList | null) {
    if (!fileList) return;
    const nuevos: Archivo[] = [];
    for (const file of Array.from(fileList)) {
      const texto = await file.text();
      nuevos.push({ name: file.name, content: recortar(texto) });
    }
    setArchivos((prev) => [...prev, ...nuevos]);
    setError("");
  }

  function quitar(i: number) {
    setArchivos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generar() {
    if (archivos.length === 0) return;
    setCargando(true);
    setError("");
    setInforme("");
    setCopiado(false);
    try {
      const res = await fetch("/api/informes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, periodoComparacion, notas, archivos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      setInforme(data.informe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al generar el informe");
    } finally {
      setCargando(false);
    }
  }

  function copiar() {
    navigator.clipboard.writeText(informe);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  // ── Exportar a PDF: abre una ventana con el informe maquetado y lanza
  //    el diálogo de impresión del navegador (Guardar como PDF). Gratis. ──
  function descargarPDF() {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const pctHTML = (s: string) =>
      esc(s).replace(
        /([+-]\d[\d.,]*\s?%)/g,
        (m) =>
          `<span style="color:${m.startsWith("-") ? "#b00020" : "#1d7a1d"};font-weight:600">${m}</span>`
      );

    const bloques = clasificar(informe);
    let cuerpo = "";
    let enLista = false;
    const cerrarLista = () => {
      if (enLista) {
        cuerpo += "</ul>";
        enLista = false;
      }
    };
    for (const b of bloques) {
      if (b.type === "bullet") {
        if (!enLista) {
          cuerpo += "<ul>";
          enLista = true;
        }
        cuerpo += `<li>${pctHTML(b.text)}</li>`;
        continue;
      }
      cerrarLista();
      if (b.type === "h2") cuerpo += `<h2>${esc(b.text)}</h2>`;
      else if (b.type === "h3") cuerpo += `<h3>${esc(b.text)}</h3>`;
      else cuerpo += `<p>${pctHTML(b.text)}</p>`;
    }
    cerrarLista();

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Informe de marketing — ${esc(periodo || "")}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #2b2b2b; font-size: 12px; line-height: 1.55; }
  .cab { border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 20px; }
  .marca { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #7a7a7a; font-weight: 700; }
  .titulo { font-size: 22px; font-weight: 700; margin: 6px 0 2px; }
  .periodo { font-size: 13px; color: #555; }
  h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e2ddd5; page-break-after: avoid; }
  h3 { font-size: 12.5px; margin: 14px 0 4px; color: #1a1a1a; page-break-after: avoid; }
  p { margin: 4px 0; }
  ul { margin: 4px 0 10px; padding-left: 18px; }
  li { margin: 3px 0; }
  h2, h3 { page-break-inside: avoid; }
</style></head>
<body>
  <div class="cab">
    <div class="marca">La Tienda de Cosméticos</div>
    <div class="titulo">Informe de marketing mensual</div>
    <div class="periodo">${esc(periodo || "")}${periodoComparacion ? ` · comparado con ${esc(periodoComparacion)}` : ""}</div>
  </div>
  ${cuerpo}
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Permite las ventanas emergentes para descargar el PDF.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const bloques = informe ? clasificar(informe) : [];

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Informe de marketing mensual</h1>
        <p className="subtitle">
          Sube los CSV que exportes de Analytics, Google Ads o tu tienda. La IA
          los lee, los agrupa por fuente y te monta el informe completo.
        </p>
      </header>

      {/* Periodo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div>
          <label style={{ marginTop: 0 }}>Mes del informe</label>
          <input
            type="text"
            placeholder="Ej: Mayo 2026"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
        </div>
        <div>
          <label style={{ marginTop: 0 }}>
            Comparar con{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
              (año anterior)
            </span>
          </label>
          <input
            type="text"
            placeholder="Ej: Mayo 2025"
            value={periodoComparacion}
            onChange={(e) => setPeriodoComparacion(e.target.value)}
          />
        </div>
      </div>

      {/* Zona de subida */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          añadirFicheros(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${arrastrando ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "30px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: arrastrando ? "#f4f2ee" : "#fcfbf9",
          transition: "border-color .15s, background .15s",
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>⬆</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          Arrastra aquí tus CSV o haz clic para elegirlos
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Puedes subir varios a la vez (canales, productos, Google Ads…)
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            añadirFicheros(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Lista de archivos */}
      {archivos.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: "14px 0 0",
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {archivos.map((a, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom:
                  i < archivos.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: 13,
              }}
            >
              <span>📄 {a.name}</span>
              <button
                onClick={() => quitar(i)}
                className="vp-delete-btn"
                title="Quitar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <label style={{ marginTop: 18 }}>
        Notas / objetivos del mes{" "}
        <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>
      </label>
      <textarea
        rows={2}
        placeholder="Ej: este mes lanzamos campaña de rebajas; objetivo subir pedidos un 10%…"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
      />

      <button onClick={generar} disabled={cargando || archivos.length === 0}>
        {cargando ? (
          <>
            <span className="spinner" />
            Generando informe…
          </>
        ) : (
          "Generar informe mensual"
        )}
      </button>

      {archivos.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Sube al menos un CSV para poder generar el informe.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {/* Resultado */}
      {informe && (
        <div className="seccion-bloque" style={{ marginTop: 26 }}>
          <div className="seccion-header">
            <span className="seccion-tag">Informe de marketing mensual</span>
            <div className="seccion-acciones">
              <button className="regen-btn" onClick={copiar}>
                {copiado ? "Copiado ✓" : "Copiar"}
              </button>
              <button className="regen-btn" onClick={descargarPDF}>
                Descargar PDF
              </button>
            </div>
          </div>
          <div className="informe-render">
            {bloques.map((b, i) => {
              if (b.type === "h2")
                return <h2 key={i} className="inf-h2">{b.text}</h2>;
              if (b.type === "h3")
                return <h3 key={i} className="inf-h3">{b.text}</h3>;
              if (b.type === "bullet")
                return (
                  <li key={i} className="inf-li">
                    {trozosPct(b.text).map((p, j) => (
                      <span key={j} style={p.color ? { color: p.color, fontWeight: 600 } : undefined}>
                        {p.t}
                      </span>
                    ))}
                  </li>
                );
              return (
                <p key={i} className="inf-p">
                  {trozosPct(b.text).map((p, j) => (
                    <span key={j} style={p.color ? { color: p.color, fontWeight: 600 } : undefined}>
                      {p.t}
                    </span>
                  ))}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
