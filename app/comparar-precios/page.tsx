"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { construirExcel, nombreArchivo, calcularFila, type CuponExcel } from "./excel";
import { descuentoBoardfy } from "./boardfy";

type Comparacion = {
  nombre: string; miPrecio: number; suPrecio: number; suPrecioTachado?: number;
  miPvp?: number; suPvp?: number; // PVP sin descuento (faltan en resultados guardados antes)
  suPrecioWeb?: number; // precio de su web antes del cupón de carrito (suPrecio ya lo lleva aplicado)
  diff: number; confianza: number; miUrl: string; suUrl: string; esPack?: boolean; manual?: boolean;
  verificado?: boolean; nombreEditado?: boolean; porEan?: boolean; ean?: string;
};
type SoloEllos = { titulo: string; precio: number; url: string; esPack: boolean };
type MiSinEmparejar = { nombre: string; url: string; precio: number; esPack: boolean; sinEan?: boolean };
type ResultadoMarca = {
  marca: string; slug: string; error?: string;
  comparaciones: Comparacion[]; soloEllos: SoloEllos[]; misSinEmparejar: MiSinEmparejar[];
  misProductos: number; susProductos: number;
  revisadoEn?: string; // cuándo se revisó ESTA marca (falta en resultados guardados antes)
  eanPendientes?: number; // productos suyos con el EAN aún sin leer
};

// PVP distinto en las dos webs: puede ser una tarifa sin actualizar
function pvpDistinto(c: Comparacion): boolean {
  return c.miPvp != null && c.suPvp != null && Math.abs(c.miPvp - c.suPvp) > 0.01;
}

// Descuento aplicado sobre el PVP (en %), o null si no hay PVP o no hay rebaja
function dtoSobrePvp(pvp: number | undefined, precio: number): number | null {
  if (pvp == null || pvp <= 0 || precio >= pvp - 0.005) return null;
  return Math.round((1 - precio / pvp) * 1000) / 10;
}

// Cosméticos24h aplica un cupón en el carrito (p. ej. 5 % OTOÑO5): su precio final es el de la web
// menos ese cupón, y con ese se comparan la diferencia, el mínimo y su descuento total.
function aplicarCupon(r: ResultadoMarca, cupon: CuponExcel): ResultadoMarca {
  if (!cupon || !(cupon.pct > 0)) return r;
  const f = 1 - cupon.pct / 100;
  return {
    ...r,
    comparaciones: r.comparaciones.map(c => {
      const final = Math.round(c.suPrecio * f * 100) / 100;
      return { ...c, suPrecioWeb: c.suPrecio, suPrecio: final, diff: Math.round((c.miPrecio - final) * 100) / 100 };
    }),
  };
}

// Nuestro precio mínimo: PVP menos el descuento máximo de la marca
function precioMinimo(c: Comparacion, descuento: number | null): number | null {
  if (descuento == null) return null;
  return Math.round((c.miPvp ?? c.miPrecio) * (1 - descuento / 100) * 100) / 100;
}

// Cosméticos24h vende por debajo de lo mínimo que podemos bajar nosotros
function bajoMinimo(c: Comparacion, descuento: number | null): boolean {
  const min = precioMinimo(c, descuento);
  return min != null && c.suPrecio < min - 0.005;
}

function nombreDesdeUrl(url: string) {
  return (url.split("/es/")[1] ?? url).replace(/-p\d+$/, "").replace(/-/g, " ");
}
type Marca = { nombre: string; slug: string; miToken: string; descuentoMax?: number | null };

// Descuento máximo de la marca: el puesto a mano en la app o, si no, el de Boardfy
function descuentoDe(m?: Marca): { pct: number | null; deBoardfy: boolean } {
  if (!m) return { pct: null, deBoardfy: false };
  if (m.descuentoMax != null) return { pct: m.descuentoMax, deBoardfy: false };
  return { pct: descuentoBoardfy(m.nombre), deBoardfy: true };
}
type Excluido = {
  suUrl: string; titulo: string;
  tipo?: "comparacion" | "soloEllos";
  miPrecio?: number; suPrecio?: number; miUrl?: string; motivo?: string;
};
type Cupon = { pct: number | null; codigo?: string; manual?: boolean; detectadoEn?: string };
type Config = { marcas: Marca[]; ultimaRevision: string | null; resultados: ResultadoMarca[]; excluidos: Record<string, Excluido[]>; cupon?: Cupon };

