import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// Iconos de línea (24×24, trazo), en el color de la marca
const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONOS = {
  revisar: ic(<><path d="M9 11l2 2 4-4" /><rect x="4" y="3" width="16" height="18" rx="2" /></>),
  ficha: ic(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  pack: ic(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>),
  comparar: ic(<><path d="M7 7h13l-3-3M17 17H4l3 3" /></>),
  balanza: ic(<><path d="M12 3v18M5 21h14M6 7h12" /><path d="M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" /></>),
  margen: ic(<><path d="M4 19h16" /><path d="M7 16V10M12 16V6M17 16v-4" /></>),
  google: ic(<><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>),
  vigilar: ic(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  informe: ic(<><path d="M4 4v16h16" /><path d="M8 15l3-4 3 2 5-6" /></>),
  resenas: ic(<><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></>),
  novedades: ic(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></>),
  reclamaciones: ic(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
};

type Herramienta = { href: string; icono: keyof typeof ICONOS; nombre: string; desc: string };

const GRUPOS: { titulo: string; herramientas: Herramienta[] }[] = [
  {
    titulo: "Nuestra web",
    herramientas: [
      { href: "/revisar-fichas", icono: "revisar", nombre: "Revisar fichas de nuestra web", desc: "Cada mañana revisa todas las fichas y saca las que tienen algún problema: precio a 0 o por debajo del coste, sin EAN, sin descripción o meta, y desactivadas que siguen en Google." },
      { href: "/ficha-producto", icono: "ficha", nombre: "Generador de fichas de producto", desc: "Rellena los datos del producto y la IA redacta la ficha completa con el formato exacto de la tienda: título, descripción, beneficios, SEO y más." },
      { href: "/ficha-pack", icono: "pack", nombre: "Generador de fichas de packs", desc: "Igual que las fichas, pero para packs y sets: indica los productos que contiene con su enlace y la IA monta la ficha enlazándolos en la descripción y el modo de uso." },
    ],
  },
  {
    titulo: "Precios y márgenes",
    herramientas: [
      { href: "/margen-productos", icono: "margen", nombre: "Margen de cada producto", desc: "El margen de todos los productos de la web, sacado del feed: por marca y por producto, con los que pierden dinero, los de margen bajo y los que no tienen coste. Con filtros y Excel." },
      { href: "/comparar-competidores", icono: "balanza", nombre: "Comparar precios con la competencia", desc: "Nuestros precios frente a Cosméticos24h, Anadeana, Cosmética VIP24, Estética Rosi, Mar Chancosa y Pilar Delgado, marca a marca y en una sola tabla." },
      { href: "/comparar-precios", icono: "comparar", nombre: "Comparar mis precios con Cosméticos24h", desc: "Cruza tus precios con los de Cosméticos24h marca a marca: te marca dónde vas más caro y qué productos tienen ellos que tú aún no." },
    ],
  },
  {
    titulo: "Competencia y marcas",
    herramientas: [
      { href: "/vigilar-competidores", icono: "vigilar", nombre: "Vigilar competidores", desc: "Añade la URL de cualquier marca en tiendas de la competencia (PrestaShop, WooCommerce o Shopify) y comprueba sus descuentos con un clic." },
      { href: "/vigilar-novedades", icono: "novedades", nombre: "Vigilar novedades de marcas", desc: "Añade una marca con la URL de su tienda y detecta cuándo sube productos nuevos a su web, para ser de los primeros en venderlos." },
    ],
  },
  {
    titulo: "Clientes y marketing",
    herramientas: [
      { href: "/reclamaciones", icono: "reclamaciones", nombre: "Reclamaciones de clientes", desc: "Indica cliente, pedido y el motivo (envío extraviado, rotura de stock, producto roto...) y la IA redacta la respuesta lista para WhatsApp o email con tu tono habitual." },
      { href: "/responder-resenas", icono: "resenas", nombre: "Responder reseñas de Google", desc: "Pega la reseña de un cliente, elige el negocio (La Tienda o Aquatherapia) y la IA redacta una respuesta profesional lista para publicar en tu Perfil de Empresa." },
      { href: "/google-business", icono: "google", nombre: "Post para Google Business", desc: "Indica el tema y la marca o servicio y la IA redacta el texto listo para publicar como actualización en tu ficha de Google Business Profile." },
      { href: "/informes", icono: "informe", nombre: "Informe de marketing mensual", desc: "Pega los datos de cada canal (Analytics, Google Ads, tu tienda…) y la IA te monta el informe mensual completo: canales, ventas, ROAS, embudo, comparativa interanual y conclusiones." },
    ],
  },
];

export default function Home() {
  return (
    <div className="wrap home">
      <header className="home-header">
        <p className="home-kicker">La Tienda de Cosméticos · Aquatherapia</p>
        <h1>¿Qué hacemos hoy?</h1>
        <p>Todo lo que usamos a diario para la web, los precios, la competencia y los clientes.</p>
      </header>

      {GRUPOS.map(g => (
        <section key={g.titulo} className="home-grupo">
          <h2 className="home-grupo-titulo">{g.titulo}</h2>
          <div className="agentes-grid">
            {g.herramientas.map(h => (
              <Link key={h.href} href={h.href} className="agente-card">
                <span className="agente-icono">{ICONOS[h.icono]}</span>
                <div className="agente-info">
                  <div className="agente-nombre">{h.nombre}</div>
                  <div className="agente-desc">{h.desc}</div>
                </div>
                <span className="agente-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
