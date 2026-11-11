"use client";

import { useEffect, useState } from "react";
import { AvisoConexion, fechaCorta, Negocio, NOMBRE, Segmentos, SelectorNegocio, useEstadoGoogle } from "../_google/ui";

type Resena = {
  id: string;
  autor: string;
  foto: string | null;
  estrellas: number;
  texto: string;
  fecha: string;
  respuesta: string | null;
  fechaRespuesta: string | null;
};
type Borrador = { texto: string; generando?: boolean; publicando?: boolean; confirmar?: boolean; error?: string };
type Filtro = "pendientes" | "todas";

const MAX_LOTE = 10;

function Estrellas({ n }: { n: number }) {
  return (
    <span className="gg-estrellas" aria-label={`${n} de 5 estrellas`}>
      {"★".repeat(n)}
      <span style={{ color: "var(--border)" }}>{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

export default function ResenasFicha({ negocio, setNegocio }: { negocio: Negocio; setNegocio: (n: Negocio) => void }) {
  const { estado } = useEstadoGoogle();
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<{ media: number | null; total: number }>({ media: null, total: 0 });
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [borrar, setBorrar] = useState<string | null>(null);
  const [lote, setLote] = useState<{ hechas: number; total: number } | null>(null);

  const lista = estado?.conectado && estado.ajustes[negocio]?.ficha;

  async function cargar(pageToken?: string) {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/google/resenas?negocio=${negocio}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudieron cargar las reseñas");
      setResenas((prev) => (pageToken ? [...prev, ...d.resenas] : d.resenas));
      setResumen({ media: d.media, total: d.total });
      setSiguiente(d.siguiente);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setResenas([]);
    setBorradores({});
    setSiguiente(null);
    if (lista) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio, lista]);

  const setB = (id: string, cambio: Partial<Borrador> | null) =>
    setBorradores((b) => {
      const n = { ...b };
      if (cambio === null) delete n[id];
      else n[id] = { ...{ texto: "" }, ...b[id], ...cambio } as Borrador;
      return n;
    });

  async function redactar(r: Resena) {
    setB(r.id, { generando: true, error: undefined, confirmar: false });
    try {
      const res = await fetch("/api/responder-resenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio, autor: r.autor.split(" ")[0] || undefined, estrellas: r.estrellas, resena: r.texto }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo redactar");
      setB(r.id, { texto: d.texto, generando: false });
    } catch (e) {
      setB(r.id, { generando: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  async function redactarPendientes() {
    const pendientes = resenas.filter((r) => !r.respuesta && !borradores[r.id]?.texto).slice(0, MAX_LOTE);
    setLote({ hechas: 0, total: pendientes.length });
    for (let i = 0; i < pendientes.length; i++) {
      await redactar(pendientes[i]);
      setLote({ hechas: i + 1, total: pendientes.length });
    }
    setLote(null);
  }

  async function publicar(r: Resena) {
    const b = borradores[r.id];
    if (!b?.texto.trim()) return;
    setB(r.id, { publicando: true, error: undefined });
    try {
      const res = await fetch("/api/google/resenas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio, id: r.id, respuesta: b.texto }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo publicar");
      setResenas((lista) => lista.map((x) => (x.id === r.id ? { ...x, respuesta: d.respuesta, fechaRespuesta: d.fechaRespuesta } : x)));
      setB(r.id, null);
    } catch (e) {
      setB(r.id, { publicando: false, confirmar: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  async function borrarRespuesta(r: Resena) {
    setBorrar(null);
    setB(r.id, { publicando: true });
    try {
      const res = await fetch("/api/google/resenas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio, id: r.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo borrar");
      setResenas((lista) => lista.map((x) => (x.id === r.id ? { ...x, respuesta: null, fechaRespuesta: null } : x)));
      setB(r.id, null);
    } catch (e) {
      setB(r.id, { publicando: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  const sinResponder = resenas.filter((r) => !r.respuesta).length;
  const visibles = filtro === "pendientes" ? resenas.filter((r) => !r.respuesta || borradores[r.id]) : resenas;

  return (
    <>
      <div className="gg-barra">
        <SelectorNegocio valor={negocio} onChange={setNegocio} />
        <Segmentos<Filtro>
          opciones={[
            { valor: "pendientes", nombre: `Sin responder${resenas.length ? ` (${sinResponder}${siguiente ? "+" : ""})` : ""}` },
            { valor: "todas", nombre: "Todas" },
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
      </div>

      <AvisoConexion estado={estado} necesita="ficha" negocio={negocio} />
      {error && <div className="gg-aviso gg-aviso-error">{error}</div>}

      {resenas.length > 0 && (
        <div className="gg-panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div className="gg-resumen">
            <span>
              <b>{resumen.media?.toLocaleString("es-ES", { maximumFractionDigits: 1 }) ?? "—"}</b>
              <Estrellas n={Math.round(resumen.media ?? 0)} /> media
            </span>
            <span>
              <b>{resumen.total.toLocaleString("es-ES")}</b>reseñas
            </span>
            <span>
              <b>{sinResponder}</b>sin responder{siguiente ? " (de las cargadas)" : ""}
            </span>
          </div>
          {sinResponder > 0 && (
            <button className="regen-btn" style={{ width: "auto", marginTop: 0 }} onClick={redactarPendientes} disabled={Boolean(lote)}>
              {lote ? `Redactando ${lote.hechas} de ${lote.total}…` : `Redactar respuestas a las sin responder${sinResponder > MAX_LOTE ? ` (${MAX_LOTE})` : ""}`}
            </button>
          )}
        </div>
      )}

      {cargando && resenas.length === 0 && (
        <p className="gg-gris" style={{ fontSize: 14 }}>
          <span className="spinner spinner-dark" /> Cargando reseñas de {NOMBRE[negocio]}…
        </p>
      )}

      {!cargando && lista && !error && visibles.length === 0 && resenas.length > 0 && (
        <div className="gg-aviso gg-ok">Todas las reseñas cargadas están respondidas.</div>
      )}

      <div className="gg-resenas">
        {visibles.map((r) => {
          const b = borradores[r.id];
          const editando = b !== undefined;
          return (
            <div className="gg-resena" key={r.id}>
              <div className="gg-resena-cab">
                <span className="gg-avatar">
                  {r.foto ? <img src={r.foto} alt="" referrerPolicy="no-referrer" /> : (r.autor || "?").charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="gg-autor">{r.autor || "Anónimo"}</div>
                  <div className="gg-fecha">
                    <Estrellas n={r.estrellas} /> · {fechaCorta(r.fecha)}
                  </div>
                </div>
                <span className={`gg-chip ${r.respuesta ? "respondida" : ""}`}>{r.respuesta ? "Respondida" : "Sin responder"}</span>
              </div>

              {r.texto ? <p className="gg-texto">{r.texto}</p> : <p className="gg-sin-texto">Solo valoración, sin texto.</p>}

              {r.respuesta && !editando && (
                <div className="gg-respuesta">
                  <div className="gg-respuesta-tit">Vuestra respuesta{r.fechaRespuesta ? ` · ${fechaCorta(r.fechaRespuesta)}` : ""}</div>
                  {r.respuesta}
                </div>
              )}

              {editando ? (
                <div className="gg-editor">
                  <textarea
                    rows={4}
                    value={b.generando ? "Redactando…" : b.texto}
                    disabled={b.generando || b.publicando}
                    onChange={(e) => setB(r.id, { texto: e.target.value, confirmar: false })}
                    placeholder="Escribe la respuesta…"
                  />
                  <div className="gg-acciones">
                    {b.confirmar ? (
                      <>
                        <span className="gg-confirmar">Se publicará en Google a nombre de {NOMBRE[negocio]}.</span>
                        <button onClick={() => publicar(r)} disabled={b.publicando}>
                          {b.publicando ? "Publicando…" : "Sí, publicar"}
                        </button>
                        <button className="gg-sec" onClick={() => setB(r.id, { confirmar: false })} disabled={b.publicando}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setB(r.id, { confirmar: true })} disabled={!b.texto.trim() || b.generando}>
                          {r.respuesta ? "Cambiar la respuesta en Google" : "Publicar en Google"}
                        </button>
                        <button className="gg-sec" onClick={() => redactar(r)} disabled={b.generando}>
                          {b.generando ? "Redactando…" : "Otra versión con IA"}
                        </button>
                        <button className="gg-sec" onClick={() => setB(r.id, null)} disabled={b.generando}>
                          Descartar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="gg-acciones">
                  {borrar === r.id ? (
                    <>
                      <span className="gg-confirmar">¿Borrar la respuesta publicada en Google?</span>
                      <button onClick={() => borrarRespuesta(r)}>Sí, borrar</button>
                      <button className="gg-sec" onClick={() => setBorrar(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : r.respuesta ? (
                    <>
                      <button className="gg-sec" onClick={() => setB(r.id, { texto: r.respuesta ?? "" })}>
                        Editar respuesta
                      </button>
                      <button className="gg-sec" onClick={() => setBorrar(r.id)}>
                        Borrar respuesta
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => redactar(r)}>Redactar con IA</button>
                      <button className="gg-sec" onClick={() => setB(r.id, { texto: "" })}>
                        Escribirla yo
                      </button>
                    </>
                  )}
                </div>
              )}
              {b?.error && <p className="error" style={{ marginBottom: 0 }}>{b.error}</p>}
            </div>
          );
        })}
      </div>

      {siguiente && (
        <div className="gg-mas">
          <button className="gg-sec" onClick={() => cargar(siguiente)} disabled={cargando}>
            {cargando ? "Cargando…" : "Cargar más reseñas"}
          </button>
        </div>
      )}
    </>
  );
}