const MOTIVOS = [
  "Compara productos diferentes",
  "Ya lo tengo (no lo detecta)",
  "No me interesa",
  "Otro motivo",
];

function toSlug(nombre: string) {
  return nombre.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function tiempoDesde(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (m < 1) return "hace menos de 1 min";
  if (h < 1) return `hace ${m} min`;
  if (h < 24) return `hace ${h}h ${m % 60}min`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d > 1 ? "s" : ""}`;
}

function fechaExacta(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    + " a las " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const MOSTRAR_INICIAL = 6;

function generarPDF(r: ResultadoMarca) {
  const ahora = new Date();
  const fechaHora = ahora.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    + " a las " + ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const comp = [...r.comparaciones].sort((a, b) => b.diff - a.diff);
  const masCaro = comp.filter(c => c.diff > 0.01);
  const soloEllosReal = r.soloEllos.filter(s => !s.esPack);
  const packs = r.soloEllos.filter(s => s.esPack);

  const filasComp = comp.map(c => {
    const cls = c.diff > 0.01 ? "caro" : c.diff < -0.01 ? "barato" : "";
    const tags = (c.esPack ? '<span class="tag">pack</span>' : "") + (pvpDistinto(c) ? '<span class="tag tag-p">PVP distinto</span>' : "") + (c.porEan ? '<span class="tag tag-e">EAN</span>' : "") + (c.verificado ? '<span class="tag tag-v">verificado</span>' : "");
    const miPrecio = c.miUrl
      ? `<a class="lnk" href="${esc(c.miUrl)}">${c.miPrecio.toFixed(2)} €</a>`
      : `${c.miPrecio.toFixed(2)} €`;
    const suPrecio = c.suUrl
      ? `<a class="lnk" href="${esc(c.suUrl)}">${c.suPrecio.toFixed(2)} €</a>`
      : `${c.suPrecio.toFixed(2)} €`;
    return `<tr>
      <td>${tags}${esc(c.nombre)}</td>
      <td class="num pvp ${pvpDistinto(c) ? "pvp-dif" : ""}">${c.miPvp != null ? c.miPvp.toFixed(2) + " €" : "—"}</td>
      <td class="num">${miPrecio}</td>
      <td class="num pvp ${pvpDistinto(c) ? "pvp-dif" : ""}">${c.suPvp != null ? c.suPvp.toFixed(2) + " €" : "—"}</td>
      <td class="num">${suPrecio}</td>
      <td class="num ${cls}">${c.diff > 0 ? "+" : ""}${c.diff.toFixed(2)} €</td>
    </tr>`;
  }).join("");

  const lista = (arr: { titulo: string; precio: number; url: string }[]) =>
    arr.map(s => {
      const titulo = s.url ? `<a class="lnk" href="${esc(s.url)}">${esc(s.titulo)}</a>` : esc(s.titulo);
      return `<tr><td>${titulo}</td><td class="num">${s.precio.toFixed(2)} €</td></tr>`;
    }).join("");

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Comparativa ${esc(r.marca)} — Cosméticos24h</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 28px; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 18px; }
  .logo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #777; margin-bottom: 6px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 3px; }
  .meta { font-size: 11px; color: #555; }
  h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; border-bottom: 1px solid #ccc; padding: 5px 6px; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; font-size: 12px; }
  .num { font-variant-numeric: tabular-nums; }
  a.lnk { color: inherit; text-decoration: underline; text-decoration-color: #9ca3af; }
  .caro { color: #b91c1c; font-weight: 700; }
  .barato { color: #15803d; }
  .tag { display: inline-block; font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 1px 4px; border-radius: 3px; margin-right: 5px; background: #ede9fe; color: #6d28d9; vertical-align: middle; }
  .tag-e { background: #e0f2fe; color: #0369a1; }
  .tag-p { background: #ffedd5; color: #c2410c; }
  .pvp { color: #666; }
  .pvp-dif { color: #c2410c; font-weight: 700; }
  .tag-m { background: #dcfce7; color: #15803d; }
  .tag-v { background: #dbeafe; color: #1d4ed8; }
  .resumen { font-size: 11px; color: #555; margin-bottom: 4px; }
  .footer { margin-top: 22px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 16px; } tr { break-inside: avoid; } h2 { break-after: avoid; } }
</style></head><body>
<div class="header">
  <div class="logo">Comparativa de precios</div>
  <h1>${esc(r.marca)} — tú vs. Cosméticos24h</h1>
  <div class="meta">Generado el ${fechaHora}</div>
</div>

<div class="resumen">${comp.length} productos comparados · <strong>${masCaro.length} en los que vas más caro</strong> que Cosméticos24h · ${comp.filter(pvpDistinto).length} con PVP distinto (¿tarifa sin actualizar?).</div>

${comp.length ? `<h2>Comparación de precios</h2>
<table>
  <thead><tr><th>Producto</th><th class="num">Tu PVP</th><th class="num">Tu precio</th><th class="num">Su PVP</th><th class="num">Su precio</th><th class="num">Diferencia</th></tr></thead>
  <tbody>${filasComp}</tbody>
</table>` : ""}

${soloEllosReal.length ? `<h2>Tienen ellos y tú no (${soloEllosReal.length})</h2>
<table><tbody>${lista(soloEllosReal.map(s => ({ titulo: s.titulo, precio: s.precio, url: s.url })))}</tbody></table>` : ""}

${packs.length ? `<h2>Packs que tienen ellos y tú no (${packs.length})</h2>
<table><tbody>${lista(packs.map(s => ({ titulo: s.titulo, precio: s.precio, url: s.url })))}</tbody></table>` : ""}

<div class="footer">La Tienda de Cosméticos · Comparativa con Cosméticos24h · ${fechaHora}. Los precios son los de venta actuales de cada tienda (si Cosméticos24h tiene la marca en oferta, la diferencia lo refleja). El PVP es el precio sin descuento de cada tienda.</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

async function descargarExcel(r: ResultadoMarca, descuento: number | null, cupon: CuponExcel) {
  const buf = await construirExcel(r.marca, r.comparaciones, r.soloEllos, descuento, cupon);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombreArchivo(r.marca);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Misma tabla que el Excel: mismas columnas, colores y cálculos
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const pctW = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;
function TablaInforme({ filas, descuento, cupon }: { filas: Comparacion[]; descuento: number | null; cupon: CuponExcel }) {
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  const conCupon = cupon && cupon.pct > 0
    ? `Con cupón (−${String(cupon.pct).replace(".", ",")} %${cupon.codigo ? ` ${cupon.codigo}` : ""})`
    : "Con cupón (no hay)";
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe">
        <thead>
          <tr className="cp-informe-grupos">
            <th colSpan={2} />
            <th colSpan={4} className="cp-g-nos">Nosotros</th>
            <th colSpan={4} className="cp-g-ellos">Cosméticos24h</th>
            <th colSpan={4} />
          </tr>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th>PVP</th><th>{descuento != null ? `Mínimo (−${pct})` : "Mínimo"}</th><th>Precio</th><th>Dto.</th>
            <th className="cp-h-ellos">PVP</th><th className="cp-h-ellos">Precio web</th><th className="cp-h-ellos">{conCupon}</th><th className="cp-h-ellos">Dto. total</th>
            <th>Diferencia</th><th>Más barato</th><th className="cp-izq">¿Podemos igualar?</th><th>Ficha Cosméticos24h</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const k = calcularFila(f, descuento);
            return (
              <tr key={i}>
                <td className="cp-suave">{f.ean ?? ""}</td>
                <td className="cp-izq"><a href={f.miUrl} target="_blank" rel="noreferrer" className="cp-prod">{f.nombre}</a></td>
                <td className={k.pvpDistinto ? "cp-ambar" : ""}>{eur(k.pvp)}</td>
                <td className="cp-suave">{k.limite != null ? eur(k.limite) : "—"}</td>
                <td className={"cp-fuerte" + (k.bajoMinimo.mio ? " cp-rojo-fondo" : "")}>{eur(f.miPrecio)}</td>
                <td className={"cp-dto-azul" + (k.bajoMinimo.mio ? " cp-rojo" : "")}>{pctW(k.miDto)}</td>
                <td className={k.pvpDistinto ? "cp-ambar" : "cp-rosa"}>{eur(k.suPvp)}</td>
                <td className="cp-rosa">{eur(k.suWeb)}</td>
                <td className={"cp-fuerte " + (k.bajoMinimo.suyo ? "cp-rojo-fondo" : "cp-rosa")}>{eur(f.suPrecio)}</td>
                <td className={"cp-fuerte cp-pequena " + (k.bajoMinimo.suyo ? "cp-rojo" : "cp-rosa")}>{pctW(k.suDto)}</td>
                <td className={"cp-fuerte " + (f.diff > 0.01 ? "cp-rojo" : f.diff < -0.01 ? "cp-verde" : "")}>{f.diff > 0.005 ? "+" : ""}{eur(f.diff)}</td>
                <td className={"cp-centro cp-pequena " + (k.masBarato === "Cosméticos24h" ? "cp-fuerte cp-rojo" : k.masBarato === "Nosotros" ? "cp-fuerte cp-verde" : "cp-suave")}>{k.masBarato}</td>
                <td className={"cp-izq cp-pequena " + (k.igualar.startsWith("No") ? "cp-fuerte cp-rojo" : "cp-verde")}>{k.igualar}</td>
                <td className="cp-centro"><a href={f.suUrl} target="_blank" rel="noreferrer" className="cp-ficha">Ver ficha</a></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarcaBloque({
  r, descuento, deBoardfy, cupon, ocultos, expandido, onToggle, mostrarTodos, onToggleMostrar, onExcluir, onIncluir, onMotivo, onVerificar, onDesverificar, onRenombrar, onRestaurarNombre,
}: {
  r: ResultadoMarca; descuento: number | null; deBoardfy: boolean; cupon: CuponExcel;
  ocultos: Excluido[]; expandido: boolean; onToggle: () => void;
  mostrarTodos: boolean; onToggleMostrar: () => void;
  onExcluir: (item: Excluido) => void;
  onIncluir: (suUrl: string) => void;
  onMotivo: (suUrl: string, motivo: string) => void;
  onVerificar: (suUrl: string) => void;
  onDesverificar: (suUrl: string) => void;
  onRenombrar: (suUrl: string, nombre: string) => Promise<void>;
  onRestaurarNombre: (suUrl: string) => void;
}) {
  const [verOcultos, setVerOcultos] = useState(false);
  const [verSinEmp, setVerSinEmp] = useState(false);

  // Editor del nombre mostrado del producto
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null); // suUrl de la fila en edición
  const [nombreInput, setNombreInput] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errNombre, setErrNombre] = useState("");

  async function guardarNombre(suUrl: string) {
    if (!nombreInput.trim()) return;
    setGuardandoNombre(true); setErrNombre("");
    try {
      await onRenombrar(suUrl, nombreInput.trim());
      setEditandoNombre(null); setNombreInput("");
    } catch (e) {
      setErrNombre(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoNombre(false);
    }
  }
  function abrirEditorNombre(suUrl: string, nombreActual: string) {
    setEditandoNombre(suUrl); setNombreInput(nombreActual); setErrNombre("");
  }



  const masCaro = r.comparaciones.filter(c => c.diff > 0.01);
  const verificados = r.comparaciones.filter(c => c.verificado);
  const conPvpDistinto = r.comparaciones.filter(pvpDistinto);
  const conBajoMinimo = r.comparaciones.filter(c => bajoMinimo(c, descuento));
  const soloEllosReal = r.soloEllos.filter(s => !s.esPack);
  const packs = r.soloEllos.filter(s => s.esPack);
  const sinEmp = (r.misSinEmparejar ?? []).filter(m => !m.esPack);
  // Todas las filas, de más caros a más baratos, como en el Excel
  const compOrden = [...r.comparaciones].sort((a, b) => b.diff - a.diff);

  return (
    <div className="vp-accordion">
      <div className="vp-accordion-header" onClick={onToggle} role="button" tabIndex={0}>
        <span className="vp-accordion-marca">
          {r.marca}
          {r.revisadoEn && (
            <span className="cp-revisado" title={`Esta marca se revisó el ${fechaExacta(r.revisadoEn)}`}>
              Revisada el {fechaExacta(r.revisadoEn)} · {tiempoDesde(r.revisadoEn)}
            </span>
          )}
          <span className="cp-revisado" title={deBoardfy ? "Descuento máximo de la regla de Boardfy (cámbialo en la columna de marcas)" : "Descuento máximo puesto a mano"}>
            Dto. máx. {descuento != null ? `${String(descuento).replace(".", ",")} %` : "sin límite"}{deBoardfy && descuento != null ? " (Boardfy)" : ""}
          </span>
        </span>
        <div className="vp-accordion-right">
          {masCaro.length > 0 && (
            <span className="vp-pill vp-pill-nuevo">{masCaro.length} caro{masCaro.length !== 1 ? "s" : ""}</span>
          )}
          {conBajoMinimo.length > 0 && (
            <span className="vp-pill cp-pill-minimo" title={`Cosméticos24h vende por debajo de nuestro PVP −${descuento} %: no podemos igualarlos sin pasar el descuento máximo`}>{conBajoMinimo.length} bajo nuestro mínimo</span>
          )}
          {conPvpDistinto.length > 0 && (
            <span className="vp-pill cp-pill-pvp" title="El PVP sin descuento no coincide: puede que una tarifa no esté actualizada">{conPvpDistinto.length} PVP distinto{conPvpDistinto.length !== 1 ? "s" : ""}</span>
          )}
          {verificados.length > 0 && (
            <span className="vp-pill vp-pill-verificado" title="Productos que has comprobado a mano">✓ {verificados.length} verificado{verificados.length !== 1 ? "s" : ""}</span>
          )}
          <span className="vp-accordion-count">
            {r.comparaciones.length} comparados · {soloEllosReal.length} solo ellos
          </span>
          <button
            className="regen-btn"
            onClick={e => { e.stopPropagation(); generarPDF(r); }}
            title="Descargar PDF de esta marca"
          >
            PDF
          </button>
          <button
            className="regen-btn"
            onClick={e => { e.stopPropagation(); descargarExcel(r, descuento, cupon); }}
            title="Descargar Excel de esta marca (formato de informe de marca)"
          >
            Excel
          </button>
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </div>

      {expandido && (
        <div className="vp-accordion-content">
          {r.error && <div className="error" style={{ margin: 8 }}>{r.error}</div>}
          {(r.eanPendientes ?? 0) > 0 && (
            <div className="cp-ean-aviso">
              Faltan por leer los EAN de {r.eanPendientes} producto{r.eanPendientes !== 1 ? "s" : ""} de Cosméticos24h: esos todavía no se han comparado. Vuelve a revisar la marca para completarlos.
            </div>
          )}

          {r.comparaciones.length > 0 && (
            <>
              <div className="cp-subtit">Comparación de precios (tú vs. Cosméticos24h)</div>
              <TablaInforme filas={compOrden} descuento={descuento} cupon={cupon} />
            </>
          )}

          {soloEllosReal.length > 0 && (
            <>
              <div className="cp-subtit" style={{ marginTop: 16 }}>
                Tienen ellos y tú no ({soloEllosReal.length}) — posibles novedades
              </div>
              {soloEllosReal.map((s, i) => (
                <div key={i}>
                  <div className="cp-fila cp-solo">
                    <a href={s.url} target="_blank" rel="noreferrer" className="cp-nombre">{s.titulo}</a>
                    <span className="cp-col-num cp-c24">{s.precio.toFixed(2)}€</span>
                    <div className="cp-acciones">
                      <button className="cp-ocultar" title="Ocultar" onClick={() => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {packs.length > 0 && (
            <>
              <div className="cp-subtit" style={{ marginTop: 16 }}>
                Packs/estuches que tienen ellos y tú no ({packs.length})
              </div>
              {packs.map((s, i) => (
                <div key={i}>
                  <div className="cp-fila cp-solo">
                    <a href={s.url} target="_blank" rel="noreferrer" className="cp-nombre">{s.titulo}</a>
                    <span className="cp-col-num cp-c24">{s.precio.toFixed(2)}€</span>
                    <div className="cp-acciones">
                      <button className="cp-ocultar" title="Ocultar" onClick={() => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {sinEmp.length > 0 && (
            <div className="cp-ocultos-box">
              <button className="cp-ocultos-toggle" onClick={() => setVerSinEmp(v => !v)}>
                {verSinEmp ? "▲" : "▼"} Tus productos sin el mismo EAN en Cosméticos24h ({sinEmp.length})
              </button>
              {verSinEmp && (
                <div className="cp-ocultos-lista">
                  <div className="cp-packs-nota" style={{ padding: "0 0 8px" }}>
                    Solo se comparan productos con el mismo EAN en las dos webs. Estos no lo tienen: o Cosméticos24h no los vende, o una de las dos fichas no tiene EAN (o lo tiene distinto).
                  </div>
                  {sinEmp.map((m, i) => (
                    <div key={i} className="cp-sinemp-item">
                      <div className="cp-oculto-info">
                        <a href={m.url} target="_blank" rel="noreferrer" className="cp-oculto-nombre">
                          {m.esPack && <span className="cp-pack-tag">pack</span>}{m.nombre}
                        </a>
                        <div className="cp-oculto-precios">Tu precio: <strong>{m.precio.toFixed(2)}€</strong>{m.sinEan && <> · <span className="cp-sin-ean">tu ficha no tiene EAN</span></>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {ocultos.length > 0 && (
            <div className="cp-ocultos-box">
              <button className="cp-ocultos-toggle" onClick={() => setVerOcultos(v => !v)}>
                {verOcultos ? "▲" : "▼"} Ocultos ({ocultos.length})
              </button>
              {verOcultos && (
                <div className="cp-ocultos-lista">
                  {ocultos.map((o, i) => (
                    <div key={i} className="cp-oculto-item">
                      <div className="cp-oculto-info">
                        <a href={o.miUrl ?? o.suUrl} target="_blank" rel="noreferrer" className="cp-oculto-nombre">{o.titulo}</a>
                        <div className="cp-oculto-precios">
                          {o.tipo === "soloEllos" ? (
                            <span className="cp-oculto-tag">Tienen ellos y tú no · C24h {o.suPrecio?.toFixed(2)}€</span>
                          ) : o.tipo === "comparacion" ? (
                            <span>
                              Tú <strong>{o.miPrecio?.toFixed(2)}€</strong> · C24h <strong>{o.suPrecio?.toFixed(2)}€</strong>
                              {o.miPrecio != null && o.suPrecio != null && (
                                <span className={o.miPrecio - o.suPrecio > 0.01 ? "cp-caro" : o.miPrecio - o.suPrecio < -0.01 ? "cp-barato" : ""}>
                                  {" "}({o.miPrecio - o.suPrecio > 0 ? "+" : ""}{(o.miPrecio - o.suPrecio).toFixed(2)}€)
                                </span>
                              )}
                            </span>
                          ) : null}
                        </div>
                        <label className="cp-motivo-row">
                          Oculto por:
                          <select
                            className="cp-motivo-select"
                            value={o.motivo ?? ""}
                            onChange={e => onMotivo(o.suUrl, e.target.value)}
                          >
                            <option value="">— Sin especificar —</option>
                            {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                      </div>
                      <button className="cp-restaurar" onClick={() => onIncluir(o.suUrl)}>Restaurar</button>
                    </div>
                  ))}
                  <div className="cp-packs-nota" style={{ padding: "6px 0 0" }}>Al restaurar, reaparece en la próxima revisión.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompararPrecios() {
  const [config, setConfig] = useState<Config | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [nuevoSlug, setNuevoSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarTodos, setMostrarTodos] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/comparar-precios").then(r => r.json()).then(setConfig);
  }, []);

  function toggle(slug: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }
  function toggleMostrar(slug: string) {
    setMostrarTodos(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  function handleNombreChange(v: string) {
    setNuevaMarca(v);
    if (!slugManual) setNuevoSlug(toSlug(v));
  }

  async function addMarca() {
    if (!nuevaMarca.trim() || !nuevoSlug.trim()) return;
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addMarca", nombre: nuevaMarca.trim(), slug: nuevoSlug.trim(), miToken: nuevoSlug.trim() }),
    });
    setConfig(await res.json());
    setNuevaMarca(""); setNuevoSlug(""); setSlugManual(false);
  }

  async function guardarCupon(valor: string) {
    const limpio = valor.trim().replace(",", ".");
    const pct = limpio === "" ? null : Number(limpio);
    if (pct != null && Number.isNaN(pct)) return;
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cupon", pct }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    setConfig(data);
  }

  async function guardarDescuento(slug: string, valor: string) {
    const limpio = valor.trim().replace(",", ".");
    const descuentoMax = limpio === "" ? null : Number(limpio);
    if (descuentoMax != null && Number.isNaN(descuentoMax)) return;
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "descuento", slug, descuentoMax }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    setConfig(data);
  }

  async function deleteMarca(slug: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteMarca", slug }),
    });
    setConfig(await res.json());
  }

  async function excluir(slug: string, item: Excluido) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "excluir", slug, item }),
    });
    setConfig(await res.json());
  }

  async function cambiarMotivo(slug: string, suUrl: string, motivo: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "motivo", slug, suUrl, motivo }),
    });
    setConfig(await res.json());
  }

  async function incluir(slug: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "incluir", slug, suUrl }),
    });
    setConfig(await res.json());
  }

  async function verificar(slug: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verificar", slug, suUrl }),
    });
    setConfig(await res.json());
  }

  async function desverificar(slug: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "desverificar", slug, suUrl }),
    });
    setConfig(await res.json());
  }

  async function renombrar(slug: string, suUrl: string, nombre: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renombrar", slug, suUrl, nombre }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setConfig(data);
  }

  async function restaurarNombre(slug: string, suUrl: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restaurarNombre", slug, suUrl }),
    });
    setConfig(await res.json());
  }

  async function revisar(slug: string) {
    setRevisando(slug); setError("");
    try {
      const res = await fetch("/api/comparar-precios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revisar", slug }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setConfig(data);
      setExpandidos(prev => new Set(prev).add(slug));
    } catch (e) {
      setError(String(e));
    } finally {
      setRevisando(null);
    }
  }

  const resultados = config?.resultados ?? [];
  const cuponActivo: CuponExcel = config?.cupon?.pct != null && config.cupon.pct > 0 ? { pct: config.cupon.pct, codigo: config.cupon.codigo } : null;

  return (
    <div className="wrap cp-wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Comparar mis precios con Cosméticos24h</h1>
      <p className="subtitle">Cruza tus precios con los de Cosméticos24h, marca a marca. Marca en rojo dónde vas más caro y lista lo que ellos tienen y tú no.</p>

      <div className="two-col cp-layout">
        {/* ── Columna izquierda ── */}
        <div className="left-col">
          <div className="vp-section-title">Cupón de Cosméticos24h</div>
          <label className="cp-dto cp-cupon" title="Descuento que Cosméticos24h aplica en el carrito. Se detecta en su web al revisar; vacío = detectarlo">
            En carrito
            <input
              key={`cupon-${config?.cupon?.pct ?? "x"}-${config?.cupon?.manual ? "m" : "a"}`}
              className="cp-dto-input"
              inputMode="decimal"
              defaultValue={config?.cupon?.manual && config.cupon.pct != null ? String(config.cupon.pct).replace(".", ",") : ""}
              placeholder={!config?.cupon?.manual && config?.cupon?.pct != null ? String(config.cupon.pct).replace(".", ",") : "0"}
              onBlur={e => { if (e.target.value !== (config?.cupon?.manual && config.cupon.pct != null ? String(config.cupon.pct).replace(".", ",") : "")) guardarCupon(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            %{!config?.cupon?.manual && config?.cupon?.pct != null && <span className="cp-dto-fuente cp-cupon-fuente">{config.cupon.codigo ?? "su web"}</span>}
          </label>

          <div className="vp-section-title">Marcas a comparar</div>
          {config?.marcas && config.marcas.length > 0 ? (
            <ul className="vp-marcas-list">
              {config.marcas.map(m => (
                <li key={m.slug} className="vp-marca-item">
                  <div>
                    <div className="vp-marca-nombre">{m.nombre}</div>
                    <div className="vp-marca-slug">/collections/{m.slug}</div>
                    <label className="cp-dto" title="Descuento máximo sobre el PVP. Vacío = el de la regla de Boardfy">
                      Dto. máx.
                      <input
                        key={`${m.slug}-${m.descuentoMax ?? "b"}`}
                        className="cp-dto-input"
                        inputMode="decimal"
                        defaultValue={m.descuentoMax != null ? String(m.descuentoMax).replace(".", ",") : ""}
                        placeholder={descuentoBoardfy(m.nombre) != null ? String(descuentoBoardfy(m.nombre)).replace(".", ",") : "—"}
                        onBlur={e => { if (e.target.value !== (m.descuentoMax != null ? String(m.descuentoMax).replace(".", ",") : "")) guardarDescuento(m.slug, e.target.value); }}
                        onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      %{m.descuentoMax == null && descuentoBoardfy(m.nombre) != null && <span className="cp-dto-fuente">Boardfy</span>}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      className="regen-btn"
                      onClick={() => revisar(m.slug)}
                      disabled={revisando !== null}
                      title="Revisar solo esta marca"
                    >
                      {revisando === m.slug ? "…" : "Revisar"}
                    </button>
                    <button className="vp-delete-btn" onClick={() => deleteMarca(m.slug)}>×</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vp-empty">Sin marcas añadidas</p>
          )}

          <div className="vp-add-form">
            <input
              value={nuevaMarca}
              onChange={e => handleNombreChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMarca()}
              placeholder="Ej: Atache"
              style={{ marginBottom: 8 }}
            />
            <div className="vp-slug-row">
              <span className="vp-slug-prefix">/collections/</span>
              <input
                className="vp-slug-input"
                value={nuevoSlug}
                onChange={e => { setNuevoSlug(e.target.value); setSlugManual(true); }}
                placeholder="atache"
              />
            </div>
            <div className="vp-slug-hint">El mismo texto se usa para localizar la marca en tu web. Edítalo solo si no la encuentra.</div>
            <button onClick={addMarca} disabled={!nuevaMarca.trim() || !nuevoSlug.trim()}>
              + Añadir marca
            </button>
          </div>
        </div>

        {/* ── Columna derecha ── */}
        <div className="right-col">
          <div className="vp-notif-bar" style={{ background: "var(--card-bg, #f7f7f8)" }}>
            <span>La revisión es <strong>marca a marca</strong>: usa el botón "Revisar" de cada marca (arriba). Cada marca muestra <strong>su propia fecha</strong> de revisión.</span>
          </div>

          {error && <div className="error">{error}</div>}

          {resultados.length === 0 && !revisando && (
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
              Añade una marca y pulsa "Revisar" para comparar precios.
            </p>
          )}

          {resultados.map(r => (
            <MarcaBloque
              key={r.slug} r={aplicarCupon(r, cuponActivo)} cupon={cuponActivo}
              descuento={descuentoDe(config?.marcas.find(m => m.slug === r.slug)).pct}
              deBoardfy={descuentoDe(config?.marcas.find(m => m.slug === r.slug)).deBoardfy}
              ocultos={config?.excluidos?.[r.slug] ?? []}
              expandido={expandidos.has(r.slug)} onToggle={() => toggle(r.slug)}
              mostrarTodos={mostrarTodos.has(r.slug)} onToggleMostrar={() => toggleMostrar(r.slug)}
              onExcluir={(item) => excluir(r.slug, item)}
              onIncluir={(suUrl) => incluir(r.slug, suUrl)}
              onMotivo={(suUrl, motivo) => cambiarMotivo(r.slug, suUrl, motivo)}
              onVerificar={(suUrl) => verificar(r.slug, suUrl)}
              onDesverificar={(suUrl) => desverificar(r.slug, suUrl)}
              onRenombrar={(suUrl, nombre) => renombrar(r.slug, suUrl, nombre)}
              onRestaurarNombre={(suUrl) => restaurarNombre(r.slug, suUrl)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
