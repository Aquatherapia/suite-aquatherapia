"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { calcularFila, esPackFila, explicaPvp, construirExcel, nombreArchivo, type CuponExcel } from "./excel";
import { construirPdf, nombrePdf } from "./pdf";
import { construirExcelMarca, construirPdfMarca, filasParaMarca, nombreMarcaExcel, nombreMarcaPdf } from "./informe-marca";
import { descuentoBoardfy } from "./boardfy";

type Comparacion = {
  nombre: string; miPrecio: number; suPrecio: number; suPrecioTachado?: number;
  miPvp?: number; suPvp?: number; // PVP sin descuento (faltan en resultados guardados antes)
  suPrecioWeb?: number; // precio de su web antes del cupón de carrito (suPrecio ya lo lleva aplicado)
  descatalogado?: boolean; // tu ficha está descatalogada en tu web
  stock?: number;          // unidades que quedan si está descatalogada
  diff: number; confianza: number; miUrl: string; suUrl: string; esPack?: boolean; manual?: boolean;
  verificado?: boolean; nombreEditado?: boolean; porEan?: boolean; ean?: string;
  deAntes?: string; // la ficha no se pudo leer: fila de la revisión de esa fecha
};
type SoloEllos = { titulo: string; precio: number; tachado?: number; url: string; esPack: boolean; ean?: string };
type MiSinEmparejar = { nombre: string; url: string; precio: number; pvp?: number; esPack: boolean; sinEan?: boolean; ean?: string; formato?: string; descatalogado?: boolean; stock?: number };
type ResultadoMarca = {
  marca: string; slug: string; error?: string;
  comparaciones: Comparacion[]; soloEllos: SoloEllos[]; misSinEmparejar: MiSinEmparejar[];
  misProductos: number; susProductos: number;
  revisadoEn?: string; // cuándo se revisó ESTA marca (falta en resultados guardados antes)
  eanPendientes?: number; // productos suyos con el EAN aún sin leer
  misFallidas?: number;   // fichas nuestras que no se pudieron leer
  sinPrecio?: string[];   // fichas nuestras activas con precio 0 € (URL)
  cambios?: { desde: string; nuevosCaros: string[]; yaNoCaros: string[]; novedades: string[] }; // respecto a la revisión anterior
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

// Nuestro precio mínimo: PVP menos el descuento autorizado de la marca
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

// Descuento autorizado de la marca: el puesto a mano en la app o, si no, el de Boardfy
function descuentoDe(m?: Marca): { pct: number | null } {
  if (!m) return { pct: null };
  if (m.descuentoMax != null) return { pct: m.descuentoMax };
  return { pct: descuentoBoardfy(m.nombre) };
}
type Excluido = {
  suUrl: string; titulo: string;
  tipo?: "comparacion" | "soloEllos";
  miPrecio?: number; suPrecio?: number; miUrl?: string; motivo?: string;
};
type PromoCupon = { texto: string; inicio?: string; fin?: string; excluidas: string[] };
type Cupon = { pct: number | null; codigo?: string; directo?: boolean; manual?: boolean; detectadoEn?: string; desde?: string; hasta?: string; promo?: PromoCupon };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Marcas en las que su cupón no se aplica (según su página de promociones)
function cuponExcluye(c: Cupon | undefined, marca: string): boolean {
  const m = sinAcentos(marca);
  return (c?.promo?.excluidas ?? []).some(x => { const e = sinAcentos(x); return e.length > 2 && (m.includes(e) || e.includes(m)); });
}
const fechaCorta = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
// Duración y marcas excluidas del cupón, según su página de promociones (sale al pasar el ratón por la cabecera)
function condicionesCupon(c: Cupon): string | undefined {
  const p = c.promo;
  if (!p) return undefined;
  const partes: string[] = [];
  if (p.fin) {
    const pasado = p.fin < new Date().toISOString().slice(0, 10) ? " (ya pasó, pero sigue en su web)" : "";
    partes.push(`Duración: ${p.inicio ? `del ${fechaCorta(p.inicio)} al` : "hasta el"} ${fechaCorta(p.fin)}${pasado}.`);
  }
  partes.push(p.excluidas.length ? `No se aplica en ${p.excluidas.join(", ")}: en esas marcas se compara sin cupón.` : "Sin marcas excluidas.");
  return partes.join(" ");
}
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

async function descargarExcel(r: ResultadoMarca, descuento: number | null, cupon: CuponExcel) {
  const buf = await construirExcel(r.marca, r.comparaciones, r.soloEllos, descuento, cupon);
  bajar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivo(r.marca));
}

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function descargarPdf(r: ResultadoMarca, descuento: number | null, cupon: CuponExcel) {
  bajar(await construirPdf(r.marca, r.comparaciones, r.soloEllos, descuento, cupon), nombrePdf(r.marca));
}

