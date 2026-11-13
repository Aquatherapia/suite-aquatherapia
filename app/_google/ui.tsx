"use client";

import { useEffect, useRef, useState } from "react";
import "./estilos.css";

export type Negocio = "tienda" | "aquatherapia";
export const NOMBRE: Record<Negocio, string> = { tienda: "La Tienda de Cosméticos", aquatherapia: "Aquatherapia" };

export type EstadoGoogle = {
  credenciales: boolean;
  conectado: boolean;
  email?: string;
  conectadoEl?: string;
  ajustes: Partial<Record<Negocio, { ficha?: string; fichaNombre?: string; sitio?: string; propiedad?: string; propiedadNombre?: string }>>;
  error?: string;
};

export function useEstadoGoogle() {
  const [estado, setEstado] = useState<EstadoGoogle | null>(null);
  const recargar = () =>
    fetch("/api/google/estado")
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setEstado({ credenciales: false, conectado: false, ajustes: {}, error: "No se pudo comprobar la conexión" }));
  useEffect(() => {
    recargar();
  }, []);
  return { estado, recargar };
}

export function Segmentos<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; nombre: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="gg-seg" role="tablist">
      {opciones.map((o) => (
        <button key={o.valor} role="tab" aria-selected={valor === o.valor} className={valor === o.valor ? "on" : ""} onClick={() => onChange(o.valor)}>
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

export function SelectorNegocio({ valor, onChange }: { valor: Negocio; onChange: (n: Negocio) => void }) {
  return (
    <Segmentos
      opciones={[
        { valor: "tienda", nombre: "La Tienda de Cosméticos" },
        { valor: "aquatherapia", nombre: "Aquatherapia" },
      ]}
      valor={valor}
      onChange={onChange}
    />
  );
}

// ── Formatos ──
export type Formato = "num" | "pct" | "eur" | "pos" | "dec";
// useGrouping "always": en es-ES, por defecto 9331 sale sin punto de miles
const nf = new Intl.NumberFormat("es-ES", { useGrouping: "always" } as Intl.NumberFormatOptions);
export function formatear(v: number | string | null | undefined, f?: Formato) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  switch (f) {
    case "pct":
      return `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
    case "eur":
      return v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: v >= 1000 ? 0 : 2, useGrouping: "always" } as Intl.NumberFormatOptions);
    case "pos":
    case "dec":
      return v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
    default:
      return nf.format(Math.round(v));
  }
}
export function fechaCorta(iso: string) {
  return new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** Cambio respecto al periodo anterior, en verde si mejora y en naranja si empeora. */
export function Cambio({ actual, anterior, formato, mejorSiBaja }: { actual: number | null; anterior: number | null; formato: Formato; mejorSiBaja?: boolean }) {
  if (actual === null || anterior === null) return <span className="gg-kpi-cambio">sin comparación</span>;
  let texto: string;
  let dif: number;
  if (formato === "pct" || formato === "pos") {
    dif = actual - anterior;
    texto = formato === "pct" ? `${dif >= 0 ? "+" : ""}${(dif * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} pts` : `${dif >= 0 ? "+" : ""}${dif.toLocaleString("es-ES", { maximumFractionDigits: 1 })}`;
  } else {
    if (anterior === 0) return <span className="gg-kpi-cambio">{actual === 0 ? "igual" : "nuevo"}</span>;
    dif = (actual - anterior) / anterior;
    texto = `${dif >= 0 ? "+" : ""}${(dif * 100).toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`;
  }
  if (Math.abs(dif) < 1e-9) return <span className="gg-kpi-cambio">igual</span>;
  const mejora = mejorSiBaja ? dif < 0 : dif > 0;
  return (
    <span className={`gg-kpi-cambio ${mejora ? "gg-sube" : "gg-baja"}`}>
      {dif > 0 ? "▲" : "▼"} {texto} <span className="gg-gris" style={{ fontWeight: 400 }}>vs. periodo anterior</span>
    </span>
  );
}

/** Línea de una sola serie, con tooltip al pasar el dedo o el ratón. */
export function Grafica({ puntos, formato }: { puntos: { fecha: string; valor: number }[]; formato: Formato }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (puntos.length < 2) return <p className="gg-gris" style={{ fontSize: 13 }}>Sin datos suficientes para la gráfica.</p>;

  const W = 1000;
  const H = 180;
  const pad = { t: 10, r: 8, b: 22, l: 8 };
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const x = (i: number) => pad.l + (i / (puntos.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join("");
  const area = `${linea}L${x(puntos.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`;
  const marcas = [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1];

  function mover(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const rel = (clientX - r.left) / r.width;
    const i = Math.round(((rel * W - pad.l) / (W - pad.l - pad.r)) * (puntos.length - 1));
    setHover(Math.max(0, Math.min(puntos.length - 1, i)));
  }

  return (
    <div
      className="gg-grafica"
      ref={ref}
      onMouseMove={(e) => mover(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchMove={(e) => mover(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Evolución diaria">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill="var(--azul)" opacity={0.08} />
        <path d={linea} fill="none" stroke="var(--azul)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div style={{ position: "relative", height: 0 }}>
        {marcas.map((i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: -18,
              left: `${(x(i) / W) * 100}%`,
              transform: i === 0 ? "none" : i === puntos.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 11,
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            {new Date(puntos[i].fecha + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        ))}
      </div>
      {hover !== null && (
        <>
          <span
            style={{
              position: "absolute",
              left: `${(x(hover) / W) * 100}%`,
              top: `${(y(puntos[hover].valor) / H) * 180 - 5}px`,
              width: 10,
              height: 10,
              marginLeft: -5,
              borderRadius: "50%",
              background: "var(--azul)",
              border: "2px solid var(--card)",
              pointerEvents: "none",
            }}
          />
          <div className="gg-tip" style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%`, top: -30 }}>
            {fechaCorta(puntos[hover].fecha)} · <b>{formatear(puntos[hover].valor, formato)}</b>
          </div>
        </>
      )}
    </div>
  );
}

/** Aviso cuando la Suite aún no está conectada o falta elegir algo. */
export function AvisoConexion({ estado, necesita, negocio }: { estado: EstadoGoogle | null; necesita?: "ficha" | "sitio" | "propiedad"; negocio?: Negocio }) {
  if (!estado) return null;
  if (!estado.credenciales || !estado.conectado)
    return (
      <div className="gg-aviso">
        La Suite todavía no está conectada con Google. <a href="/conexion-google">Conéctala aquí</a> (solo hay que hacerlo una vez).
      </div>
    );
  if (necesita && negocio && !estado.ajustes[negocio]?.[necesita]) {
    const que = necesita === "ficha" ? "la ficha de Google" : necesita === "sitio" ? "la propiedad de Search Console" : "la propiedad de Analytics";
    return (
      <div className="gg-aviso">
        Falta elegir {que} de {NOMBRE[negocio]}. <a href="/conexion-google">Elígela en Conexión con Google</a>.
      </div>
    );
  }
  return null;
}
