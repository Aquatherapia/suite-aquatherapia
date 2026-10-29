"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { calcularFila, explicaDtoMaxLarga, construirExcel, nombreArchivo, type CuponExcel } from "./excel";
import { construirPdf, nombrePdf } from "./pdf";
import { descuentoBoardfy } from "./boardfy";

type Comparacion = {
  nombre: string; miPrecio: number; suPrecio: number; suPrecioTachado?: number;
  miPvp?: number; suPvp?: number; // PVP sin descuento (faltan en resultados guardados antes)
  suPrecioWeb?: number; // precio de su web antes del cupón de carrito (suPrecio ya lo lleva aplicado)
  descatalogado?: boolean; // tu ficha está descatalogada en tu web
  stock?: number;          // unidades que quedan si está descatalogada
  diff: number; confianza: number; miUrl: string; suUrl: string; esPack?: boolean; manual?: boolean;
  verificado?: boolean; nombreEditado?: boolean; porEan?: boolean; ean?: string;
};
type SoloEllos = { titulo: string; precio: number; tachado?: number; url: string; esPack: boolean; ean?: string };
type MiSinEmparejar = { nombre: string; url: string; precio: number; pvp?: number; esPack: boolean; sinEan?: boolean; ean?: string; formato?: string; descatalogado?: boolean; stock?: number };
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
type Cupon = { pct: number | null; codigo?: string; directo?: boolean; manual?: boolean; detectadoEn?: string; desde?: string; hasta?: string };
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

