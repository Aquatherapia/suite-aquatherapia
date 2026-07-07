"use client";

import { useState } from "react";
import Link from "next/link";

type Fila = {
  margen: number;
  id: string;
  ean: string;
  producto: string;
  propiedad: string;
  precio: number;
  coste: number;
  causa: "DESCUENTO" | "PRECIO/COSTE";
  detalle: string;
  perdidas: boolean;
};

type Omitido = {
  id: string;
  ean: string;
  producto: string;
  propiedad: string;
  precio: number;
  motivo: "SIN COSTE" | "SIN PRECIO";
};

type Resultado = {
  marca: string;
  analizados: number;
  omitidos: Omitido[];
  filas: Fila[];
};

function num(s: string): number {
  const t = (s || "").trim();
  if (!t) return 0;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function margen(precio: number, coste: number, iva: number): number | null {
  if (precio <= 0) return null;
  const psiva = precio / (1 + iva / 100);
  return ((psiva - coste) / psiva) * 100;
}

function analizar(texto: string, umbral: number, iva: number): Resultado {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  lineas.shift(); // cabecera
  const filas: Fila[] = [];
  const omitidos: Omitido[] = [];
  let analizados = 0;
  let marca = "";

  for (const linea of lineas) {
    const c = linea.split(";");
    if (c.length < 12 || !c[0].trim()) continue;
    const id = c[0].trim();
    const mar = (c[4] || "").trim();
    const producto = (c[5] || "").trim();
    const ean = (c[7] || "").trim(); // EAN (código de barras)
    const propiedad = (c[6] || "").trim();
    const precio = num(c[8]); // PRECIO (con IVA, con descuento aplicado)
    const pant = num(c[9]); // P. ANT (tarifa sin descuento)
    const desc = num(c[10]); // DESC %
    const coste = num(c[11]); // P.COSTE REAL (sin IVA)

    if (mar && !marca) marca = mar;
    // Regalos / productos sin precio de venta: no tienen margen que calcular
    if (precio <= 0) continue;
    // Producto con precio pero sin coste cargado: no se puede calcular el margen
    if (coste <= 0) {
      omitidos.push({ id, ean, producto, propiedad, precio, motivo: "SIN COSTE" });
      continue;
    }
    analizados++;
    const mActual = margen(precio, coste, iva);
    if (mActual === null || mActual >= umbral) continue;

    const mTarifa = margen(pant > 0 ? pant : precio, coste, iva);
    let causa: "DESCUENTO" | "PRECIO/COSTE";
    let detalle: string;
    if (mTarifa !== null && mTarifa >= umbral) {
      causa = "DESCUENTO";
      detalle = `Dto ${desc.toFixed(0)}% → a tarifa daría ${mTarifa.toFixed(0)}%`;
    } else {
      causa = "PRECIO/COSTE";
      detalle = `Aun sin descuento sería ${mTarifa !== null ? mTarifa.toFixed(0) : "?"}%`;
    }
    filas.push({
      margen: mActual,
      id,
      ean,
      producto,
      propiedad,
      precio,
      coste,
      causa,
      detalle,
      perdidas: mActual < 0,
    });
  }

  filas.sort((a, b) => a.margen - b.margen);
  return { marca, analizados, omitidos, filas };
}

export default function Margenes() {
  const [umbral, setUmbral] = useState(30);
  const [iva, setIva] = useState(21);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState("");
  const [verOmitidos, setVerOmitidos] = useState(false);

  function procesar(texto: string) {
    setError("");
    try {
      const res = analizar(texto, umbral, iva);
      if (res.analizados === 0) {
        setError(
          "No se han encontrado productos con coste válido. ¿Seguro que es el CSV de control de stocks (separado por ;)?"
        );
        setResultado(null);
        return;
      }
      setResultado(res);
    } catch {
      setError("No se ha podido leer el archivo. Comprueba que es el CSV de control de stocks.");
      setResultado(null);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = () => procesar(String(reader.result));
    reader.readAsText(file, "utf-8");
  }

  function exportarExcel() {
    if (!resultado || (resultado.filas.length === 0 && resultado.omitidos.length === 0))
      return;
    const sep = ";";
    const dec = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
    const esc = (v: string) => {
      const s = String(v ?? "");
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const cols = [
      "EAN",
      "Producto",
      "Propiedad",
      "Margen %",
      "PVP con IVA (€)",
      "PVP sin IVA (€)",
      "Coste sin IVA (€)",
      "Problema",
      "Detalle",
    ];
    const lineas = ["sep=;", cols.join(sep)];
    for (const f of resultado.filas) {
      const psiva = f.precio / (1 + iva / 100);
      lineas.push(
        [
          `="${f.ean}"`, // fuerza texto para no perder el EAN en Excel
          esc(f.producto),
          esc(f.propiedad),
          dec(f.margen, 1),
          dec(f.precio),
          dec(psiva),
          dec(f.coste),
          f.causa === "DESCUENTO" ? "Descuento excesivo" : "Precio/Coste",
          esc(f.detalle),
        ].join(sep)
      );
    }
    // Productos sin coste cargado: van al final para que les metan el coste
    for (const o of resultado.omitidos) {
      lineas.push(
        [
          `="${o.ean}"`,
          esc(o.producto),
          esc(o.propiedad),
          "", // sin margen (no calculable)
          dec(o.precio),
          "", // sin PVP sin IVA
          "", // sin coste: es lo que hay que rellenar
          "Sin coste cargado",
          "Cargar el coste para poder calcular el margen",
        ].join(sep)
      );
    }
    const contenido = "﻿" + lineas.join("\r\n");
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const fecha = new Date().toISOString().slice(0, 10);
    const marcaSlug = (resultado.marca || "sin-marca")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `margenes-bajos_${marcaSlug}_${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Control de márgenes</h1>
      <p className="subtitle">
        Sube el CSV de control de stocks y te marca los productos con menos del{" "}
        {umbral}% de margen entre el PRECIO (con IVA) y el P.COSTE REAL (sin IVA).
        Para cada uno te dice si es por un descuento excesivo o por el precio/coste.
      </p>

      <div className="mg-controls">
        <label className="mg-field">
          Margen mínimo deseado
          <div className="mg-input-suffix">
            <input
              type="number"
              value={umbral}
              min={0}
              max={99}
              onChange={(e) => setUmbral(Number(e.target.value))}
            />
            <span>%</span>
          </div>
        </label>
        <label className="mg-field">
          IVA del precio
          <div className="mg-input-suffix">
            <input
              type="number"
              value={iva}
              min={0}
              max={30}
              onChange={(e) => setIva(Number(e.target.value))}
            />
            <span>%</span>
          </div>
        </label>
        <label className="mg-upload">
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          <span className="mg-upload-btn">📄 Subir CSV</span>
          <span className="mg-upload-name">{nombreArchivo || "Ningún archivo"}</span>
        </label>
      </div>

      <p className="mg-hint">
        Descarga el CSV desde PrestaShop (Control de stocks) y súbelo. Si cambias
        el margen o el IVA, vuelve a subir el archivo para recalcular.
      </p>

      {error && <div className="error">{error}</div>}

      {resultado && (
        <div className="mg-resultado">
          <div className="mg-resumen">
            <div className="mg-resumen-marca">
              {resultado.marca || "Sin marca detectada"}
            </div>
            <div className="mg-resumen-stats">
              <span className="mg-stat">
                <strong>{resultado.filas.length}</strong> por debajo del {umbral}%
              </span>
              <span className="mg-stat">
                {resultado.analizados} analizados
              </span>
              {resultado.omitidos.length > 0 && (
                <span className="mg-stat mg-stat-muted">
                  {resultado.omitidos.length} sin coste (no calculables)
                </span>
              )}
            </div>
          </div>

          {(resultado.filas.length > 0 || resultado.omitidos.length > 0) && (
            <div className="mg-export-bar">
              <button className="mg-export-btn" onClick={exportarExcel}>
                ⬇ Exportar a Excel
              </button>
              <span className="mg-export-nota">
                Descarga (con EAN) los {resultado.filas.length} productos marcados
                {resultado.omitidos.length > 0 &&
                  ` + ${resultado.omitidos.length} sin coste`}{" "}
                para pasárselos a tu compañero de precios.
              </span>
            </div>
          )}

          {resultado.filas.length === 0 ? (
            <div className="mg-ok">
              ✓ Ningún producto por debajo del {umbral}%. Todos los márgenes están
              bien.
            </div>
          ) : (
            <div className="mg-tabla">
              <div className="mg-tabla-head">
                <span>Margen</span>
                <span>Producto</span>
                <span className="mg-col-num">PVP</span>
                <span className="mg-col-num">Coste</span>
                <span>¿Por qué?</span>
              </div>
              {resultado.filas.map((f) => (
                <div key={f.id} className="mg-fila">
                  <span
                    className={
                      "mg-margen " +
                      (f.perdidas ? "mg-perdidas" : f.margen < umbral - 5 ? "mg-bajo" : "mg-medio")
                    }
                  >
                    {f.margen.toFixed(1)}%
                  </span>
                  <span className="mg-prod">
                    <span className="mg-prod-nombre">{f.producto}</span>
                    <span className="mg-prod-meta">
                      ID {f.id}
                      {f.propiedad ? ` · ${f.propiedad}` : ""}
                    </span>
                  </span>
                  <span className="mg-col-num">{f.precio.toFixed(2)}€</span>
                  <span className="mg-col-num">{f.coste.toFixed(2)}€</span>
                  <span className="mg-causa">
                    <span
                      className={
                        "mg-causa-tag " +
                        (f.causa === "DESCUENTO" ? "mg-causa-dto" : "mg-causa-precio")
                      }
                    >
                      {f.causa === "DESCUENTO" ? "Descuento" : "Precio/Coste"}
                    </span>
                    <span className="mg-causa-detalle">{f.detalle}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {resultado.filas.length > 0 && (
            <div className="mg-leyenda">
              <p>
                <strong>Descuento</strong>: el precio de tarifa está bien, pero la
                promoción hunde el margen → baja el descuento.
              </p>
              <p>
                <strong>Precio/Coste</strong>: aun sin descuento no llega al {umbral}%
                → sube el precio de tarifa o revisa el coste.
              </p>
              <p className="mg-leyenda-nota">
                Margen calculado sobre el precio de venta sin IVA ({iva}%).
              </p>
            </div>
          )}

          {resultado.omitidos.length > 0 && (
            <div className="mg-omitidos">
              <button
                className="mg-omitidos-toggle"
                onClick={() => setVerOmitidos((v) => !v)}
              >
                {verOmitidos ? "▲" : "▼"} {resultado.omitidos.length} producto
                {resultado.omitidos.length !== 1 ? "s" : ""} omitido
                {resultado.omitidos.length !== 1 ? "s" : ""} (sin coste cargado, no
                se puede calcular el margen)
              </button>
              {verOmitidos && (
                <div className="mg-omitidos-lista">
                  <div className="mg-omitidos-nota">
                    Estos productos tienen precio de venta pero el P.COSTE REAL está
                    a 0,00. Cárgales el coste en PrestaShop para poder revisar su
                    margen.
                  </div>
                  {resultado.omitidos.map((o) => (
                    <div key={o.id} className="mg-omitido-fila">
                      <span className="mg-prod">
                        <span className="mg-prod-nombre">{o.producto}</span>
                        <span className="mg-prod-meta">
                          ID {o.id}
                          {o.propiedad ? ` · ${o.propiedad}` : ""}
                        </span>
                      </span>
                      <span className="mg-col-num">{o.precio.toFixed(2)}€</span>
                      <span className="mg-omitido-tag">Coste 0,00</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
