"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EstadoGoogle, Negocio, NOMBRE, useEstadoGoogle } from "../_google/ui";

type Opcion = { id: string; nombre: string; cuenta?: string };
type Lista = { lista?: Opcion[]; error?: string };
type Opciones = { fichas: Lista; sitios: Lista; propiedades: Lista };
type Ajustes = EstadoGoogle["ajustes"];

const ERRORES: Record<string, string> = {
  "sin-credenciales": "Faltan las claves de Google en Vercel (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).",
  cancelado: "Se canceló el permiso en Google. Puedes volver a intentarlo.",
  estado: "La conexión caducó o vino de otro sitio. Vuelve a pulsar «Conectar con Google».",
  "sin-refresh": "Google no ha dado el permiso permanente. Quita el acceso de la Suite en myaccount.google.com/permissions y vuelve a conectar.",
};

function Contenido() {
  const params = useSearchParams();
  const { estado, recargar } = useEstadoGoogle();
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [cargandoOpc, setCargandoOpc] = useState(false);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [guardado, setGuardado] = useState<"" | "guardando" | "ok" | "error">("");
  const [confirmarDesc, setConfirmarDesc] = useState(false);

  const ok = params.get("ok");
  const err = params.get("error");

  useEffect(() => {
    if (estado) setAjustes(estado.ajustes ?? {});
    if (estado?.conectado && !opciones && !cargandoOpc) cargarOpciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function cargarOpciones() {
    setCargandoOpc(true);
    try {
      const r = await fetch("/api/google/opciones");
      setOpciones(await r.json());
    } finally {
      setCargandoOpc(false);
    }
  }

  function cambiar(n: Negocio, campo: "ficha" | "sitio" | "propiedad", id: string, lista?: Opcion[]) {
    const nombre = lista?.find((o) => o.id === id)?.nombre;
    setAjustes((a) => ({
      ...a,
      [n]: {
        ...a[n],
        [campo]: id || undefined,
        ...(campo === "ficha" ? { fichaNombre: nombre } : {}),
        ...(campo === "propiedad" ? { propiedadNombre: nombre } : {}),
      },
    }));
    setGuardado("");
  }

  async function guardar() {
    setGuardado("guardando");
    const r = await fetch("/api/google/ajustes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ajustes) });
    setGuardado(r.ok ? "ok" : "error");
    if (r.ok) recargar();
  }

  async function desconectar() {
    await fetch("/api/google/desconectar", { method: "POST" });
    setConfirmarDesc(false);
    setOpciones(null);
    recargar();
  }

  const pasoCred = Boolean(estado?.credenciales);
  const pasoConex = Boolean(estado?.conectado);
  const pasoAjustes = pasoConex && (["tienda", "aquatherapia"] as Negocio[]).every((n) => estado?.ajustes[n]?.ficha || estado?.ajustes[n]?.sitio || estado?.ajustes[n]?.propiedad);

  function Desplegable({ n, campo, lista, vacio }: { n: Negocio; campo: "ficha" | "sitio" | "propiedad"; lista: Lista | undefined; vacio: string }) {
    const valor = ajustes[n]?.[campo] ?? "";
    if (!lista) return <p className="gg-gris" style={{ fontSize: 13, margin: 0 }}>{cargandoOpc ? "Cargando…" : "—"}</p>;
    if (lista.error)
      return (
        <>
          {valor && <p style={{ fontSize: 13, margin: "0 0 4px" }}>Elegida: {ajustes[n]?.[campo === "ficha" ? "fichaNombre" : campo === "propiedad" ? "propiedadNombre" : "sitio"] ?? valor}</p>}
          <p className="error" style={{ fontSize: 12, margin: 0 }}>{lista.error}</p>
        </>
      );
    return (
      <select className="rc-select" value={valor} onChange={(e) => cambiar(n, campo, e.target.value, lista.lista)}>
        <option value="">{vacio}</option>
        {(lista.lista ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
        {valor && !(lista.lista ?? []).some((o) => o.id === valor) && <option value={valor}>{valor}</option>}
      </select>
    );
  }

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Conexión con Google</h1>
        <p className="subtitle">Une la Suite con las fichas de Google, Search Console y Analytics. Solo hay que hacerlo una vez.</p>
      </header>

      {ok && <div className="gg-aviso gg-ok">Conectado con Google. Ahora elige qué ficha y qué propiedades corresponden a cada negocio.</div>}
      {err && <div className="gg-aviso gg-aviso-error">{ERRORES[err] ?? `Google devolvió un error: ${err}`}</div>}
      {estado?.error && <div className="gg-aviso gg-aviso-error">{estado.error}</div>}

      <div className="gg-panel">
        <h2>Estado</h2>
        <ul className="gg-pasos">
          <li>
            <span className={`gg-punto ${pasoCred ? "hecho" : ""}`}>{pasoCred ? "✓" : "1"}</span>
            <div>
              Claves de Google Cloud puestas en Vercel
              <small>{pasoCred ? "GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET encontradas." : "Falta añadir GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel y volver a desplegar."}</small>
            </div>
          </li>
          <li>
            <span className={`gg-punto ${pasoConex ? "hecho" : ""}`}>{pasoConex ? "✓" : "2"}</span>
            <div>
              Cuenta de Google conectada
              <small>
                {pasoConex
                  ? `${estado?.email ?? "Cuenta conectada"} · desde el ${new Date(estado!.conectadoEl!).toLocaleDateString("es-ES")}`
                  : "Usa la cuenta que gestiona las fichas y tiene acceso a Search Console y Analytics."}
              </small>
            </div>
          </li>
          <li>
            <span className={`gg-punto ${pasoAjustes ? "hecho" : ""}`}>{pasoAjustes ? "✓" : "3"}</span>
            <div>
              Ficha y propiedades de cada negocio
              <small>Se eligen abajo una vez conectada la cuenta.</small>
            </div>
          </li>
        </ul>
        <div className="gg-botones" style={{ marginTop: 14 }}>
          {pasoCred && !pasoConex && (
            <a className="gg-btn" href="/api/google/conectar">
              Conectar con Google
            </a>
          )}
          {pasoConex && !confirmarDesc && (
            <>
              <a className="gg-btn gg-sec" href="/api/google/conectar">
                Volver a conectar
              </a>
              <button className="gg-sec" onClick={() => setConfirmarDesc(true)}>
                Desconectar
              </button>
            </>
          )}
          {confirmarDesc && (
            <>
              <span className="gg-confirmar">¿Seguro? La Suite dejará de ver las reseñas y los datos.</span>
              <button onClick={desconectar}>Sí, desconectar</button>
              <button className="gg-sec" onClick={() => setConfirmarDesc(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {pasoConex && (
        <div className="gg-panel">
          <h2>Qué corresponde a cada negocio</h2>
          <div className="gg-ajustes">
            {(["tienda", "aquatherapia"] as Negocio[]).map((n) => (
              <div key={n}>
                <p style={{ fontFamily: "var(--titulos)", fontWeight: 600, margin: "0 0 4px" }}>{NOMBRE[n]}</p>
                <label>Ficha de Google (Perfil de Empresa)</label>
                <Desplegable n={n} campo="ficha" lista={opciones?.fichas} vacio="Sin ficha" />
                <label>Search Console</label>
                <Desplegable n={n} campo="sitio" lista={opciones?.sitios} vacio="Sin propiedad" />
                <label>Analytics (GA4)</label>
                <Desplegable n={n} campo="propiedad" lista={opciones?.propiedades} vacio="Sin propiedad" />
              </div>
            ))}
          </div>
          <div className="gg-botones" style={{ marginTop: 18 }}>
            <button onClick={guardar} disabled={guardado === "guardando"}>
              {guardado === "guardando" ? "Guardando…" : "Guardar"}
            </button>
            <button className="gg-sec" onClick={cargarOpciones} disabled={cargandoOpc}>
              {cargandoOpc ? "Cargando…" : "Actualizar listas"}
            </button>
            {guardado === "ok" && <span className="gg-sube" style={{ fontSize: 13, fontWeight: 600 }}>Guardado ✓</span>}
            {guardado === "error" && <span className="error">No se pudo guardar</span>}
          </div>
          <p className="gg-panel-nota">
            Si la lista de fichas da error, lo normal es que Google aún no haya aprobado el acceso a la API de Perfil de Empresa. Search Console y Analytics funcionan sin esperar.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ConexionGooglePage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
