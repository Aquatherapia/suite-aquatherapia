"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { COMPETIDORES, explicarError, type FilaComp, type ResultadoComp, type EstadoComp } from "./competidores";
import { descuentoBoardfy } from "../comparar-precios/boardfy";
import { aplicarCupon, calcularFila, columnasDe, cuponDeMarca, descuentoDe, ordenar, pctTexto, type CuponComp, type MarcaComp } from "./calculo";
import { descargarExcel, descargarPdf, descargarParaMarca, descargarParaTodas, filasParaMarca } from "./exportar";

type Config = {
  marcas: MarcaComp[];
  enlaces: Record<string, Record<string, string>>;
  resultados: Record<string, ResultadoComp>;
  cupon: CuponComp;
};

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = pctTexto;

function fechaExacta(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })} a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}
// Cómo se ha emparejado, para la explicación al pasar el ratón
const COMO: Record<string, string> = { referencia: "por número de referencia", nombre: "por nombre y formato", ia: "con IA (el nombre está en otro idioma o resumido; mismo formato y precio parecido)" };
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

// Celda con explicación al pasar el ratón
function Celda({ className, tip, style, children }: { className?: string; tip?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return <td className={(className ?? "") + (tip ? " cp-tip" : "")} data-tip={tip} style={style}>{children}</td>;
}

function TablaCompetencia({ filas, estados, descuento, cupon }: { filas: FilaComp[]; estados: Record<string, EstadoComp>; descuento: number | null; cupon: CuponComp }) {
  const cols = columnasDe(filas, estados);
  const dto = descuento != null ? `${String(descuento).replace(".", ",")} %` : "";
  return (
    <div className="cp-informe-scroll">
      <table className="cp-informe cc-tabla">
        <thead>
          <tr className="cp-informe-grupos">
            <th colSpan={2}></th>
            <th colSpan={3} className="cp-g-nos">La Tienda de Cosméticos</th>
            {cols.map(c => <th key={c.id} colSpan={2} style={{ background: c.fondo, color: c.color }}>{c.nombre}</th>)}
            <th colSpan={4} className="cp-g-fin">Comparación</th>
          </tr>
          <tr>
            <th>EAN</th><th className="cp-izq">Producto</th>
            <th>PVP</th>
            <th className="cp-tip" data-tip="Nuestro PVP con el descuento autorizado de la marca (el del comparador de Cosméticos24h o, si no hay, el de Boardfy)">{descuento != null ? `Con dto. autorizado (−${dto})` : "Con dto. autorizado"}</th>
            <th>Precio final</th>
            {cols.map(c => [
              <th key={`${c.id}-pvp`} style={{ background: c.color }}>PVP</th>,
              <th key={`${c.id}-precio`} style={{ background: c.color }} className={c.id === "c24" && cupon ? "cp-tip" : undefined}
                data-tip={c.id === "c24" && cupon ? `Su precio web con el cupón de carrito ${cupon.codigo ?? ""} (−${String(cupon.pct).replace(".", ",")} %)` : undefined}>
                {c.id === "c24" && cupon ? `Precio final (${cupon.codigo ?? "cupón"} −${String(cupon.pct).replace(".", ",")} %)` : "Precio final"}
              </th>,
            ])}
            <th className="cp-h-fin">Más barato</th>
            <th className="cp-h-fin cp-tip" data-tip="Precio del competidor más barato menos el nuestro: en negativo, alguien vende más barato que nosotros">Diferencia</th>
            <th className="cp-h-fin cp-tip" data-tip="Cuánto queda el precio más barato de la competencia por debajo de nuestro PVP con el dto. autorizado">Por debajo del dto. autorizado</th>
            <th className="cp-izq cp-h-fin">¿Podemos igualar?</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const k = calcularFila(f, descuento);
            const mbComp = k.mb ? COMPETIDORES.find(c => c.id === k.mb!.id) : undefined;
            const ganamos = k.diferencia == null || k.diferencia >= -0.005;
            return (
              <tr key={i}>
                <td className="cp-suave">{f.ean ?? ""}</td>
                <td className="cp-izq">
                  <a href={f.url} target="_blank" rel="noreferrer" className="cp-prod">{f.nombre}</a>
                  <span className="cp-enlaces">
                    <a href={f.url} target="_blank" rel="noreferrer" className="cp-enlace-ltc">Ver en La Tienda de Cosméticos ↗</a>
                    {cols.filter(c => f.precios[c.id]).map(c => (
                      <a key={c.id} href={f.precios[c.id].url} target="_blank" rel="noreferrer" className="cp-enlace-c24" style={{ color: c.color }}>Ver en {c.corto} ↗</a>
                    ))}
                  </span>
                </td>
                <Celda className={k.revisarPrecio.length ? "cp-ambar" : "cp-azul"}
                  tip={k.revisarPrecio.length ? `Nuestro PVP es más bajo que el de ${k.revisarPrecio.join(", ")}: revisa nuestro precio.` : undefined}>
                  {eur(f.pvp)}{k.revisarPrecio.length > 0 && <span className="cp-revisar-pvp">(revisar precio)</span>}
                </Celda>
                <td className="cp-azul-suave">{k.limite != null ? eur(k.limite) : "—"}</td>
                <Celda className={"cp-fuerte cp-azul" + (k.bajoMinimoMio ? " cp-pasado-fondo" : "")}
                  tip={k.bajoMinimoMio && k.limite != null ? `Nuestro precio está por debajo del PVP con el dto. autorizado (${eur(k.limite)}).` : undefined}>
                  {eur(f.precio)}{k.miDto > 0.0005 && <small className="cp-dto-celda cp-dto-azul">−{pct(k.miDto)}</small>}
                </Celda>
                {cols.map(c => {
                  const p = f.precios[c.id];
                  if (!p) return [<td key={`${c.id}-pvp`} className="cp-vacia">—</td>, <td key={`${c.id}-precio`} className="cp-vacia">—</td>];
                  const kc = k.comp[c.id];
                  // Solo se marca la tienda más barata de la fila, y solo si vende por debajo de nuestro precio
                  const masBaratoQueNos = p.precio < f.precio - 0.005 && k.mb?.id === c.id;
                  const tip = `${p.titulo}${p.por !== "ean" ? ` · emparejado ${COMO[p.por]}` : ""}${p.precioWeb != null ? ` · en su web ${eur(p.precioWeb)}, con cupón ${eur(p.precio)}` : ""}${kc.bajoMinimo && k.limite != null ? ` · por debajo de nuestro PVP con dto. autorizado (${eur(k.limite)})` : ""}`;
                  return [
                    <Celda key={`${c.id}-pvp`} className={kc.pvpSinActualizar ? "cp-ambar" : undefined} style={kc.pvpSinActualizar ? undefined : { color: c.color }}
                      tip={kc.pvpSinActualizar ? `Su PVP es más bajo: ${eur(kc.suPvp)} frente a ${eur(f.pvp)} el nuestro. Tarifa sin actualizar.` : kc.pvpMasAlto ? `Su PVP es más alto: ${eur(kc.suPvp)} frente a ${eur(f.pvp)} el nuestro. Revisa nuestro precio.` : undefined}>
                      {eur(kc.suPvp)}{kc.pvpSinActualizar && <small className="cp-dto-celda cp-sin-actualizar">Tarifa sin actualizar</small>}
                    </Celda>,
                    <td key={`${c.id}-precio`} className={"cp-fuerte" + (kc.bajoMinimo ? " cp-bajo-aut" : masBaratoQueNos ? " cc-mas-barato" : "")} style={kc.bajoMinimo ? undefined : { color: c.color }} title={tip}>
                      <a href={p.url} target="_blank" rel="noreferrer" className="cc-precio">{eur(p.precio)}</a>
                      {p.por !== "ean" && <span className="cc-por" title={`Emparejado ${COMO[p.por]}: su web no publica el EAN`}>≈</span>}
                      {kc.dto > 0.0005 && <small className="cp-dto-celda">−{pct(kc.dto)}</small>}
                    </td>,
                  ];
                })}
                <td className={"cp-izq " + (k.mb == null || k.masBarato === "Igual" ? "cp-suave" : ganamos ? "cp-fuerte cp-azul" : "cp-fuerte")} style={k.mb && !ganamos ? { color: mbComp?.color } : undefined}>
                  {k.masBarato}
                </td>
                <td className={"cp-fuerte " + (k.diferencia == null ? "cp-suave" : k.diferencia < -0.005 ? "cp-rojo" : k.diferencia > 0.005 ? "cp-verde" : "")}>
                  {k.diferencia == null ? "—" : `${k.diferencia > 0.005 ? "+" : ""}${eur(k.diferencia)}`}
                </td>
                <Celda className={k.bajoAutorizado != null ? "cp-fuerte cp-bajo-aut" : "cp-suave"}
                  tip={k.bajoAutorizado != null && k.limite != null ? `${mbComp?.corto} vende por debajo de nuestro PVP con dto. autorizado (${eur(k.limite)}).` : undefined}>
                  {k.bajoAutorizado != null ? eur(k.bajoAutorizado) : "—"}
                </Celda>
                <td className={"cp-izq cp-pequena " + (k.mb == null ? "cp-suave" : k.igualar.startsWith("No") ? "cp-fuerte cp-rojo" : "cp-verde")}>{k.igualar}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Resumen de por qué no se enlazan sus productos, agrupado por motivo («5 otro formato · 3 precio muy distinto»)
function resumenMotivos(sin: NonNullable<EstadoComp["sinPareja"]>): string {
  const grupo = (m: string) => /^No lo tenemos/.test(m) ? "no los tenemos"
    : /otro formato/.test(m) ? "otro formato"
    : /pack o estuche/.test(m) ? "pack o estuche"
    : /precio es muy distinto/.test(m) ? "precio muy distinto"
    : /ya está enlazado/.test(m) ? "repetidos (ya enlazado otro)"
    : /no hay seguridad/.test(m) ? "dudosos"
    : /feed/.test(m) ? "no están en nuestro feed"
    : "otros";
  const n = new Map<string, number>();
  for (const x of sin) { const g = grupo(x.motivo); n.set(g, (n.get(g) ?? 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]).map(([g, k]) => `${k} ${g}`).join(" · ");
}

function EnlaceComp({ id, estado, enlace, nuestros, enlazados, misSin, metodos, onGuardar }: { id: string; estado?: EstadoComp; enlace?: string; nuestros?: number; enlazados?: number; misSin: string[]; metodos: Record<string, number>; onGuardar: (url: string) => void }) {
  const [porQue, setPorQue] = useState(false);
  const c = COMPETIDORES.find(x => x.id === id)!;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(enlace ?? "");
  const noVende = enlace === "";
  const leido = !estado?.error && estado?.leidos != null && !!enlace;
  const n = enlazados ?? estado?.emparejados ?? 0;
  const pct = nuestros ? Math.round((n / nuestros) * 100) : 0;
  const cambiar = <button className="cc-cambiar" onClick={() => { setValor(enlace ?? ""); setEditando(true); }}>cambiar</button>;
  const susSin = estado?.sinPareja ?? [];
  const hayPorQue = !editando && !noVende && !estado?.error && estado?.leidos != null && (misSin.length > 0 || susSin.length > 0);
  return (
    <>
    <tr>
      <td className="cc-t-nombre">{enlace
        ? <a href={enlace} target="_blank" rel="noreferrer" style={{ color: c.color }} title={`Ver la marca en ${c.nombre}`}>{c.nombre} ↗</a>
        : <span style={{ color: c.color }}>{c.nombre}</span>}</td>
      {editando ? (
        <td colSpan={5}>
          <span className="cc-enlace-edit">
            <input value={valor} onChange={e => setValor(e.target.value)} placeholder={`${c.web}/… (vacío = no la vende)`}
              onKeyDown={e => { if (e.key === "Enter") { onGuardar(valor); setEditando(false); } }} autoFocus />
            <button className="regen-btn" onClick={() => { onGuardar(valor); setEditando(false); }}>Guardar</button>
          </span>
        </td>
      ) : estado?.error ? (
        <td colSpan={4} className="cp-rojo">{explicarError(estado.error)}</td>
      ) : noVende ? (
        <td colSpan={4} className="cp-suave-txt">no la vende</td>
      ) : !leido ? (
        <td colSpan={4} className="cp-suave-txt">{enlace === undefined ? "se busca al revisar" : "sin revisar"}</td>
      ) : (
        <>
          <td>Tienen <b>{estado!.leidos} productos</b></td>
          <td>
            <span className="cc-barra"><span style={{ width: `${pct}%`, background: c.color }} /></span>
            enlazan <b>{n} de los {nuestros ?? "?"}</b> de La Tienda de Cosméticos <span className="cp-suave-txt">({pct} %)</span>
          </td>
          <td className="cc-t-como">
            {n === 0 ? <span className="cp-suave-txt">—</span> : <>
              {(["ean", "referencia", "nombre", "ia"] as const).filter(k => metodos[k]).map(k => (
                <div key={k}><b>{metodos[k]}</b> {k === "ean" ? "por código EAN" : k === "referencia" ? "por referencia del fabricante" : k === "nombre" ? "por nombre y formato" : "con IA (nombre en otro idioma)"}</div>
              ))}
              {!metodos.ean && <div className="cp-suave-txt">Su web no publica el EAN</div>}
            </>}
          </td>
          <td className="cc-t-porque">
            {hayPorQue ? (
              <>
                {misSin.length > 0 && <div><b>{misSin.length} nuestros</b> no están en su web (no los venden o no salen en su listado)</div>}
                {estado?.sinPareja === undefined
                  ? <div className="cp-suave-txt">Pulsa «Revisar» para ver por qué no se enlazan los suyos</div>
                  : susSin.length > 0 && <div><b>{susSin.length} suyos</b> sin pareja: {resumenMotivos(susSin)}</div>}
                <button className="cc-porque-btn" onClick={() => setPorQue(v => !v)}>{porQue ? "▲ Ocultar la lista" : "▼ Ver la lista"}</button>
              </>
            ) : <span className="cp-suave-txt">Todos enlazados</span>}
          </td>
        </>
      )}
      {!editando && (
        <td className="cc-t-listado">
          {cambiar}
        </td>
      )}
    </tr>
    {porQue && hayPorQue && (
      <tr className="cc-porque">
        <td colSpan={6}>
          {misSin.length > 0 && (
            <div>
              <strong>De los nuestros sin enlazar ({misSin.length}):</strong> no los venden, o no aparecen en su listado de la marca.
              <ul>{misSin.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {estado?.sinPareja === undefined ? (
            <div className="cp-suave-txt">Pulsa «Revisar» para ver por qué no se han enlazado sus productos.</div>
          ) : susSin.length > 0 && (
            <div>
              <strong>De los suyos sin enlazar ({susSin.length}):</strong>
              <ul>{susSin.map((x, i) => <li key={i}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.titulo}</a> : x.titulo}{x.precio ? ` · ${x.precio.toFixed(2).replace(".", ",")} €` : ""} — <span className="cc-motivo">{x.motivo}</span></li>)}</ul>
            </div>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

// «Para la marca»: lo que la competencia vende por debajo de nuestro dto. autorizado (sin dto., por debajo del PVP), en PDF o Excel
function ParaMarca({ marca, filas, descuento }: { marca: string; filas: FilaComp[]; descuento: number | null }) {
  const [abierto, setAbierto] = useState(false);
  const n = filasParaMarca(filas, descuento ?? 0).length;
  const bajar = (formato: "pdf" | "excel") => {
    setAbierto(false);
    descargarParaMarca(marca, filas, descuento ?? 0, formato).catch(err => alert("No se pudo crear el informe: " + err));
  };
  return (
    <span className="cp-para-marca" onClick={e => e.stopPropagation()}>
      <button className="regen-btn" disabled={n === 0} onClick={() => setAbierto(a => !a)}
        title={`${n === 0 ? "Ningún competidor vende nada" : `Informe para enviar a la marca: ${n} precio${n !== 1 ? "s" : ""} de la competencia`} por debajo ${descuento == null ? "del PVP (la marca no tiene descuento autorizado)" : "del descuento autorizado"}`}>
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

function MarcaBloque({ marca, r, enlaces, cupon, revisando, ocupado, expandido, onToggle, onRevisar, onEnlace, onDescuento }: {
  marca: MarcaComp; r?: ResultadoComp; enlaces: Record<string, string>; cupon: CuponComp; revisando: boolean; ocupado: boolean;
  expandido: boolean; onToggle: () => void; onRevisar: () => void; onEnlace: (comp: string, url: string) => void; onDescuento: (valor: string) => void;
}) {
  const [todos, setTodos] = useState(false);
  const descuento = descuentoDe(marca);
  const cuponMarca = cuponDeMarca(cupon, marca.nombre);
  const filas = aplicarCupon(r?.filas ?? [], cuponMarca);
  const conCompetencia = filas.filter(f => Object.keys(f.precios).length > 0);
  const calc = conCompetencia.map(f => calcularFila(f, descuento));
  const caros = calc.filter(k => k.diferencia != null && k.diferencia < -0.005).length;
  const bajoAut = calc.filter(k => k.bajoAutorizado != null).length;
  const pvpDist = calc.filter(k => k.pvpDistintos > 0).length;
  const orden = ordenar(todos ? filas : conCompetencia);
  const estados = r?.competidores ?? {};
  return (
    <div className="vp-accordion">
      <div className="vp-accordion-header" onClick={onToggle} role="button" tabIndex={0}>
        <span className="vp-accordion-marca">
          {marca.nombre}
          <span className="cp-revisado">{r ? `Revisada el ${fechaExacta(r.revisadoEn)}` : "Sin revisar todavía"}</span>
          <label className="cp-dto" title="Descuento autorizado sobre el PVP. Puedes cambiarlo a mano (vacío = el de Boardfy). Es el mismo que en el comparador de Cosméticos24h" onClick={e => e.stopPropagation()}>
            Dto. autorizado
            <input
              key={`${marca.slug}-${marca.descuentoMax ?? "b"}`}
              className="cp-dto-input"
              inputMode="decimal"
              defaultValue={marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : ""}
              placeholder={descuentoBoardfy(marca.nombre) != null ? String(descuentoBoardfy(marca.nombre)).replace(".", ",") : "—"}
              onBlur={e => { if (e.target.value !== (marca.descuentoMax != null ? String(marca.descuentoMax).replace(".", ",") : "")) onDescuento(e.target.value); }}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            %
            {descuento == null && <span className="cp-suave-txt">sin límite</span>}
          </label>
        </span>
        <div className="vp-accordion-right">
          {caros > 0 && <span className="vp-pill vp-pill-nuevo" title="Productos que algún competidor vende más barato que nosotros">{caros} más caros</span>}
          {bajoAut > 0 && <span className="vp-pill cp-pill-minimo" title={`La competencia vende por debajo de nuestro PVP −${descuento} %: no podemos igualarlos sin pasar el descuento autorizado`}>{bajoAut} más allá de nuestro dto. autorizado</span>}
          {pvpDist > 0 && <span className="vp-pill cp-pill-pvp" title="El PVP sin descuento no coincide con el de algún competidor: tarifa sin actualizar o hay que revisar nuestro precio">{pvpDist} PVP distinto{pvpDist !== 1 ? "s" : ""}</span>}
          {r && <span className="vp-accordion-count">{conCompetencia.length} con competencia · {filas.length} nuestros</span>}
          <button className="regen-btn cp-revisar-btn" disabled={ocupado} onClick={e => { e.stopPropagation(); onRevisar(); }} title="Leer los precios de esta marca en todas las webs">
            {revisando ? "Revisando…" : "Revisar"}
          </button>
          <button className="regen-btn" disabled={!conCompetencia.length} title="Descargar el informe de esta marca en PDF"
            onClick={e => { e.stopPropagation(); descargarPdf(marca.nombre, conCompetencia, estados, descuento, cuponMarca).catch(err => alert("No se pudo crear el PDF: " + err)); }}>PDF</button>
          <button className="regen-btn" disabled={!conCompetencia.length} title="Descargar el informe de esta marca en Excel"
            onClick={e => { e.stopPropagation(); descargarExcel(marca.nombre, conCompetencia, estados, descuento, cuponMarca).catch(err => alert("No se pudo crear el Excel: " + err)); }}>Excel</button>
          <ParaMarca marca={marca.nombre} filas={conCompetencia} descuento={descuento} />
          <span className="vp-chevron">{expandido ? "▲" : "▼"}</span>
        </div>
      </div>
      {expandido && (
        <div className="vp-accordion-content">
          <div className="cc-enlaces">
            <div className="cc-nuestros">Nosotros tenemos <b>{r ? `${r.filas.length} productos` : "—"}</b> de {marca.nombre}{r ? ". Cuántos hemos podido enlazar en cada tienda:" : " (pulsa «Revisar»)."}</div>
            <table className="cc-tabla-tiendas">
              <thead><tr><th>Tienda</th><th>Sus productos</th><th>Enlazados con los nuestros</th><th>Cómo se enlazan</th><th>Por qué no se enlazan los demás</th><th></th></tr></thead>
              <tbody>
                {COMPETIDORES.map(c => (
                  <EnlaceComp key={`${c.id}-${enlaces[c.id] ?? "x"}`} id={c.id} estado={estados[c.id]} enlace={enlaces[c.id]} nuestros={r?.filas.length} enlazados={r?.filas.filter(f => f.precios[c.id]).length} metodos={(r?.filas ?? []).reduce((acc, f) => { const p = f.precios[c.id]; if (p) acc[p.por] = (acc[p.por] ?? 0) + 1; return acc; }, {} as Record<string, number>)} misSin={(r?.filas ?? []).filter(f => !f.precios[c.id]).map(f => f.formato && !f.nombre.includes(f.formato) ? `${f.nombre} (${f.formato})` : f.nombre)} onGuardar={url => onEnlace(c.id, url)} />
                ))}
              </tbody>
            </table>
          </div>
          {cuponMarca && <div className="cc-nota">El precio final de Cosméticos24h lleva su cupón de carrito {cuponMarca.codigo ?? ""} (−{String(cuponMarca.pct).replace(".", ",")} %).</div>}
          {r?.cambios && (r.cambios.nuevosCaros.length + r.cambios.yaNoCaros.length) > 0 && (
            <div className="cp-cambios">
              <strong>Cambios desde la revisión del {fechaCorta(r.cambios.desde)}:</strong>
              {r.cambios.nuevosCaros.length > 0 && <div><span className="cp-rojo">Ahora vamos más caros ({r.cambios.nuevosCaros.length}):</span> {r.cambios.nuevosCaros.join(" · ")}</div>}
              {r.cambios.yaNoCaros.length > 0 && <div><span className="cp-verde">Ya no vamos más caros ({r.cambios.yaNoCaros.length}):</span> {r.cambios.yaNoCaros.join(" · ")}</div>}
            </div>
          )}
          {!r && <p className="cc-nota">Pulsa «Revisar»: se buscan solos los listados de la marca en cada web y se leen sus precios.</p>}
          {r && (
            <>
              <label className="cc-todos"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Ver también los productos que no tiene ningún competidor ({filas.length - conCompetencia.length})</label>
              {orden.length > 0 ? <TablaCompetencia filas={orden} estados={estados} descuento={descuento} cupon={cuponMarca} /> : <p className="cc-nota">Ningún competidor tiene productos de esta marca emparejados con los nuestros.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompararCompetidores() {
  const [config, setConfig] = useState<Config | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");

  useEffect(() => { fetch("/api/comparar-competidores").then(r => r.json()).then(setConfig); }, []);

  async function enviar(body: object) {
    const res = await fetch("/api/comparar-competidores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const texto = await res.text();
    let data;
    try { data = JSON.parse(texto); }
    catch {
      // Vercel devuelve una página de error (no JSON) si la revisión tarda demasiado o el servidor falla
      setError(res.status === 504 || /timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(texto)
        ? "La revisión ha tardado demasiado y se ha cortado (alguna web responde muy despacio). Vuelve a pulsar «Revisar»."
        : `El servidor ha fallado (error ${res.status}). Vuelve a intentarlo en un momento.`);
      return false;
    }
    if (data.error) { setError(explicarError(data.error)); return false; }
    setConfig(data);
    return true;
  }

  async function revisar(slug: string) {
    setRevisando(slug); setError("");
    try {
      if (await enviar({ action: "revisar", slug })) setExpandidos(prev => new Set(prev).add(slug));
    } catch (e) {
      setError(explicarError(e instanceof Error ? e.message : String(e)));
    } finally {
      setRevisando(null);
    }
  }

  function toggle(slug: string) {
    setExpandidos(prev => { const n = new Set(prev); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  }

  const marcas = (config?.marcas ?? []).filter(m => m.nombre.toLowerCase().includes(filtro.toLowerCase()));
  // Primero las ya revisadas, después el resto por orden alfabético
  marcas.sort((a, b) => (config?.resultados[b.slug] ? 1 : 0) - (config?.resultados[a.slug] ? 1 : 0) || a.nombre.localeCompare(b.nombre));

  return (
    <div className="wrap cp-wrap">
      <Link href="/" className="volver-link">← Herramientas IA</Link>
      <h1>Comparar precios con la competencia</h1>
      <p className="subtitle">Nuestros precios frente a los de {COMPETIDORES.map(c => c.nombre).join(", ")}, marca a marca y en una sola tabla. En rojo, quien vende más barato que nosotros.</p>

      <div className="vp-notif-bar" style={{ background: "var(--card-bg, #f7f7f8)" }}>
        <span>Están todas las marcas de nuestra web. Pulsa <strong>«Revisar»</strong> en cada una: el listado de la marca en cada web se busca solo (puedes cambiarlo o marcar que no la venden) y los productos se emparejan por EAN o, si su web no lo publica, por nombre y formato o, si el nombre está en otro idioma, con IA (≈).</span>
      </div>
      <div className="cc-barra-sup">
        <input className="cc-filtro" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar marca…" />
        <button className="regen-btn" disabled={!config || !Object.keys(config.resultados).length}
          title="Un Excel con todas las marcas revisadas en las que alguna tienda vende por debajo del descuento autorizado (una hoja por marca)"
          onClick={() => {
            if (!config) return;
            const lista = config.marcas.filter(m => config.resultados[m.slug]).map(m => ({
              nombre: m.nombre,
              filas: aplicarCupon(config.resultados[m.slug].filas, cuponDeMarca(config.cupon ?? null, m.nombre)),
              descuento: descuentoDe(m) ?? 0,
            }));
            setError("");
            descargarParaTodas(lista).catch(err => setError(err instanceof Error ? err.message : String(err)));
          }}>Excel para las marcas (todas)</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!config && <p className="cc-nota">Cargando…</p>}
      {marcas.map(m => (
        <MarcaBloque key={m.slug} marca={m} r={config?.resultados[m.slug]} enlaces={config?.enlaces[m.slug] ?? {}} cupon={config?.cupon ?? null}
          revisando={revisando === m.slug} ocupado={revisando !== null}
          expandido={expandidos.has(m.slug)} onToggle={() => toggle(m.slug)}
          onRevisar={() => revisar(m.slug)} onEnlace={(comp, url) => enviar({ action: "enlace", slug: m.slug, comp, url })}
          onDescuento={valor => {
            const v = valor.trim().replace(",", ".").replace("%", "");
            if (v && !Number.isFinite(Number(v))) { setError("El descuento tiene que ser un número"); return; }
            enviar({ action: "descuento", slug: m.slug, descuentoMax: v ? Number(v) : null });
          }} />
      ))}
    </div>
  );
}
