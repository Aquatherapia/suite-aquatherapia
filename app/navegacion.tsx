"use client";

// Menú lateral de la app (estilo CRM). En móvil se convierte en una barra con un botón que abre el menú.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GRUPOS, ICONOS } from "./herramientas";

export default function Navegacion({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { setAbierto(false); }, [ruta]);

  // El login va sin menú
  if (ruta.startsWith("/login")) return <main className="crm-solo">{children}</main>;

  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  const actual = GRUPOS.flatMap(g => g.herramientas).find(h => activo(h.href));

  return (
    <div className={`crm${abierto ? " crm-abierto" : ""}`}>
      <aside className="crm-lateral">
        <div className="crm-marca">
          <Link href="/" aria-label="Inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-latienda.png" alt="La Tienda de Cosméticos" width={124} height={46} />
          </Link>
          <button className="crm-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar menú">{ICONOS.cerrar}</button>
        </div>
        <nav className="crm-menu">
          <Link href="/" className={`crm-item${activo("/") ? " on" : ""}`}>{ICONOS.inicio}<span>Inicio</span></Link>
          {GRUPOS.map(g => (
            <div key={g.titulo} className="crm-grupo">
              <div className="crm-grupo-titulo">{g.titulo}</div>
              {g.herramientas.map(h => (
                <Link key={h.href} href={h.href} className={`crm-item${activo(h.href) ? " on" : ""}`}>
                  {ICONOS[h.icono]}<span>{h.corto}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="crm-pie">La Tienda de Cosméticos · Aquatherapia</div>
      </aside>
      <div className="crm-fondo" onClick={() => setAbierto(false)} />
      <div className="crm-contenido">
        <header className="crm-cabecera">
          <button className="crm-hamburguesa" onClick={() => setAbierto(true)} aria-label="Abrir menú">{ICONOS.menu}</button>
          <div className="crm-migas">
            <Link href="/">Inicio</Link>
            {actual && <><span>/</span><b>{actual.corto}</b></>}
          </div>
          <Link href="/" className="crm-logo-movil" aria-label="Inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-latienda.png" alt="La Tienda de Cosméticos" width={80} height={30} />
          </Link>
        </header>
        <main className="crm-main">{children}</main>
      </div>
    </div>
  );
}
