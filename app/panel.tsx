"use client";

// Cifras clave del inicio, con lo que ya han guardado «Margen de cada producto» y «Revisar fichas».
import Link from "next/link";
import { useEffect, useState } from "react";
import { calcular, resumir, type Datos } from "./margen-productos/tipos";
import type { Problema, Pasada } from "./revisar-fichas/tipos";

type Cifra = { titulo: string; valor: string; detalle: string; href: string; tono?: "rojo" | "ambar" | "verde" };

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const miles = (n: number) => n.toLocaleString("es-ES");
const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Panel() {
  const [margen, setMargen] = useState<Datos | null | undefined>(undefined);
  const [fichas, setFichas] = useState<{ problemas: Problema[]; pasada: Pasada | null } | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/margen-productos", { cache: "no-store" }).then(r => r.json()).then(v => setMargen(v.datos ?? null)).catch(() => setMargen(null));
    fetch("/api/revisar-fichas", { cache: "no-store" }).then(r => r.json()).then(v => setFichas(v)).catch(() => setFichas(null));
  }, []);

  const cifras: Cifra[] = [];
  if (margen) {
    const ps = margen.filas.map(calcular);
    const t = resumir("Total", ps);
    cifras.push(
      { titulo: "Margen medio", valor: pct(t.margenPct), detalle: `${pct(t.margenPvpPct)} sin ofertas · ${miles(ps.length)} productos`, href: "/margen-productos", tono: t.margenPct !== null && t.margenPct < 0.3 ? "ambar" : "verde" },
      { titulo: "Pierden dinero", valor: miles(t.pierde), detalle: `y ${miles(t.bajo)} con margen bajo (< 30 %)`, href: "/margen-productos", tono: t.pierde ? "rojo" : "verde" },
      { titulo: "Sin coste cargado", valor: miles(t.sinCoste), detalle: "no se puede calcular su margen", href: "/margen-productos", tono: t.sinCoste ? "ambar" : "verde" },
    );
  }
  if (fichas && fichas.problemas && !fichas.pasada) {
    cifras.push({ titulo: "Fichas con problemas", valor: "—", detalle: "sin revisar todavía: pulsa «Revisar ahora»", href: "/revisar-fichas" });
  } else if (fichas && fichas.problemas) {
    const n = (tipo: string) => fichas.problemas.filter(p => p.tipo === tipo).length;
    const urls = new Set(fichas.problemas.map(p => p.url)).size;
    cifras.push(
      { titulo: "Fichas con problemas", valor: miles(urls), detalle: fichas.pasada?.fin ? `revisadas el ${fecha(fichas.pasada.fin)}` : "revisión en curso o sin hacer", href: "/revisar-fichas", tono: urls ? "ambar" : "verde" },
      { titulo: "Desactivadas en Google", valor: miles(n("desactivada-en-google")), detalle: "siguen en el sitemap", href: "/revisar-fichas#desactivada-en-google", tono: n("desactivada-en-google") ? "rojo" : "verde" },
    );
  }

  const cargando = margen === undefined || fichas === undefined;
  return (
    <section className="panel">
      {cargando && !cifras.length && Array.from({ length: 5 }).map((_, i) => <div key={i} className="panel-cifra panel-vacia" />)}
      {cifras.map(c => (
        <Link key={c.titulo} href={c.href} className="panel-cifra">
          <span className="panel-titulo">{c.titulo}</span>
          <span className={`panel-valor${c.tono ? ` t-${c.tono}` : ""}`}>{c.valor}</span>
          <span className="panel-detalle">{c.detalle}</span>
        </Link>
      ))}
      {!cargando && !cifras.length && (
        <p className="panel-nada">Todavía no hay datos: abre «Margen de cada producto» o pulsa «Revisar ahora» en «Revisar fichas» y aquí saldrán las cifras.</p>
      )}
    </section>
  );
}
