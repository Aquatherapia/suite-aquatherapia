import Link from "next/link";
import { GRUPOS, ICONOS } from "./herramientas";
import Panel from "./panel";

export const dynamic = "force-dynamic";

export default function Home() {
  const ahora = new Date();
  const hoy = ahora.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });
  const hora = Number(ahora.toLocaleString("es-ES", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }));
  const saludo = hora < 14 ? "Buenos días" : hora < 21 ? "Buenas tardes" : "Buenas noches";
  return (
    <div className="wrap inicio">
      <header className="inicio-cab">
        <p className="inicio-fecha">{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</p>
        <h1>{saludo}</h1>
        <p>Así está hoy la tienda, y todas las herramientas a mano.</p>
      </header>

      <Panel />

      {GRUPOS.map(g => (
        <section key={g.titulo} className="inicio-grupo">
          <h2>{g.titulo}</h2>
          <div className="inicio-lista">
            {g.herramientas.map(h => (
              <Link key={h.href} href={h.href} className="inicio-fila">
                <span className="inicio-icono">{ICONOS[h.icono]}</span>
                <span className="inicio-texto">
                  <b>{h.nombre}</b>
                  <span>{h.desc}</span>
                </span>
                <span className="inicio-flecha" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
