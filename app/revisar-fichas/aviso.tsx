// Línea con cómo fue la revisión automática de la mañana. Sale en la portada (con enlace) y en «Revisar fichas».
import Link from "next/link";
import type { Aviso } from "./tipos";

const ICONO: Record<Aviso["tono"], string> = { verde: "✓", ambar: "!", rojo: "!", gris: "…" };

export default function AvisoRevision({ aviso, enlace }: { aviso: Aviso; enlace?: boolean }) {
  const contenido = (
    <>
      <span className={`aviso-rev-icono a-${aviso.tono}`} aria-hidden="true">{ICONO[aviso.tono]}</span>
      <span className="aviso-rev-texto">
        <b>{aviso.titulo}</b>
        {aviso.detalle && <span>{aviso.detalle}</span>}
      </span>
      {enlace && <span className="inicio-flecha" aria-hidden="true">›</span>}
    </>
  );
  const clase = `aviso-rev aviso-rev-${aviso.tono}`;
  return enlace
    ? <Link href="/revisar-fichas" className={clase} role={aviso.tono === "rojo" ? "alert" : undefined}>{contenido}</Link>
    : <div className={clase} role={aviso.tono === "rojo" ? "alert" : undefined}>{contenido}</div>;
}
