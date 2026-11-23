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
  fallo?: string; // un paso falló a medias (la pasada se puede retomar)
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
  // Copia de la última pasada que lanzó Vercel Cron, para saber si la de la mañana fue bien
  // aunque luego se haya hecho otra a mano
  ultimaCron?: Pasada;
};

export const claveProblema = (p: Problema) => `${p.tipo}|${p.url}|${p.nombre}`;

// Grupos y textos tal y como se ven en la página y en el Excel
export const GRUPOS: { nombre: string; tipos: { tipo: Tipo; titulo: string; ayuda: string; hacer: string }[] }[] = [
  {
    nombre: "Precio",
    tipos: [
      { tipo: "precio-cero", titulo: "Precio a 0 €", ayuda: "Ficha activa que se vende a 0 €.", hacer: "Ponerle precio. Si ya no se vende, desactivar la ficha." },
      { tipo: "oferta-mayor-pvp", titulo: "PVP por debajo del precio", ayuda: "El precio de oferta es más alto que el PVP: la ficha enseña un «descuento» al revés.", hacer: "Corregir en el CMS el PVP o el precio de oferta, el que esté mal." },
      { tipo: "bajo-coste", titulo: "Se vende por debajo del coste", ayuda: "El precio final sin IVA (el precio de la web entre 1,21) es igual o más bajo que el coste. El coste es el del feed: el «Precio de coste» del programa menos el «Descuento sobre el precio de coste» (el descuento de la marca), sin IVA. Por ejemplo, 43,00 € con un 8,44 % de descuento da 39,37 €. Al lado sale cuánto se pierde por unidad.", hacer: "Comprobar en el programa el «Precio de coste» y el «Descuento sobre el precio de coste» de la ficha con una factura de la marca (a veces el coste está en el campo del descuento o es el de otra unidad). Si están bien, subir el precio o quitar la oferta." },
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
      { tipo: "desactivada-en-google", titulo: "Desactivadas que siguen en Google", ayuda: "La ficha dice «Ups, este producto ha sido descatalogado», pero sigue en el sitemap: le estamos pidiendo a Google que la enseñe. La ficha se deja publicada (con el aviso y el botón para ver los de la marca), así no se pierden los enlaces que ya tiene.", hacer: "Sacarla del sitemap, siempre. La ficha no se borra ni se redirige. Lo hace quien lleva la web." },
      { tipo: "fuera-sitemap", titulo: "Activas que no están en el sitemap", ayuda: "Se venden, pero no están en el sitemap: a Google le cuesta más encontrarlas.", hacer: "Que el sitemap la incluya (normalmente, regenerar el sitemap)." },
      { tipo: "fuera-feed", titulo: "Activas que no están en el feed", ayuda: "Se ven a la venta en la web, pero no salen en el feed: Google Shopping y Boardfy no las tienen.", hacer: "Ver por qué no sale en el feed (marca excluida, sin stock, mal configurada) y activarla." },
      { tipo: "no-abre", titulo: "No abren o redirigen", ayuda: "Están en el sitemap, pero dan error o llevan a otra dirección.", hacer: "Sacarla del sitemap o arreglar la dirección." },
    ],
  },
];

export const HACER: Record<Tipo, string> = Object.fromEntries(GRUPOS.flatMap(g => g.tipos.map(t => [t.tipo, t.hacer]))) as Record<Tipo, string>;

export const TITULO: Record<Tipo, string> = Object.fromEntries(GRUPOS.flatMap(g => g.tipos.map(t => [t.tipo, t.titulo]))) as Record<Tipo, string>;

// ── Aviso de la revisión de la mañana ──────────────────────────────────
// Vercel Cron la lanza a las 05:00 UTC (vercel.json): las 6:00 en invierno y las 7:00 en verano en España.
// Si no arranca, falla o se corta, nadie se entera hasta abrir la página: este aviso sale en la portada
// y en «Revisar fichas».
export const HORA_CRON_UTC = 5;
// Margen para dar por hecho que la revisión de hoy ya debería haber empezado
const MARGEN_ARRANQUE_MS = 20 * 60_000;
// Por encima de esta parte de fichas sin respuesta, la revisión cuenta como incompleta
const SIN_RESPUESTA_MAX = 0.05;

