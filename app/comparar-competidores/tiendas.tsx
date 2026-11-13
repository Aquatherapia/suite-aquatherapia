"use client";

// Panel «Tiendas con las que comparamos»: quitar o volver a poner tiendas, añadir otras por su web
// y ver las que propone Google (Merchant Center) para añadirlas con un toque.
import { useState } from "react";
import { BASE, COMPETIDORES, type AjustesCompetidores } from "./competidores";

export type PropuestaGoogle = { dominio: string; web: string; categorias: string[]; rank: number; coincidencia: number; porEncima: number; visibilidad: number };

const pct = (n: number) => `${Math.round(n * 100)} %`;
const dominioDe = (web: string) => { try { return new URL(web).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Tiendas({ ajustes, merchantId, propuestas, enviar }: {
  ajustes?: AjustesCompetidores;
  merchantId?: string;
  propuestas?: { fecha: string; lista: PropuestaGoogle[]; avisos: string[] };
  enviar: (body: object) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [web, setWeb] = useState("");
  const [cuenta, setCuenta] = useState(merchantId ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const quitadas = BASE.filter(c => ajustes?.quitados?.includes(c.id));
  const yaEstan = new Set([...BASE, ...(ajustes?.extra ?? [])].map(c => dominioDe(c.web)));

  async function hacer(clave: string, body: object) {
    setOcupado(clave);
    try { return await enviar(body); } finally { setOcupado(null); }
  }

  return (
    <div className="ct-panel">
      <button className="ct-cab" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>
        <span><b>Tiendas con las que comparamos</b> <span className="cp-suave-txt">({COMPETIDORES.length})</span></span>
        <span className="cp-suave-txt">{abierto ? "▲ Cerrar" : "▼ Cambiar o buscar más"}</span>
      </button>
      {abierto && (
        <div className="ct-cuerpo">
          <div className="ct-chips">
            {COMPETIDORES.map(c => (
              <span key={c.id} className="ct-chip" style={{ color: c.color, background: c.fondo }}>
                <a href={c.web} target="_blank" rel="noreferrer" style={{ color: c.color }}>{c.nombre}</a>
                <button className="ct-x" title={`Quitar ${c.nombre} de la comparación`} disabled={!!ocupado}
                  onClick={() => hacer(`q-${c.id}`, { action: "quitar-competidor", id: c.id })}>×</button>
              </span>
            ))}
          </div>
          {quitadas.length > 0 && (
            <p className="ct-nota">Quitadas: {quitadas.map((c, i) => (
              <span key={c.id}>{i > 0 && " · "}{c.nombre} <button className="cc-cambiar" disabled={!!ocupado}
                onClick={() => hacer(`a-${c.id}`, { action: "activar-competidor", id: c.id })}>volver a poner</button></span>
            ))}</p>
          )}

          <div className="ct-fila">
            <input value={web} onChange={e => setWeb(e.target.value)} placeholder="Añadir una tienda: https://…"
              onKeyDown={e => { if (e.key === "Enter" && web.trim()) hacer("anadir", { action: "anadir-competidor", web }).then(ok => ok && setWeb("")); }} />
            <button className="regen-btn" disabled={!web.trim() || !!ocupado}
              onClick={() => hacer("anadir", { action: "anadir-competidor", web }).then(ok => ok && setWeb(""))}>
              {ocupado === "anadir" ? "Mirando su web…" : "Añadir"}
            </button>
          </div>
          <p className="ct-nota">Se pueden leer solas las tiendas hechas con Shopify, WooCommerce o PrestaShop. Al añadirla, pulsa «Revisar» en cada marca y su listado se busca solo.</p>

          <h3 className="ct-h">Competidores que propone Google</h3>
          <p className="ct-nota">Sale del informe de Merchant Center «Visibilidad frente a la competencia»: las webs que aparecen con nosotros en Google Shopping en España, en cosmética y cuidado personal (Google no lo da por marca). Hace falta tener la Suite conectada en <a href="/conexion-google">Conexión con Google</a>.</p>
          <div className="ct-fila">
            <input value={cuenta} onChange={e => setCuenta(e.target.value)} placeholder="Nº de cuenta de Merchant Center" inputMode="numeric" />
            <button className="regen-btn" disabled={!cuenta.trim() || !!ocupado}
              onClick={() => hacer("google", { action: "buscar-competidores", merchantId: cuenta })}>
              {ocupado === "google" ? "Preguntando a Google…" : propuestas ? "Volver a buscar" : "Buscar competidores"}
            </button>
          </div>
          {propuestas && (
            <>
              <p className="ct-nota">Búsqueda del {fecha(propuestas.fecha)} · {propuestas.lista.length} webs. «Coincide» es en qué parte de nuestras búsquedas sale también; «Por encima», en cuántas de esas sale más arriba que nosotros.</p>
              {propuestas.lista.length === 0 && <p className="ct-nota">Google no ha dado competidores (puede que aún no haya datos suficientes en la cuenta).</p>}
              <ul className="ct-lista">
                {propuestas.lista.map(p => {
                  const esta = yaEstan.has(p.dominio);
                  return (
                    <li key={p.dominio}>
                      <span className="ct-dom"><a href={p.web} target="_blank" rel="noreferrer">{p.dominio}</a>
                        <span className="cp-suave-txt"> · {p.categorias.join(", ")}</span></span>
                      <span className="ct-datos">Coincide {pct(p.coincidencia)} · Por encima {pct(p.porEncima)}</span>
                      {esta ? <span className="ct-ya">Ya está</span> : (
                        <button className="regen-btn" disabled={!!ocupado}
                          onClick={() => hacer(`p-${p.dominio}`, { action: "anadir-competidor", web: p.web })}>
                          {ocupado === `p-${p.dominio}` ? "Mirando…" : "Añadir"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {propuestas.avisos.length > 0 && <p className="ct-nota">Algunas categorías no han salido: {propuestas.avisos.slice(0, 3).join(" · ")}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
