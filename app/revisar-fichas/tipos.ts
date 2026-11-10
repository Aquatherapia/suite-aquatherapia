// Tipos y textos del revisor de fichas, compartidos por la página y el servidor.

export type Tipo =
  | "precio-cero" | "oferta-mayor-pvp" | "bajo-coste"
  | "sin-ean" | "ean-repetido"
  | "sin-descripcion" | "sin-imagen" | "sin-meta" | "sin-titulo"
  | "desactivada-en-google" | "fuera-sitemap" | "fuera-feed" | "no-abre";

export type Problema = { tipo: Tipo; url: string; nombre: string; marca?: string; detalle?: string };

// Como la ve la página: «nuevo» si apareció en la última revisión completa
export type ProblemaVista = Problema & { nuevo?: boolean };

export type Pasada = {
  id: string;
  origen: "cron" | "manual";
  inicio: string;
  actualizado: string;
  fin?: string;
  total: number;   // fichas que hay que abrir en esta pasada
  hechas: number;  // fichas ya abiertas
  sinComprobar?: number; // fichas que no respondieron: se deja lo que salió la vez anterior
  error?: string;
};

export type Estado = {
  feed?: { fecha: string; fichas: number; filas: number; problemas: Problema[] };
  // Problemas que salen al abrir cada ficha (meta, título, desactivada, no abre), por dirección.
  // Solo se guardan las fichas con algún problema.
  html: Record<string, Problema[]>;
  pasada?: Pasada;
  // Cuándo se vio cada problema por primera vez (para marcar los nuevos)
  vistos: Record<string, string>;
  // Pasadas completas hechas, y desde cuándo un problema cuenta como «nuevo» (inicio de la última pasada completa,
  // a partir de la segunda: en la primera todo sería nuevo)
  completas?: number;
  nuevosDesde?: string;
};

export const claveProblema = (p: Problema) => `${p.tipo}|${p.url}|${p.nombre}`;

// Grupos y textos tal y como se ven en la página y en el Excel
export const GRUPOS: { nombre: string; tipos: { tipo: Tipo; titulo: string; ayuda: string; hacer: string }[] }[] = [
  {
    nombre: "Precio",
    tipos: [
      { tipo: "precio-cero", titulo: "Precio a 0 €", ayuda: "Ficha activa que se vende a 0 €.", hacer: "Ponerle precio. Si ya no se vende, desactivar la ficha." },
      { tipo: "oferta-mayor-pvp", titulo: "PVP por debajo del precio", ayuda: "El precio de oferta es más alto que el PVP: la ficha enseña un «descuento» al revés.", hacer: "Corregir en el CMS el PVP o el precio de oferta, el que esté mal." },
      { tipo: "bajo-coste", titulo: "Se vende por debajo del coste", ayuda: "El precio final sin IVA (el precio de la web entre 1,21) es igual o más bajo que el precio de coste del feed, que va sin IVA. Al lado sale cuánto se pierde por unidad.", hacer: "Comprobar primero que el coste está bien cargado. Si lo está, subir el precio o quitar la oferta." },
    ],
  },
  {
    nombre: "EAN",
    tipos: [
      { tipo: "sin-ean", titulo: "Sin EAN o EAN no válido", ayuda: "Sin EAN, o con un código que no es un EAN (cifras que no cuadran). Google Shopping y los comparadores lo necesitan. Los packs no se cuentan.", hacer: "Poner el EAN de la caja o de la tarifa de la marca." },
      { tipo: "ean-repetido", titulo: "EAN repetido en fichas distintas", ayuda: "El mismo EAN está en dos fichas diferentes: una de las dos está mal.", hacer: "Ver cuál de las dos fichas tiene el EAN bueno y corregir la otra. Si es el mismo producto duplicado, desactivar una." },
    ],
  },
  {
    nombre: "Contenido",
    tipos: [
      { tipo: "sin-descripcion", titulo: "Sin descripción", ayuda: "La descripción del producto está vacía o tiene menos de 80 letras.", hacer: "Escribir la descripción (el «Generador de fichas de producto» la redacta)." },
      { tipo: "sin-imagen", titulo: "Sin imagen", ayuda: "La ficha no tiene foto en el feed.", hacer: "Subir la foto del producto a la ficha." },
      { tipo: "sin-meta", titulo: "Sin meta description", ayuda: "La ficha no tiene el texto que Google enseña debajo del título.", hacer: "Escribir la meta description (el «Generador de fichas de producto» la redacta)." },
      { tipo: "sin-titulo", titulo: "Sin title", ayuda: "La ficha no tiene el título que Google enseña en los resultados.", hacer: "Escribir el title de la ficha." },
    ],
  },
  {
    nombre: "Google",
    tipos: [
      { tipo: "desactivada-en-google", titulo: "Desactivadas que siguen en Google", ayuda: "La ficha dice «Ups, este producto ha sido descatalogado», pero sigue en el sitemap y Google puede enseñarla.", hacer: "Si está descatalogado para siempre: sacarla del sitemap y redirigirla (301) a un producto parecido o a la marca. Si va a volver: dejarla con «noindex». Lo hace quien lleva la web." },
      { tipo: "fuera-sitemap", titulo: "Activas que no están en el sitemap", ayuda: "Se venden, pero no están en el sitemap: a Google le cuesta más encontrarlas.", hacer: "Que el sitemap la incluya (normalmente, regenerar el sitemap)." },
      { tipo: "fuera-feed", titulo: "Activas que no están en el feed", ayuda: "Se ven a la venta en la web, pero no salen en el feed: Google Shopping y Boardfy no las tienen.", hacer: "Ver por qué no sale en el feed (marca excluida, sin stock, mal configurada) y activarla." },
      { tipo: "no-abre", titulo: "No abren o redirigen", ayuda: "Están en el sitemap, pero dan error o llevan a otra dirección.", hacer: "Sacarla del sitemap o arreglar la dirección." },
    ],
  },
];

export const HACER: Record<Tipo, string> = Object.fromEntries(GRUPOS.flatMap(g => g.tipos.map(t => [t.tipo, t.hacer]))) as Record<Tipo, string>;

export const TITULO: Record<Tipo, string> = Object.fromEntries(GRUPOS.flatMap(g => g.tipos.map(t => [t.tipo, t.titulo]))) as Record<Tipo, string>;
