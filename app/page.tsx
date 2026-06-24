"use client";

import { useState } from "react";

export default function Home() {
  const [form, setForm] = useState({
    nombre: "",
    tamano: "",
    descripcion: "",
    ingredientes: "",
  });
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function generar() {
    setLoading(true);
    setError("");
    setOutput("");
    setCopied(false);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar la ficha");
      setOutput(data.ficha);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const puedeGenerar = form.nombre.trim() && !loading;

  return (
    <div className="wrap">
      <header>
        <h1>Generador de fichas de producto</h1>
        <p>La Tienda de Cosméticos — rellena los datos y la IA redacta la ficha</p>
      </header>

      <div className="grid">
        <div className="card">
          <label>Nombre del producto *</label>
          <input
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            placeholder="Ej: Melan 130+ pigment control, mesoestetic"
          />

          <label>Tamaño</label>
          <input
            value={form.tamano}
            onChange={(e) => update("tamano", e.target.value)}
            placeholder="Ej: 50ml"
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

        <div className="card">
          {output ? (
            <>
              <button className="copy-btn" onClick={copiar}>
                {copied ? "✓ Copiado" : "Copiar ficha"}
              </button>
              <div className="output">{output}</div>
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
