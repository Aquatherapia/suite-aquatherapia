import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

type Producto = { nombre: string; formato?: string; url: string };

// Nombre completo del producto: "Contorno de ojos" + "15ml" → "Contorno de ojos 15ml"
function etiqueta(p: Producto): string {
  return [p.nombre?.trim(), p.formato?.trim()].filter(Boolean).join(" ");
}

// Formas en que la IA puede nombrar al producto y que deben enlazarse igual:
// con formato ("Leche Limpiadora 200ml") y sin él ("Leche Limpiadora"), porque
// en un texto de rutina lo natural es escribirlo sin el ml.
function aliasDe(p: Producto): string[] {
  return [...new Set([etiqueta(p), p.nombre?.trim() ?? ""])].filter(Boolean);
}

// ------- Enlazado automático de los productos del pack -------
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Envuelve cada mención del nombre de un producto en un <a href>,
// sin tocar el texto que ya esté dentro de otro <a> (evita enlaces anidados).
function enlazarProductos(html: string, productos: Producto[]): string {
  const alias = productos
    .filter((p) => p.nombre?.trim() && p.url?.trim())
    .flatMap((p) => aliasDe(p).map((a) => ({ alias: a, url: p.url.trim() })))
    // los alias más largos primero, para que "Crema Firmeza 50ml" gane a "Crema Firmeza"
    .sort((a, b) => b.alias.length - a.alias.length);
  if (!alias.length) return html;

  const alternacion = alias.map((a) => escapeReg(a.alias)).join("|");
  const re = new RegExp(`(${alternacion})`, "g");

  // Separa etiquetas de texto y solo enlaza en el texto que está fuera de un <a>
  const partes = html.split(/(<[^>]+>)/g);
  let dentroDeA = 0;
  return partes
    .map((seg) => {
      if (seg.startsWith("<")) {
        if (/^<a\b/i.test(seg)) dentroDeA++;
        else if (/^<\/a\s*>/i.test(seg)) dentroDeA = Math.max(0, dentroDeA - 1);
        return seg;
      }
      if (dentroDeA > 0 || !seg) return seg;
      return seg.replace(re, (match) => {
        const a = alias.find((x) => x.alias === match);
        if (!a) return match;
        return `<a href="${a.url}" target="_blank" rel="noopener">${match}</a>`;
      });
    })
    .join("");
}

// Construye en código (enlaces garantizados) la sección "¿Qué contiene el pack?"
function construirContenido(productos: Producto[]): string {
  const items = productos
    .filter((p) => p.nombre?.trim() && p.url?.trim())
    .map(
      (p) =>
        `<li><a href="${p.url.trim()}" target="_blank" rel="noopener">${etiqueta(p)}</a></li>`
    )
    .join("\n");
  if (!items) return "";
  return `<h3>¿QUÉ CONTIENE EL PACK?</h3>\n<ul>\n${items}\n</ul>`;
}