// Listas de productos sin pareja, con el mismo diseño que la tabla de comparación
function TablaSoloEllos({ filas, cupon, onOcultar }: { filas: SoloEllos[]; cupon: CuponExcel; onOcultar: (s: SoloEllos) => void }) {
  const hayCupon = !!cupon && cupon.pct > 0;
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe cp-informe-lista">
        <thead>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th className="cp-h-ellos">PVP</th><th className="cp-h-ellos">Precio web</th>
            <th className="cp-h-ellos">{hayCupon ? `Precio final (${cupon!.codigo ?? "cupón"} −${String(cupon!.pct).replace(".", ",")} %${cupon!.directo ? ", directo en carrito" : ""})` : "Precio final"}</th>
            <th className="cp-h-ellos">Dto. total</th><th />
          </tr>
        </thead>
        <tbody>
          {filas.map((s, i) => {
            const pvp = s.tachado && s.tachado > s.precio ? s.tachado : s.precio;
            const final = hayCupon ? Math.round(s.precio * (1 - cupon!.pct / 100) * 100) / 100 : s.precio;
            const dtoWeb = pvp > 0 ? 1 - s.precio / pvp : 0;
            const dto = pvp > 0 ? 1 - final / pvp : 0;
            return (
              <tr key={i}>
                <td className="cp-suave"><span className="cp-ean-copiable">{s.ean ?? ""}</span></td>
                <td className="cp-izq">
                  {s.esPack && <span className="cp-pack-tag">pack</span>}
                  <a href={s.url} target="_blank" rel="noreferrer" className="cp-prod">{s.titulo}</a>
                  <a href={s.url} target="_blank" rel="noreferrer" className="cp-enlace-c24">Ver en Cosméticos24h ↗</a>
                </td>
                <td className="cp-rosa">{eur(pvp)}</td>
                <td className="cp-rosa">{eur(s.precio)}{dtoWeb > 0.0005 && <span className="cp-dto-celda">−{pctW(dtoWeb)}</span>}</td>
                <td className="cp-fuerte cp-rosa">{eur(final)}</td>
                <td className="cp-fuerte cp-pequena cp-rosa">{pctW(dto)}</td>
                <td className="cp-centro"><button className="cp-ocultar" title="Ocultar" onClick={() => onOcultar(s)}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TablaSoloNosotros({ filas }: { filas: MiSinEmparejar[] }) {
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe cp-informe-lista">
        <thead>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th><th>PVP</th><th>Precio final</th><th>Dto.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m, i) => {
            const pvp = m.pvp && m.pvp > m.precio ? m.pvp : m.precio;
            const dto = pvp > 0 ? 1 - m.precio / pvp : 0;
            return (
              <tr key={i}>
                <td className="cp-suave">
                  {m.ean ? <span className="cp-ean-copiable">{m.ean}</span>
                    : <span className="cp-sin-ean">{m.formato ? "EAN no publicado (formato)" : "Sin EAN en la ficha"}</span>}
                </td>
                <td className="cp-izq">
                  {m.esPack && <span className="cp-pack-tag">pack</span>}
                  {m.descatalogado && <EtiquetaDescat stock={m.stock} />}
                  <a href={m.url} target="_blank" rel="noreferrer" className="cp-prod">{m.nombre}</a>
                </td>
                <td>{eur(pvp)}</td>
                <td className="cp-fuerte">{eur(m.precio)}</td>
                <td className="cp-dto-azul">{pctW(dto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Misma tabla que el Excel: mismas columnas, colores y cálculos
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const pctW = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;
function TablaInforme({ filas, descuento, cupon }: { filas: Comparacion[]; descuento: number | null; cupon: CuponExcel }) {
  const pct = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  const conCupon = cupon && cupon.pct > 0
    ? `Precio final (${cupon.codigo ?? "cupón"} −${String(cupon.pct).replace(".", ",")} %${cupon.directo ? ", directo en carrito" : ""})`
    : "Precio final (sin cupón)";
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe">
        <thead>
          <tr className="cp-informe-grupos">
            <th colSpan={2} />
            <th colSpan={4} className="cp-g-nos">Nosotros</th>
            <th colSpan={4} className="cp-g-ellos">Cosméticos24h</th>
            <th colSpan={3} />
          </tr>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th>PVP</th><th>{descuento != null ? `Con dto. máx. (−${pct})` : "Con dto. máx."}</th><th>Precio final</th><th>Dto.</th>
            <th className="cp-h-ellos">PVP</th><th className="cp-h-ellos">Precio web</th><th className="cp-h-ellos">{conCupon}</th><th className="cp-h-ellos">Dto. total</th>
            <th>Diferencia</th><th>Más barato</th><th className="cp-izq">¿Podemos igualar?</th>
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
                  <a href={f.miUrl} target="_blank" rel="noreferrer" className="cp-prod">{f.nombre}</a>
                  <a href={f.suUrl} target="_blank" rel="noreferrer" className="cp-enlace-c24">Ver en Cosméticos24h ↗</a>
                </td>
                <Celda className={k.pvpDistinto ? "cp-ambar" : ""} tip={k.esPack ? "Pack: nuestro PVP es la suma de los productos sueltos, así que no se aplica el dto. máx. ni se compara el PVP." : k.pvpDistinto ? `PVP distinto: nuestro ${eur(k.pvp)}, el suyo ${eur(k.suPvp)}. ¿Tarifa sin actualizar?` : undefined}>
                  {eur(k.pvp)}{k.revisarPvp && <span className="cp-revisar-pvp">(revisar precio)</span>}
                </Celda>
                <td className="cp-suave">{k.limite != null ? eur(k.limite) : "—"}</td>
                <Celda className={"cp-fuerte" + (k.bajoMinimo.mio ? " cp-rojo-fondo" : "")} tip={k.bajoMinimo.mio && k.limite != null ? `Nuestro precio está por debajo del PVP con el dto. máx. (${eur(k.limite)}).` : undefined}>{eur(f.miPrecio)}</Celda>
                <td className={"cp-dto-azul" + (k.bajoMinimo.mio ? " cp-rojo" : "")}>{pctW(k.miDto)}</td>
                <Celda className={k.pvpDistinto ? "cp-ambar" : "cp-rosa"} tip={k.pvpDistinto ? `PVP distinto: el suyo ${eur(k.suPvp)}, el nuestro ${eur(k.pvp)}.` : undefined}>{eur(k.suPvp)}</Celda>
                <td className="cp-rosa">{eur(k.suWeb)}{k.suDtoWeb > 0.0005 && <small className="cp-dto-celda">−{pctW(k.suDtoWeb)}</small>}</td>
                <td className="cp-fuerte cp-rosa">{eur(f.suPrecio)}</td>
                <td className="cp-fuerte cp-pequena cp-rosa">{pctW(k.suDto)}</td>
                <Celda className={"cp-fuerte " + (k.bajoMinimo.suyo ? "cp-morado-fondo " : "") + (f.diff > 0.01 ? "cp-rojo" : f.diff < -0.01 ? "cp-verde" : "")} tip={explicaDtoMaxLarga(f, k, descuento) ?? undefined}>
                  {f.diff > 0.005 ? "+" : ""}{eur(f.diff)}
                </Celda>
                <td className={"cp-centro cp-pequena " + (k.masBarato === "Cosméticos24h" ? "cp-fuerte cp-rojo" : k.masBarato === "Nosotros" ? "cp-fuerte cp-verde" : "cp-suave")}>{k.masBarato}</td>
                <td className={"cp-izq cp-pequena " + (k.igualar.startsWith("No") ? "cp-fuerte cp-rojo" : "cp-verde")}>{k.igualar}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarcaBloque({
  r, descuento, deBoardfy, cupon, marca, revisando, ocupado, onRevisar, onBorrar, onGuardarDescuento, ocultos, expandido, onToggle, mostrarTodos, onToggleMostrar, onExcluir, onIncluir, onMotivo, onVerificar, onDesverificar, onRenombrar, onRestaurarNombre,
}: {
  r: ResultadoMarca; descuento: number | null; deBoardfy: boolean; cupon: CuponExcel;
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
          <label className="cp-dto" title="Descuento máximo sobre el PVP. Vacío = el de la regla de Boardfy" onClick={e => e.stopPropagation()}>
            Dto. máx.
            <input
              key={`${marca.slug}-${marca.descuentoMax ?? "b"}`}
              className="cp-dto-input"
              inputMode="decimal"
              defaultValue={marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : ""}
              placeholder={descuentoBoardfy(marca.nombre) != null ? String(descuentoBoardfy(marca.nombre)).replace(".", ",") : "—"}
              onBlur={e => { if (e.target.value !== (marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : "")) onGuardarDescuento(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            %{deBoardfy && descuento != null && <span className="cp-dto-fuente">Boardfy</span>}
            {descuento == null && <span className="cp-dto-fuente cp-suave-txt">sin límite</span>}
          </label>
        </span>
        <div className="vp-accordion-right">
          {masCaro.length > 0 && (
            <span className="vp-pill vp-pill-nuevo">{masCaro.length} caro{masCaro.length !== 1 ? "s" : ""}</span>
          )}
          {conBajoMinimo.length > 0 && (
            <span className="vp-pill cp-pill-minimo" title={`Cosméticos24h vende por debajo de nuestro PVP −${descuento} %: no podemos igualarlos sin pasar el descuento máximo`}>{conBajoMinimo.length} más allá de nuestro dto. máx.</span>
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
          {confirmarBorrar
            ? <button className="vp-delete-btn cp-borrar-confirmar" onClick={e => { e.stopPropagation(); onBorrar(); }} onBlur={() => setConfirmarBorrar(false)} autoFocus>¿Quitar marca?</button>
            : <button className="vp-delete-btn" title="Quitar esta marca" onClick={e => { e.stopPropagation(); setConfirmarBorrar(true); }}>×</button>}
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
              <TablaSoloEllos filas={soloEllosReal} cupon={cupon} onOcultar={s => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })} />
            </>
          )}

          {packs.length > 0 && (
            <>
              <div className="cp-subtit" style={{ marginTop: 16 }}>
                Packs/estuches que tienen ellos y tú no ({packs.length})
              </div>
              <TablaSoloEllos filas={packs} cupon={cupon} onOcultar={s => onExcluir({ suUrl: s.url, titulo: s.titulo, tipo: "soloEllos", suPrecio: s.precio })} />
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
                  <TablaSoloNosotros filas={sinEmp} />
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

  async function guardarHastaCupon(hasta: string) {
    const res = await fetch("/api/comparar-precios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cupon-hasta", hasta: hasta || null }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    setConfig(data);
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
  const cuponActivo: CuponExcel = config?.cupon?.pct != null && config.cupon.pct > 0 ? { pct: config.cupon.pct, codigo: config.cupon.codigo, directo: config.cupon.directo, hasta: config.cupon.hasta } : null;

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
            {config?.cupon?.pct != null && config.cupon.pct > 0 && (
              <span className={"cp-cupon-directo" + (config.cupon.directo ? "" : " cp-cupon-codigo")}>
                {config.cupon.directo ? "Directo en carrito, sin poner código" : "Hay que poner el código en el carrito"}
              </span>
            )}
            {config?.cupon?.pct != null && config.cupon.pct > 0 && (
              <span className="cp-cupon-fechas">
                {config.cupon.desde && <>Visto desde el {new Date(config.cupon.desde).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · </>}
                Hasta{" "}
                <input
                  type="date" className="cp-cupon-hasta"
                  defaultValue={config.cupon.hasta ?? ""}
                  key={`hasta-${config.cupon.hasta ?? ""}`}
                  onChange={e => guardarHastaCupon(e.target.value)}
                  title="Su web no publica la fecha de fin: ponla si la sabes. Si deja de anunciarlo, al revisar el cupón desaparece."
                />
                {!config.cupon.hasta && <span className="cp-cupon-sinfecha"> (su web no lo indica)</span>}
              </span>
            )}
          </label>

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
              key={r.slug} r={aplicarCupon(r, cuponActivo)} cupon={cuponActivo}
              marca={m} revisando={revisando === m.slug} ocupado={revisando !== null}
              onRevisar={() => revisar(m.slug)} onBorrar={() => deleteMarca(m.slug)}
              onGuardarDescuento={(valor) => guardarDescuento(m.slug, valor)}
              descuento={descuentoDe(m).pct}
              deBoardfy={descuentoDe(m).deBoardfy}
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