export type Aviso = { tono: "verde" | "ambar" | "rojo" | "gris"; titulo: string; detalle?: string };

const ZONA = "Europe/Madrid";
const diaMadrid = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: ZONA });
const horaMadrid = (d: Date) => d.toLocaleTimeString("es-ES", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });

// «hoy 6:00», «ayer 6:00» o «21/11 6:00»
export function cuando(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const ayer = new Date(ahora.getTime() - 86_400_000);
  const dia = diaMadrid(d) === diaMadrid(ahora) ? "hoy"
    : diaMadrid(d) === diaMadrid(ayer) ? "ayer"
    : d.toLocaleDateString("es-ES", { timeZone: ZONA, day: "numeric", month: "numeric" });
  return `${dia} ${horaMadrid(d)}`;
}

// Cuándo tendría que haber empezado la última revisión de la mañana
export function cronEsperado(ahora = new Date()): Date {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), HORA_CRON_UTC));
  if (ahora.getTime() < d.getTime() + MARGEN_ARRANQUE_MS) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const miles = (n: number) => n.toLocaleString("es-ES");

export function avisoRevision(e: Pick<Estado, "pasada" | "ultimaCron">, enCurso: boolean, ahora = new Date()): Aviso {
  const c = e.ultimaCron ?? (e.pasada?.origen === "cron" ? e.pasada : undefined);
  const esperado = cronEsperado(ahora);
  const actual = e.pasada;
  // Revisión a mano terminada después de la hora de la mañana: los datos están al día aunque la automática fallara
  const manualAlDia = actual && actual.origen === "manual" && actual.fin && !actual.error && new Date(actual.inicio) >= esperado
    ? ` Se revisó a mano ${cuando(actual.fin, ahora)}.` : "";

  // 1) No arrancó: ni rastro de la pasada de esta mañana
  if (!c || new Date(c.inicio).getTime() < esperado.getTime() - 5 * 60_000) {
    const dia = cuando(esperado.toISOString(), ahora).split(" ")[0];
    return {
      tono: manualAlDia ? "ambar" : "rojo",
      titulo: `La revisión automática de ${dia === "hoy" || dia === "ayer" ? dia : `el ${dia}`} no arrancó`,
      detalle: `${c ? `La última automática fue ${cuando(c.inicio, ahora)}.` : "Todavía no consta ninguna revisión automática."}${manualAlDia}`
        + (manualAlDia ? "" : " Pulsa «Revisar ahora» en Revisar fichas.")
        + " Si se repite, revisa en Vercel que esté puesta CRON_SECRET.",
    };
  }

  const hora = cuando(c.inicio, ahora);
  // 2) Falló al leer la web
  if (c.error) return { tono: manualAlDia ? "ambar" : "rojo", titulo: `La revisión de ${hora} falló`, detalle: c.error + manualAlDia };

  // 3) Sin terminar: en marcha o cortada
  if (!c.fin) {
    const esLaActual = actual?.id === c.id;
    const avance = `${miles(c.hechas)} de ${c.total ? miles(c.total) : "…"} fichas`;
    if (esLaActual && enCurso) return { tono: "gris", titulo: `Revisión de ${hora} en marcha`, detalle: `${avance} abiertas.` };
    return {
      tono: manualAlDia ? "ambar" : "rojo",
      titulo: `La revisión de ${hora} se cortó en ${avance}`,
      detalle: (c.fallo ? `${c.fallo}. ` : "") + (manualAlDia
        || (esLaActual ? " Se retoma sola al abrir la Suite (hasta 6 horas después); si no, pulsa «Revisar ahora»." : " Pulsa «Revisar ahora» en Revisar fichas.")).trim(),
    };
  }

  // 4) Terminada: ¿respondieron casi todas las fichas?
  const sin = c.sinComprobar ?? 0;
  if (c.total && sin / c.total > SIN_RESPUESTA_MAX) {
    return { tono: "ambar", titulo: `Revisión de ${hora}: ${miles(sin)} de ${miles(c.total)} fichas no respondieron`, detalle: "De esas se enseña lo de la revisión anterior. Si se repite, nuestra web iba lenta o saturada a esa hora." };
  }
  return { tono: "verde", titulo: `Última revisión: ${hora} · ${miles(c.total)} fichas revisadas · bien` };
}
