// Las herramientas de la app: de aquí salen el menú lateral y el inicio.
// Para añadir un apartado, se añade aquí en su grupo.
import type { ReactNode } from "react";

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const ICONOS = {
  inicio: ic(<><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
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
  menu: ic(<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  cerrar: ic(<><path d="M6 6l12 12M18 6L6 18" /></>),
};

export type Herramienta = { href: string; icono: keyof typeof ICONOS; nombre: string; corto: string; desc: string };

export const GRUPOS: { titulo: string; herramientas: Herramienta[] }[] = [
  {
    titulo: "Nuestra web",
    herramientas: [
      { href: "/revisar-fichas", icono: "revisar", corto: "Revisar fichas", nombre: "Revisar fichas de nuestra web", desc: "Fichas con problemas: precio, EAN, descripción, meta y desactivadas que siguen en Google." },
      { href: "/ficha-producto", icono: "ficha", corto: "Fichas de producto", nombre: "Generador de fichas de producto", desc: "La IA redacta la ficha completa con el formato de la tienda: título, descripción, beneficios y SEO." },
      { href: "/ficha-pack", icono: "pack", corto: "Fichas de packs", nombre: "Generador de fichas de packs", desc: "Fichas de packs y sets, enlazando los productos que contienen." },
    ],
  },
  {
    titulo: "Precios y márgenes",
    herramientas: [
      { href: "/margen-productos", icono: "margen", corto: "Margen por producto", nombre: "Margen de cada producto", desc: "Margen de todo el catálogo por marca y producto: los que pierden dinero, margen bajo y sin coste." },
      { href: "/comparar-competidores", icono: "balanza", corto: "Precios competencia", nombre: "Comparar precios con la competencia", desc: "Nuestros precios frente a seis tiendas, marca a marca y en una sola tabla." },
      { href: "/comparar-precios", icono: "comparar", corto: "Cosméticos24h", nombre: "Comparar mis precios con Cosméticos24h", desc: "Dónde vamos más caros y qué productos tienen ellos que nosotros no." },
    ],
  },
  {
    titulo: "Competencia",
    herramientas: [
      { href: "/vigilar-competidores", icono: "vigilar", corto: "Vigilar competidores", nombre: "Vigilar competidores", desc: "Los descuentos de cualquier marca en las tiendas de la competencia, con un clic." },
      { href: "/vigilar-novedades", icono: "novedades", corto: "Novedades de marcas", nombre: "Vigilar novedades de marcas", desc: "Avisa cuando una marca sube productos nuevos a su web." },
    ],
  },
  {
    titulo: "Clientes y marketing",
    herramientas: [
      { href: "/reclamaciones", icono: "reclamaciones", corto: "Reclamaciones", nombre: "Reclamaciones de clientes", desc: "Respuesta lista para WhatsApp o email a envíos extraviados, roturas o productos dañados." },
      { href: "/responder-resenas", icono: "resenas", corto: "Reseñas de Google", nombre: "Responder reseñas de Google", desc: "Respuesta profesional a cada reseña, para La Tienda o Aquatherapia." },
      { href: "/google-business", icono: "google", corto: "Posts de Google", nombre: "Post para Google Business", desc: "Texto listo para publicar como novedad en el Perfil de Empresa." },
      { href: "/informes", icono: "informe", corto: "Informe mensual", nombre: "Informe de marketing mensual", desc: "El informe del mes con canales, ventas, ROAS, embudo y comparativa interanual." },
    ],
  },
];

