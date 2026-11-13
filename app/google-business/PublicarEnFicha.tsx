"use client";

import { useEffect, useState } from "react";
import { Negocio, NOMBRE, useEstadoGoogle } from "../_google/ui";

const WEB: Record<Negocio, string> = {
  tienda: "https://www.latiendadecosmeticos.com/",
  aquatherapia: "https://www.spasalamanca.com/",
};

/** Publica el texto como novedad en la ficha de Google del negocio. */
export default function PublicarEnFicha({ negocio, texto }: { negocio: Negocio; texto: string }) {
  const { estado } = useEstadoGoogle();
  const [enlace, setEnlace] = useState(WEB[negocio]);
  const [boton, setBoton] = useState<"LEARN_MORE" | "BOOK">("LEARN_MORE");
  const [fase, setFase] = useState<"" | "confirmar" | "publicando" | "ok">("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setEnlace(WEB[negocio]);
    setBoton(negocio === "aquatherapia" ? "BOOK" : "LEARN_MORE");
    setFase("");
    setError("");
  }, [negocio]);

  useEffect(() => {
    if (fase === "ok") setFase("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  if (!estado) return null;
  if (!estado.conectado || !estado.ajustes[negocio]?.ficha)
    return (
      <p className="gg-panel-nota">
        Para publicarlo directamente en la ficha, <a href="/conexion-google">conecta la Suite con Google</a>.
      </p>
    );

  async function publicar() {
    setFase("publicando");
    setError("");
    try {
      const r = await fetch("/api/google/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio, texto, enlace: enlace.trim(), boton }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo publicar");
      setUrl(d.url);
      setFase("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setFase("");
    }
  }

  return (
    <div className="gg-panel" style={{ marginTop: 16, marginBottom: 0 }}>
      <h2>Publicar en la ficha de {NOMBRE[negocio]}</h2>
      <label>Enlace del botón (opcional)</label>
      <input type="url" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://…" />
      {enlace.trim() && (
        <>
          <label>Texto del botón</label>
          <select className="rc-select" value={boton} onChange={(e) => setBoton(e.target.value as "LEARN_MORE" | "BOOK")}>
            <option value="LEARN_MORE">Más información</option>
            <option value="BOOK">Reservar</option>
          </select>
        </>
      )}
      <div className="gg-acciones" style={{ marginTop: 14 }}>
        {fase === "confirmar" || fase === "publicando" ? (
          <>
            <span className="gg-confirmar">Se publicará en Google sin foto. ¿Seguimos?</span>
            <button onClick={publicar} disabled={fase === "publicando"}>
              {fase === "publicando" ? "Publicando…" : "Sí, publicar"}
            </button>
            <button className="gg-sec" onClick={() => setFase("")} disabled={fase === "publicando"}>
              Cancelar
            </button>
          </>
        ) : fase === "ok" ? (
          <span className="gg-sube" style={{ fontWeight: 600, fontSize: 14 }}>
            Publicado ✓ {url && <a href={url} target="_blank" rel="noreferrer">Ver en Google</a>}
          </span>
        ) : (
          <button onClick={() => setFase("confirmar")} disabled={!texto.trim() || texto.length > 1500}>
            Publicar en Google
          </button>
        )}
      </div>
      {texto.length > 1500 && <p className="error">Google admite como máximo 1.500 caracteres.</p>}
      {error && <p className="error">{error}</p>}
      <p className="gg-panel-nota">Google revisa las novedades antes de mostrarlas; pueden tardar un rato en salir. Si quieres ponerle foto, publícalo desde la app de Google.</p>
    </div>
  );
}
