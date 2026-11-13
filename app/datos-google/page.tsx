"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvisoConexion, Cambio, fechaCorta, Formato, formatear, Grafica, Negocio, NOMBRE, Segmentos, SelectorNegocio, useEstadoGoogle } from "../_google/ui";

type Fuente = "ficha" | "search-console" | "analytics";
type Kpi = { nombre: string; actual: number | null; anterior: number | null; formato: Formato; mejorSiBaja?: boolean; nota?: string };
type Tabla = { titulo: string; columnas: { nombre: string; formato?: Formato }[]; filas: (string | number | null)[][]; nota?: string };
type Datos = {
  periodo: { actual: { inicio: string; fin: string }; anterior: { inicio: string; fin: string } };
  kpis: Kpi[];
  serie?: { nombre: string; formato: Formato; puntos: { fecha: string; valor: number }[] };
  tablas: Tabla[];
  avisos: string[];
};

const NECESITA = { ficha: "ficha", "search-console": "sitio", analytics: "propiedad" } as const;

function leerGuardado<T extends string>(clave: string, validos: T[], defecto: T): T {
  try {
    const v = localStorage.getItem(clave) as T | null;
    return v && validos.includes(v) ? v : defecto;
  } catch {
    return defecto;
  }
}

export default function DatosGooglePage() {
  const { estado } = useEstadoGoogle();
  const [negocio, setNegocio] = useState<Negocio>("tienda");
  const [fuente, setFuente] = useState<Fuente>("search-console");
  const [dias, setDias] = useState<"7" | "28" | "90">("28");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNegocio(leerGuardado<Negocio>("gg-negocio", ["tienda", "aquatherapia"], "tienda"));
    setFuente(leerGuardado<Fuente>("gg-fuente", ["ficha", "search-console", "analytics"], "search-console"));
  }, []);

  const listo = estado?.conectado && estado.ajustes[negocio]?.[NECESITA[fuente]];

  useEffect(() => {
    try {
      localStorage.setItem("gg-negocio", negocio);
      localStorage.setItem("gg-fuente", fuente);
    } catch {}
    if (!listo) {
      setDatos(null);
      return;
    }
    let vivo = true;
    setCargando(true);
    setError("");
    fetch(`/api/google/datos?negocio=${negocio}&fuente=${fuente}&dias=${dias}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error al cargar los datos");
        if (vivo) setDatos(d);
      })
      .catch((e) => vivo && (setError(e.message), setDatos(null)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [negocio, fuente, dias, listo]);

  return (
    <div className="wrap">
      <Link href="/" className="volver-link">
        ← Volver
      </Link>
      <header>
        <h1>Datos de Google</h1>
        <p className="subtitle">Cómo os ven en Google: la ficha, las búsquedas (Search Console) y las visitas a la web (Analytics).</p>
      </header>

      <div className="gg-barra">
        <div className="gg-barra-izq">
          <SelectorNegocio valor={negocio} onChange={setNegocio} />
          <Segmentos<Fuente>
            opciones={[
              { valor: "ficha", nombre: "Ficha de Google" },
              { valor: "search-console", nombre: "Search Console" },
              { valor: "analytics", nombre: "Analytics" },
            ]}
            valor={fuente}
            onChange={setFuente}
          />
        </div>
        <Segmentos<"7" | "28" | "90">
          opciones={[
            { valor: "7", nombre: "7 días" },
            { valor: "28", nombre: "28 días" },
            { valor: "90", nombre: "90 días" },
          ]}
          valor={dias}
          onChange={setDias}
        />
      </div>

      <AvisoConexion estado={estado} necesita={NECESITA[fuente]} negocio={negocio} />
      {error && <div className="gg-aviso gg-aviso-error">{error}</div>}

      {cargando && !datos && (
        <p className="gg-gris" style={{ fontSize: 14 }}>
          <span className="spinner spinner-dark" /> Cargando datos de {NOMBRE[negocio]}…
        </p>
      )}

      {datos && (
        <div style={{ opacity: cargando ? 0.5 : 1, transition: "opacity .15s" }}>
          <p className="gg-periodo" style={{ margin: "0 0 10px" }}>
            Del {fechaCorta(datos.periodo.actual.inicio)} al {fechaCorta(datos.periodo.actual.fin)}, comparado con los {dias} días anteriores
            ({fechaCorta(datos.periodo.anterior.inicio)} – {fechaCorta(datos.periodo.anterior.fin)}).
          </p>

          <div className="gg-kpis">
            {datos.kpis.map((k) => (
              <div className="gg-kpi" key={k.nombre}>
                <div className="gg-kpi-nombre">
                  {k.nombre}
                  {k.nota && (
                    <span className="gg-info" title={k.nota}>
                      ⓘ
                    </span>
                  )}
                </div>
                <div className="gg-kpi-valor">{formatear(k.actual, k.formato)}</div>
                <Cambio actual={k.actual} anterior={k.anterior} formato={k.formato} mejorSiBaja={k.mejorSiBaja} />
              </div>
            ))}
          </div>

          {datos.serie && (
            <div className="gg-panel">
              <h2>{datos.serie.nombre}</h2>
              <div style={{ paddingTop: 24 }}>
                <Grafica puntos={datos.serie.puntos} formato={datos.serie.formato} />
              </div>
            </div>
          )}

          {datos.tablas.map((t) => (
            <div className="gg-panel" key={t.titulo}>
              <h2>{t.titulo}</h2>
              {t.filas.length === 0 ? (
                <p className="gg-gris" style={{ fontSize: 13, margin: 0 }}>
                  Sin datos en este periodo.
                </p>
              ) : (
                <div className="gg-tabla-wrap">
                  <table className="gg-tabla">
                    <thead>
                      <tr>
                        {t.columnas.map((c, i) => (
                          <th key={c.nombre} className={i ? "n" : ""}>
                            {c.nombre}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.filas.map((f, i) => (
                        <tr key={i}>
                          {f.map((v, j) => (
                            <td key={j} className={j ? `n${v === null ? " gg-gris" : ""}` : ""}>
                              {formatear(v, t.columnas[j]?.formato)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {t.nota && <p className="gg-panel-nota">{t.nota}</p>}
            </div>
          ))}

          {datos.avisos.map((a) => (
            <p key={a} className="gg-panel-nota">
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