function extraer(raw: string, tag: string) {
  return (
    raw
      .match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`))
      ?.[1]
      ?.trim()
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim() ?? ""
  );
}

function listaProductos(productos: Producto[]) {
  const validos = productos.filter((p) => p.nombre?.trim());
  if (!validos.length) return "(no indicados)";
  return validos.map((p) => `• ${etiqueta(p)}`).join("\n");
}

// ------- Prompts -------
const REGLAS_LINK = `IMPORTANTE — Menciona los productos que componen el pack SIEMPRE por su nombre EXACTO tal como aparece en la lista "Productos del pack". No los abrevies ni los reformules (di "Leche Limpiadora L'Arcou", no "la leche" ni "el limpiador"). Puedes escribirlos con el formato ("Leche Limpiadora L'Arcou 200ml") o sin él ("Leche Limpiadora L'Arcou"), lo que quede más natural en la frase: ambas formas se enlazan igual. NO añadas etiquetas <a> ni enlaces tú mismo: los enlaces se insertan automáticamente después.`;

function systemPromptFull(incluirIngredientes: boolean, incluirActivos: boolean) {
  return `Eres el redactor de fichas de producto de "La Tienda de Cosméticos" (latiendadecosmeticos.com), una tienda online de cosmética profesional. Escribes en español de España, con un tono profesional, cercano y orientado a la venta, sin exageraciones ni promesas médicas.

Vas a redactar la ficha de un PACK / SET (varios productos que se venden juntos). Te daré por separado el Nombre del pack, la Línea, la Marca y la lista de Productos que contiene. Úsalos EXACTAMENTE como te los doy.

${REGLAS_LINK}

Redacta la ficha en formato HTML y devuelve la respuesta con EXACTAMENTE estos delimitadores, sin texto fuera de ellos:

[TITULO]
<h1>Nombre del pack | producto1 + producto2 + producto3 - [Línea] - [Marca] ®</h1>
Reglas del H1:
- Empieza con el Nombre del pack tal cual.
- Tras "|": los nombres de los productos que contiene el pack, EXACTOS, unidos con " + " (incluyendo su formato en ml).
- Tras " - ": Línea. Tras " - ": Marca ®. La Marca aparece UNA SOLA VEZ al final. Si no hay Línea, omite ese " - Línea".
[/TITULO]

[DESCRIPCION]
<h2>[Tipo de rutina/tratamiento] [adjetivo] de [Marca]</h2>
<p>Primer párrafo de venta: 2-4 frases con un gancho que conecte con el deseo o problema del cliente y explique qué resuelve el pack de forma global.</p>
<p>Segundo párrafo: explica qué combina el pack (menciona los productos por su nombre exacto) y la sinergia entre ellos.</p>
<p>Tercer párrafo: el resultado que se percibe con el uso continuado.</p>
[/DESCRIPCION]
Regla del H2: SIEMPRE incluye un adjetivo que describa la propiedad principal (reafirmante, hidratante, iluminador, antiedad...). Nunca lo dejes solo con el tipo a secas.

[BENEFICIOS]
<h3>BENEFICIOS Y PROPIEDADES</h3>
<ul>
<li>Beneficio 1.</li>
... (4-7 puntos)
</ul>
[/BENEFICIOS]
${
  incluirActivos
    ? `
[ACTIVOS]
<h3>PRINCIPIOS ACTIVOS</h3>
<ul>
<li><strong>Activo:</strong> función en una frase.</li>
</ul>
[/ACTIVOS]
`
    : ""
}${
    incluirIngredientes
      ? `
[INGREDIENTES]
<h3>INGREDIENTES</h3>
<p>Lista INCI o "Consultar el envase de cada producto."</p>
[/INGREDIENTES]
`
      : ""
  }
[MODO]
<h3>MODO DE UTILIZACIÓN</h3>
<p><strong>[Nombre del bloque]:</strong></p>
<p>Frase que introduce ese bloque de la rutina.</p>
<ol>
<li><strong>[Nombre del paso]:</strong> qué hacer, mencionando el/los productos por su nombre.</li>
</ol>
<p><strong>[Nombre del siguiente bloque]:</strong></p>
<p>Frase que introduce ese bloque.</p>
<ol>
<li><strong>[Nombre del paso]:</strong> qué hacer, mencionando el/los productos por su nombre.</li>
</ol>
[/MODO]
Reglas del MODO (IMPORTANTE):
- Es la RUTINA COMPLETA, no una ficha producto por producto. Describe el ritual de cuidado paso a paso, en el orden real de aplicación.
- Un mismo producto PUEDE aparecer en varios pasos (p. ej. la leche limpiadora se usa mañana y noche), y un paso puede usar varios productos. No fuerces "un paso = un producto".
- Divide en bloques SOLO si la rutina lo pide de verdad (p. ej. mañana y noche con pasos distintos). Cada bloque lleva su nombre en <p><strong>…:</strong></p>, su frase de introducción y su propia lista <ol> numerada empezando por 1.
- Si la rutina es ÚNICA, o si de mañana y de noche se hace LO MISMO: NO la partas en bloques. Pon una sola lista <ol> y, si hace falta, indica dentro del paso cuándo se aplica (p. ej. "mañana y noche").
- NUNCA uses encabezados (<h4>, <h3>…) para los nombres de los bloques: van en <p><strong>…</strong></p>.
- Cada paso empieza con un nombre de paso corto en <strong> y dos puntos (p. ej. "<strong>Limpieza Refrescante:</strong>"), seguido de la instrucción redactada en tono cercano.
- Usa TODOS los productos del pack en algún paso.

[IDEAL]
<h3>[NOMBRE DEL PACK EN MAYÚSCULAS] IDEAL PARA:</h3>
<p>Tipos de piel y condiciones indicadas para este pack.</p>
[/IDEAL]

[META_TITLE]
Meta title de máximo 60 caracteres (nunca los superes). Incluye el nombre del pack y la marca.
[/META_TITLE]

[META_DESC]
Meta description de máximo 160 caracteres (nunca los superes). Resume el beneficio del pack e invita a hacer clic. Sin claims médicos.
[/META_DESC]

Reglas generales:
- Usa solo: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <br>. Sin Markdown, sin bloques de código. NUNCA uses <h4>.
- No incluyas claims médicos ni terapéuticos.
- Sé fiel a la información aportada.`;
}

const PROMPTS_SECCION: Record<string, string> = {
  titulo: `Eres redactor de fichas de packs para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO el título del pack con este formato exacto:

[TITULO]
<h1>Nombre del pack | producto1 + producto2 + producto3 - [Línea] - [Marca] ®</h1>
[/TITULO]

REGLAS:
- Empieza con el Nombre del pack tal cual, seguido de " | ".
- Tras "|": los nombres EXACTOS de los productos que contiene, unidos con " + " (con su formato).
- Tras " - ": Línea. Tras " - ": Marca ®. La Marca aparece UNA SOLA VEZ al final. Si no hay Línea, omite ese " - Línea".

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  descripcion: `Eres redactor de fichas de packs para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

${REGLAS_LINK}

Redacta SOLO la sección DESCRIPCIÓN del pack con este formato exacto:

[DESCRIPCION]
<h2>[Tipo de rutina/tratamiento] [adjetivo] de [Marca]</h2>
<p>Gancho + qué resuelve el pack de forma global.</p>
<p>Qué combina el pack (menciona los productos por su nombre exacto) y su sinergia.</p>
<p>Resultado que se percibe con el uso continuado.</p>
[/DESCRIPCION]

Regla del H2: SIEMPRE incluye un adjetivo (reafirmante, hidratante...). Nunca lo dejes solo con el tipo a secas.

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  beneficios: `Eres redactor de fichas de packs para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

Redacta SOLO la sección BENEFICIOS Y PROPIEDADES con este formato exacto:

[BENEFICIOS]
<h3>BENEFICIOS Y PROPIEDADES</h3>
<ul>
<li>Beneficio 1.</li>
... (4-7 puntos)
</ul>
[/BENEFICIOS]

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  modo: `Eres redactor de fichas de packs para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

${REGLAS_LINK}

Redacta SOLO la sección MODO DE UTILIZACIÓN con este formato exacto:

[MODO]
<h3>MODO DE UTILIZACIÓN</h3>
<p><strong>[Nombre del bloque]:</strong></p>
<p>Frase que introduce ese bloque de la rutina.</p>
<ol>
<li><strong>[Nombre del paso]:</strong> qué hacer, mencionando el/los productos por su nombre.</li>
</ol>
<p><strong>[Nombre del siguiente bloque]:</strong></p>
<p>Frase que introduce ese bloque.</p>
<ol>
<li><strong>[Nombre del paso]:</strong> qué hacer, mencionando el/los productos por su nombre.</li>
</ol>
[/MODO]

Reglas (IMPORTANTE):
- Es la RUTINA COMPLETA, no una ficha producto por producto. Describe el ritual paso a paso en el orden real de aplicación.
- Un mismo producto PUEDE aparecer en varios pasos, y un paso puede usar varios productos. No fuerces "un paso = un producto".
- Divide en bloques SOLO si la rutina lo pide de verdad (p. ej. mañana y noche con pasos distintos). Cada bloque lleva su nombre en <p><strong>…:</strong></p>, su frase de introducción y su propia lista <ol> empezando por 1.
- Si la rutina es ÚNICA, o si de mañana y de noche se hace LO MISMO: NO la partas en bloques. Pon una sola lista <ol> y, si hace falta, indica dentro del paso cuándo se aplica (p. ej. "mañana y noche").
- NUNCA uses encabezados (<h4>, <h3>…) para los nombres de los bloques: van en <p><strong>…</strong></p>.
- Cada paso empieza con un nombre de paso corto en <strong> y dos puntos, seguido de la instrucción.
- Usa TODOS los productos del pack en algún paso.
- Usa solo: <h3>, <p>, <ol>, <li>, <strong>.

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  metaTitle: `Eres redactor SEO para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO el meta title del pack con este formato exacto:

[META_TITLE]
Meta title de máximo 60 caracteres (nunca los superes). Incluye el nombre del pack y la marca. Atractivo para el clic.
[/META_TITLE]

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  metaDesc: `Eres redactor SEO para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO la meta description del pack con este formato exacto:

[META_DESC]
Meta description de máximo 160 caracteres (nunca los superes). Resume el beneficio del pack e invita a hacer clic. Sin claims médicos.
[/META_DESC]

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      nombre,
      linea,
      marca,
      descripcion,
      ingredientes,
      activosContexto,
      productos = [],
      incluirIngredientes = false,
      incluirActivos = false,
      seccion,
      longitud,
    }: {
      nombre?: string;
      linea?: string;
      marca?: string;
      descripcion?: string;
      ingredientes?: string;
      activosContexto?: string;
      productos?: Producto[];
      incluirIngredientes?: boolean;
      incluirActivos?: boolean;
      seccion?: string;
      longitud?: string;
    } = body;

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "Falta la variable GEMINI_API_KEY en el servidor." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const userContent = `Datos del pack:
- Nombre del pack: ${nombre || "(no indicado)"}
- Línea: ${linea || "(no indicada)"}
- Marca: ${marca || "(no indicada)"}
- Productos del pack:
${listaProductos(productos)}
- Descripción / contexto: ${descripcion || "(no indicada)"}
- Principios activos aportados: ${activosContexto || "(no indicados — puedes deducirlos de la descripción)"}
- Ingredientes: ${ingredientes || "(no indicados)"}`;

    // ----- Regenerar una sola sección -----
    if (seccion) {
      if (!PROMPTS_SECCION[seccion]) {
        return Response.json({ error: "Sección no válida." }, { status: 400 });
      }
      const instruccionLongitud =
        longitud === "largo"
          ? "IMPORTANTE: El texto debe ser más extenso de lo habitual, con más detalle."
          : longitud === "corto"
          ? "IMPORTANTE: El texto debe ser más breve y conciso de lo habitual."
          : "";
      const prompt = PROMPTS_SECCION[seccion].replace("{{LONGITUD}}", instruccionLongitud);

      let raw = "";
      try {
        raw = await llamarGemini(genAI, prompt, userContent);
      } catch {
        return Response.json(
          { error: "Modelos saturados. Espera unos segundos e inténtalo de nuevo." },
          { status: 503 }
        );
      }

      const tag = {
        titulo: "TITULO",
        descripcion: "DESCRIPCION",
        beneficios: "BENEFICIOS",
        modo: "MODO",
        metaTitle: "META_TITLE",
        metaDesc: "META_DESC",
      }[seccion]!;
      let html = extraer(raw, tag);
      if (seccion === "descripcion" || seccion === "modo") {
        html = enlazarProductos(html, productos);
      }
      return Response.json({ html });
    }

    // ----- Generación completa -----
    if (!nombre?.trim()) {
      return Response.json(
        { error: "El nombre del pack es obligatorio." },
        { status: 400 }
      );
    }

    const raw = await llamarGemini(
      genAI,
      systemPromptFull(incluirIngredientes, incluirActivos),
      userContent + "\n\nRedacta la ficha completa del pack siguiendo la estructura indicada."
    );

    const secciones = {
      titulo: extraer(raw, "TITULO"),
      descripcion: enlazarProductos(extraer(raw, "DESCRIPCION"), productos),
      contenido: construirContenido(productos),
      beneficios: extraer(raw, "BENEFICIOS"),
      activos: incluirActivos ? extraer(raw, "ACTIVOS") : "",
      ingredientes: incluirIngredientes ? extraer(raw, "INGREDIENTES") : "",
      modo: enlazarProductos(extraer(raw, "MODO"), productos),
      ideal: extraer(raw, "IDEAL"),
      metaTitle: extraer(raw, "META_TITLE"),
      metaDesc: extraer(raw, "META_DESC"),
    };

    return Response.json(secciones);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    const saturado = /saturad|overload|503/i.test(msg);
    return Response.json(
      {
        error: saturado
          ? "Los modelos gratuitos de Google están saturados. Espera unos segundos y vuelve a intentarlo."
          : msg,
      },
      { status: saturado ? 503 : 500 }
    );
  }
}