// Informe para enviar a la marca: lo que Cosméticos24h vende por debajo del dto. autorizado
async function descargarParaMarca(r: ResultadoMarca, descuento: number, cupon: CuponExcel, formato: "pdf" | "excel") {
  if (formato === "pdf") bajar(await construirPdfMarca(r.marca, r.comparaciones, descuento, cupon), nombreMarcaPdf(r.marca));
  else bajar(new Blob([await construirExcelMarca(r.marca, r.comparaciones, descuento, cupon)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreMarcaExcel(r.marca));
}

// Botón «Para la marca»: elige PDF o Excel. Desactivado si no hay descuento autorizado o nada por debajo
function ParaMarca({ r, descuento, cupon }: { r: ResultadoMarca; descuento: number | null; cupon: CuponExcel }) {
  const [abierto, setAbierto] = useState(false);
  const n = filasParaMarca(r.comparaciones, descuento).length;
  const bajar = (formato: "pdf" | "excel") => {
    setAbierto(false);
    descargarParaMarca(r, descuento!, cupon, formato).catch(err => alert("No se pudo crear el informe: " + err));
  };
  return (
    <span className="cp-para-marca" onClick={e => e.stopPropagation()}>
      <button
        className="regen-btn"
        disabled={n === 0}
        onClick={() => setAbierto(a => !a)}
        title={descuento == null ? "Esta marca no tiene descuento autorizado" : n === 0 ? "Cosméticos24h no vende nada por debajo del descuento autorizado" : `Informe para enviar a la marca: ${n} producto${n !== 1 ? "s" : ""} de Cosméticos24h por debajo del descuento autorizado`}
      >
        Para la marca{n > 0 ? ` (${n})` : ""}
      </button>
      {abierto && (
        <span className="cp-para-marca-menu">
          <button className="regen-btn" onClick={() => bajar("pdf")}>PDF</button>
          <button className="regen-btn" onClick={() => bajar("excel")}>Excel</button>
        </span>
      )}
    </span>
  );
}

// Celda con explicación al pasar por encima (en vez de texto debajo, para que la tabla no crezca)
function Celda({ className, tip, children }: { className?: string; tip?: string; children: React.ReactNode }) {
  return <td className={(className ?? "") + (tip ? " cp-tip" : "")} data-tip={tip}>{children}</td>;
}

// «Descatalogado (1 u)»; sin unidades, aviso para desactivar la ficha
function EtiquetaDescat({ stock }: { stock?: number }) {
  return (
    <>
      <span className="cp-descat-tag" title="Tu ficha está marcada como descatalogada en tu web">
        Descatalogado{stock != null && ` (${stock} u)`}
      </span>
      {stock === 0 && <span className="cp-desactivar-tag" title="Descatalogado y sin unidades: no se puede vender, conviene desactivar la ficha">Sin stock: desactivar ficha</span>}
    </>
  );
}

// Misma tabla que el Excel: mismas columnas, colores y cálculos
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const pctW = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;
// Al final van, en la misma tabla, los productos que solo tiene una de las dos webs (sin los datos de la otra)
function TablaInforme({ filas, soloEllos, soloNosotros, descuento, cupon, onOcultar }: {
  filas: Comparacion[]; soloEllos: SoloEllos[]; soloNosotros: MiSinEmparejar[];
  descuento: number | null; cupon: CuponExcel; onOcultar: (s: SoloEllos) => void;
}) {
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  // Sin cupón, su precio final es el mismo que el precio web: esa columna no sale
  const conCupon = cupon && cupon.pct > 0
    ? `Precio final (${cupon.codigo ?? "cupón"} −${String(cupon.pct).replace(".", ",")} %${cupon.directo ? ", directo en carrito" : ""})`
    : null;
  // Celdas vacías de la web que no tiene el producto (una a una: los colores van por columna)
  const vacias = (n: number) => Array.from({ length: n }, (_, i) => <td key={`v${i}`} className="cp-vacia">—</td>);
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe">
        <thead>
          <tr className="cp-informe-grupos">
            <th colSpan={2} />
            <th colSpan={3} className="cp-g-nos">La Tienda de Cosméticos</th>
            <th colSpan={conCupon ? 3 : 2} className="cp-g-ellos">Cosméticos24h</th>
            <th colSpan={3} className="cp-g-fin">Comparación</th>
          </tr>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th>PVP</th><th className="cp-tip" data-tip="Nuestro PVP con el descuento autorizado de la marca (el que sale junto al nombre de la marca)">{descuento != null ? `Con dto. autorizado (−${pct})` : "Con dto. autorizado"}</th><th>Precio final</th>
            <th className="cp-h-ellos">PVP</th><th className="cp-h-ellos">{conCupon ? "Precio con dto." : "Precio final con dto."}</th>{conCupon && <th className={"cp-h-ellos" + (cupon?.condiciones ? " cp-tip" : "")} data-tip={cupon?.condiciones}>{conCupon}</th>}
            <th className="cp-h-fin">Diferencia</th><th className="cp-h-fin">Más barato</th><th className="cp-izq cp-h-fin">¿Podemos igualar?</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const k = calcularFila(f, descuento);
            return (
              <tr key={i}>
                <td className="cp-suave">{f.ean ?? ""}</td>
                <td className="cp-izq">
                  {f.descatalogado && <EtiquetaDescat stock={f.stock} />}
                  {f.deAntes && <span className="cp-deantes-tag" title={`Nuestra ficha no se pudo leer en esta revisión: precios de la revisión del ${fechaCorta(f.deAntes)}`}>dato anterior</span>}
                  <a href={f.miUrl} target="_blank" rel="noreferrer" className="cp-prod">{f.nombre}</a>
                  <span className="cp-enlaces">
                    <a href={f.suUrl} target="_blank" rel="noreferrer" className="cp-enlace-c24">Ver en Cosméticos24h ↗</a>
                    <a href={f.miUrl} target="_blank" rel="noreferrer" className="cp-enlace-ltc">Ver en La Tienda de Cosméticos ↗</a>
                  </span>
                </td>
                <Celda className={k.pvpDistinto ? "cp-ambar" : "cp-azul"} tip={k.esPack ? "Pack: nuestro PVP es la suma de los productos sueltos, así que no se aplica el dto. autorizado ni se compara el PVP." : k.pvpDistinto ? explicaPvp(k.pvp, k.suPvp) : undefined}>
                  {eur(k.pvp)}{k.revisarPvp && <span className="cp-revisar-pvp">(revisar precio)</span>}
                </Celda>
                <td className="cp-azul-suave">{k.limite != null ? eur(k.limite) : "—"}</td>
                <Celda className={"cp-fuerte cp-azul" + (k.bajoMinimo.mio ? " cp-pasado-fondo" : "")} tip={k.bajoMinimo.mio && k.limite != null ? `Nuestro precio está por debajo del PVP con el dto. autorizado (${eur(k.limite)}).` : undefined}>
                  {eur(f.miPrecio)}{k.miDto > 0.0005 && <small className={"cp-dto-celda cp-dto-azul" + (k.bajoMinimo.mio ? " cp-pasado" : "")}>−{pctW(k.miDto)}</small>}
                </Celda>
                <Celda className={k.pvpDistinto ? "cp-ambar" : "cp-rosa"} tip={k.pvpDistinto ? explicaPvp(k.pvp, k.suPvp) : undefined}>{eur(k.suPvp)}</Celda>
                <td className="cp-rosa">{eur(k.suWeb)}{k.suDtoWeb > 0.0005 && <small className="cp-dto-celda">−{pctW(k.suDtoWeb)}</small>}</td>
                {conCupon && <td className="cp-fuerte cp-rosa">{eur(f.suPrecio)}{k.suDto > 0.0005 && <small className="cp-dto-celda">−{pctW(k.suDto)}</small>}</td>}
                <Celda className={"cp-fuerte " + (f.diff > 0.01 ? "cp-negro" : f.diff < -0.01 ? "cp-verde" : "")}>
                  {f.diff > 0.005 ? "+" : ""}{eur(f.diff)}
                </Celda>
                <td className={"cp-centro cp-pequena " + (k.masBarato === "Cosméticos24h" ? "cp-fuerte cp-rosa" : k.masBarato === "La Tienda de Cosméticos" ? "cp-fuerte cp-azul" : "cp-suave")}>{k.masBarato}</td>
                <td className={"cp-izq cp-pequena " + (k.revisarPack ? "cp-fuerte cp-ambar-texto" : k.igualar.startsWith("No") ? "cp-fuerte cp-negro" : "cp-verde")}>{k.igualar}</td>
              </tr>
            );
          })}
          {soloEllos.map((x, i) => {
            const pvp = x.tachado && x.tachado > x.precio ? x.tachado : x.precio;
            const final = conCupon ? Math.round(x.precio * (1 - cupon!.pct / 100) * 100) / 100 : x.precio;
            const dtoWeb = pvp > 0 ? 1 - x.precio / pvp : 0;
            return (
              <tr key={`e${i}`} className="cp-fila-solo">
                <td className="cp-suave"><span className="cp-ean-copiable">{x.ean ?? ""}</span></td>
                <td className="cp-izq">
                  {x.esPack && <span className="cp-pack-tag">pack</span>}
                  <a href={x.url} target="_blank" rel="noreferrer" className="cp-prod">{x.titulo}</a>
                  <span className="cp-no-esta cp-no-esta-nuestra">
                    No está en nuestra web
                    <button className="cp-ocultar-fila" title="Ocultar este producto de la lista" onClick={() => onOcultar(x)}>ocultar</button>
                  </span>
                </td>
                {vacias(3)}
                <td className="cp-rosa">{eur(pvp)}</td>
                <td className="cp-rosa">{eur(x.precio)}{dtoWeb > 0.0005 && <small className="cp-dto-celda">−{pctW(dtoWeb)}</small>}</td>
                {conCupon && <td className="cp-fuerte cp-rosa">{eur(final)}{pvp > 0 && 1 - final / pvp > 0.0005 && <small className="cp-dto-celda">−{pctW(1 - final / pvp)}</small>}</td>}
                {vacias(2)}
                <td className="cp-izq cp-pequena cp-rosa cp-fuerte">{x.esPack ? "Pack que no tenemos" : "Posible novedad"}</td>
              </tr>
            );
          })}
          {soloNosotros.map((m, i) => {
            const pvp = m.pvp && m.pvp > m.precio ? m.pvp : m.precio;
            const limite = descuento != null && !esPackFila(m) ? Math.round(pvp * (1 - descuento / 100) * 100) / 100 : null;
            return (
              <tr key={`n${i}`} className="cp-fila-solo">
                <td className="cp-suave">
                  {m.ean ? <span className="cp-ean-copiable">{m.ean}</span>
                    : <span className="cp-sin-ean">{m.formato ? "EAN no publicado (formato)" : "Sin EAN en la ficha"}</span>}
                </td>
                <td className="cp-izq">
                  {m.esPack && <span className="cp-pack-tag">pack</span>}
                  {m.descatalogado && <EtiquetaDescat stock={m.stock} />}
                  <a href={m.url} target="_blank" rel="noreferrer" className="cp-prod">{m.nombre}</a>
                  <span className="cp-no-esta" title={m.ean ? "Cosméticos24h no tiene ningún producto con este EAN" : "Nuestra ficha no tiene EAN: no se puede saber si lo venden"}>
                    {m.ean ? "No está en Cosméticos24h" : "Sin EAN: no se puede comparar"}
                  </span>
                </td>
                <td className="cp-azul">{eur(pvp)}</td>
                <td className="cp-azul-suave">{limite != null ? eur(limite) : "—"}</td>
                <td className="cp-fuerte cp-azul">{eur(m.precio)}{pvp > 0 && 1 - m.precio / pvp > 0.0005 && <small className="cp-dto-celda cp-dto-azul">−{pctW(1 - m.precio / pvp)}</small>}</td>
                {vacias(conCupon ? 3 : 2)}
                {vacias(2)}
                <td className="cp-izq cp-pequena cp-suave">{m.ean ? "Solo lo tenemos nosotros" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarcaBloque({
  r, descuento, cupon, marca, revisando, ocupado, onRevisar, onBorrar, onGuardarDescuento, ocultos, expandido, onToggle, mostrarTodos, onToggleMostrar, onExcluir, onIncluir, onMotivo, onVerificar, onDesverificar, onRenombrar, onRestaurarNombre,
}: {
  r: ResultadoMarca; descuento: number | null; cupon: CuponExcel;
  marca: Marca; revisando: boolean; ocupado: boolean;
  onRevisar: () => void; onBorrar: () => void; onGuardarDescuento: (valor: string) => void;
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
  // Quitar la marca pide un segundo clic: borra también sus resultados
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

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
  const conPvpDistinto = r.comparaciones.filter(pvpDistinto);
  const conBajoMinimo = r.comparaciones.filter(c => bajoMinimo(c, descuento));
  const paraDesactivar = [...r.comparaciones, ...(r.misSinEmparejar ?? [])].filter(x => x.descatalogado && x.stock === 0).length;
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
          {!r.revisadoEn && <span className="cp-revisado">Sin revisar todavía</span>}
          <label className="cp-dto" title="Descuento autorizado sobre el PVP. Puedes cambiarlo a mano" onClick={e => e.stopPropagation()}>
            Dto. autorizado
            <input
              key={`${marca.slug}-${marca.descuentoMax ?? "b"}`}
              className="cp-dto-input"
              inputMode="decimal"
              defaultValue={marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : ""}
              placeholder={descuentoBoardfy(marca.nombre) != null ? String(descuentoBoardfy(marca.nombre)).replace(".", ",") : "—"}
              onBlur={e => { if (e.target.value !== (marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : "")) onGuardarDescuento(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            %
            {descuento == null && <span className="cp-dto-fuente cp-suave-txt">sin límite</span>}
          </label>
        </span>
        <div className="vp-accordion-right">
          {masCaro.length > 0 && (
            <span className="vp-pill vp-pill-nuevo">{masCaro.length} caro{masCaro.length !== 1 ? "s" : ""}</span>
          )}
          {conBajoMinimo.length > 0 && (
            <span className="vp-pill cp-pill-minimo" title={`Cosméticos24h vende por debajo de nuestro PVP −${descuento} %: no podemos igualarlos sin pasar el descuento autorizado`}>{conBajoMinimo.length} más allá de nuestro dto. autorizado</span>
          )}
          {paraDesactivar > 0 && <span className="vp-pill cp-pill-desactivar" title="Descatalogados sin unidades: conviene desactivar la ficha">{paraDesactivar} para desactivar</span>}
          {conPvpDistinto.length > 0 && (
            <span className="vp-pill cp-pill-pvp" title="El PVP sin descuento no coincide: puede que una tarifa no esté actualizada">{conPvpDistinto.length} PVP distinto{conPvpDistinto.length !== 1 ? "s" : ""}</span>
          )}
          <span className="vp-accordion-count">
            {r.comparaciones.length} comparados · {soloEllosReal.length} solo ellos
          </span>
          <button
            className="regen-btn cp-revisar-btn"
            onClick={e => { e.stopPropagation(); onRevisar(); }}
            disabled={ocupado}
            title="Volver a leer los precios de esta marca en las dos webs"
          >
            {revisando ? "Revisando…" : "Revisar"}
          </button>
          <button
            className="regen-btn"
            disabled={r.comparaciones.length === 0}
            onClick={e => { e.stopPropagation(); descargarPdf(r, descuento, cupon).catch(err => alert("No se pudo crear el PDF: " + err)); }}
            title="Descargar el informe de esta marca en PDF"
          >
            PDF
          </button>
          <button
            className="regen-btn"
            disabled={r.comparaciones.length === 0}
            onClick={e => { e.stopPropagation(); descargarExcel(r, descuento, cupon).catch(err => alert("No se pudo crear el Excel: " + err)); }}
            title="Descargar el informe de esta marca en Excel"
          >
            Excel
          </button>
          <ParaMarca r={r} descuento={descuento} cupon={cupon} />
          {confirmarBorrar
            ? <button className="vp-delete-btn cp-borrar-confirmar" onClick={e => { e.stopPropagation(); onBorrar(); }} onBlur={() => setConfirmarBorrar(false)} autoFocus>¿Quitar marca?</button>
            : <button className="vp-delete-btn" title="Quitar esta marca" onClick={e => { e.stopPropagation(); setConfirmarBorrar(true); }}>×</button>}
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </div>

      {expandido && (
        <div className="vp-accordion-content">
          {r.error && <div className="error" style={{ margin: 8 }}>{r.error}</div>}
          {(r.misFallidas ?? 0) > 0 && (
            <div className="cp-ean-aviso">
              No se pudieron leer {r.misFallidas} ficha{r.misFallidas !== 1 ? "s" : ""} de nuestra web en esta revisión (la web tardó o falló). Las que ya estaban comparadas salen con los precios de la revisión anterior, marcadas como «dato anterior».
            </div>
          )}
          {(r.sinPrecio?.length ?? 0) > 0 && (
            <div className="cp-ean-aviso cp-aviso-rojo">
              <strong>{r.sinPrecio!.length} ficha{r.sinPrecio!.length !== 1 ? "s" : ""} activa{r.sinPrecio!.length !== 1 ? "s" : ""} con precio 0 €</strong> en nuestra web: falta ponerles precio.
              <ul>{r.sinPrecio!.map(u => <li key={u}><a href={u} target="_blank" rel="noreferrer">{(u.split("/es/")[1] ?? u).replace(/-p\d+$/, "").replace(/-/g, " ")}</a></li>)}</ul>
            </div>
          )}
          {(r.eanPendientes ?? 0) > 0 && (
            <div className="cp-ean-aviso">
              Faltan por leer los EAN de {r.eanPendientes} producto{r.eanPendientes !== 1 ? "s" : ""} de Cosméticos24h: esos todavía no se han comparado. Vuelve a revisar la marca para completarlos.
            </div>
          )}

          {r.cambios && (r.cambios.nuevosCaros.length + r.cambios.yaNoCaros.length + r.cambios.novedades.length) > 0 && (
            <div className="cp-cambios">
              <strong>Cambios desde la revisión del {r.cambios.desde ? fechaCorta(r.cambios.desde) : "día anterior"}:</strong>
              {r.cambios.nuevosCaros.length > 0 && <div><span className="cp-rojo">Ahora vamos más caros ({r.cambios.nuevosCaros.length}):</span> {r.cambios.nuevosCaros.join(" · ")}</div>}
              {r.cambios.yaNoCaros.length > 0 && <div><span className="cp-verde">Ya no vamos más caros ({r.cambios.yaNoCaros.length}):</span> {r.cambios.yaNoCaros.join(" · ")}</div>}
              {r.cambios.novedades.length > 0 && <div><span className="cp-rosa">Nuevos en Cosméticos24h ({r.cambios.novedades.length}):</span> {r.cambios.novedades.join(" · ")}</div>}
            </div>
          )}

          {(r.comparaciones.length + r.soloEllos.length + sinEmp.length) > 0 && (
            <>
              <div className="cp-subtit">Comparación de precios (tú vs. Cosméticos24h)</div>
              <TablaInforme filas={compOrden} soloEllos={[...soloEllosReal, ...packs]} soloNosotros={sinEmp} descuento={descuento} cupon={cupon}
                onOcultar={s => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })} />
              {(r.soloEllos.length + sinEmp.length) > 0 && (
                <div className="cp-packs-nota">
                  Al final de la tabla: {r.soloEllos.length} que tienen ellos y nosotros no, y {sinEmp.length} nuestros sin el mismo EAN en Cosméticos24h.
                  Solo se comparan productos con el mismo EAN en las dos webs.
                </div>
              )}
            </>
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
  const cuponActivo: CuponExcel = config?.cupon?.pct != null && config.cupon.pct > 0 ? { pct: config.cupon.pct, codigo: config.cupon.codigo, directo: config.cupon.directo, hasta: config.cupon.hasta, condiciones: condicionesCupon(config.cupon) } : null;

  return (
    <div className="wrap cp-wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Comparar mis precios con Cosméticos24h</h1>
      <p className="subtitle">Cruza tus precios con los de Cosméticos24h, marca a marca. Marca en rojo dónde vas más caro y lista lo que ellos tienen y tú no.</p>

      <div className="two-col cp-layout">
        {/* ── Columna izquierda ── */}
        <div className="left-col">

          <div className="vp-section-title">Añadir marca</div>
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
            <span>La revisión es <strong>marca a marca</strong>: usa el botón "Revisar" de cada marca. Cada marca muestra <strong>su propia fecha</strong> de revisión.</span>
          </div>

          {error && <div className="error">{error}</div>}

          {(config?.marcas.length ?? 0) === 0 && !revisando && (
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
              Añade una marca y pulsa "Revisar" para comparar precios.
            </p>
          )}

          {(config?.marcas ?? []).map(m => {
            // Una marca recién añadida aún no tiene resultados: se muestra igual, para poder revisarla
            const r: ResultadoMarca = resultados.find(x => x.slug === m.slug)
              ?? { marca: m.nombre, slug: m.slug, comparaciones: [], soloEllos: [], misSinEmparejar: [], misProductos: 0, susProductos: 0 };
            return (
            <MarcaBloque
              key={r.slug} r={aplicarCupon(r, cuponExcluye(config?.cupon, m.nombre) ? null : cuponActivo)} cupon={cuponExcluye(config?.cupon, m.nombre) ? null : cuponActivo}
              marca={m} revisando={revisando === m.slug} ocupado={revisando !== null}
              onRevisar={() => revisar(m.slug)} onBorrar={() => deleteMarca(m.slug)}
              onGuardarDescuento={(valor) => guardarDescuento(m.slug, valor)}
              descuento={descuentoDe(m).pct}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
