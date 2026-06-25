import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseSecciones, llamarGemini } from "../gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPTS: Record<string, string> = {
  descripcion: `Eres redactor de fichas de producto para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

Redacta SOLO la sección DESCRIPCIÓN CORTA del producto con este formato exacto:

[DESCRIPCION]
<h2>[tipo de producto en español] de [Marca]</h2>
<p>Texto de 2-4 frases pensado para VENDER. Empieza con un gancho que conecte con el deseo o problema del cliente. Describe el resultado que va a notar, no solo los ingredientes. Tono cercano y entusiasta, sin exageraciones médicas. Que quien lo lea quiera comprarlo.</p>
[/DESCRIPCION]

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  titulo: `Eres redactor de fichas de producto para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO el título del producto con este formato exacto:

[TITULO]
<h1>Nombre | descripción comercial corta [formato si es único] - [Línea] - [Marca] ®</h1>
[/TITULO]

REGLAS ESTRICTAS:
- Empieza SIEMPRE con el Nombre exacto del producto, seguido de " | ".
- Tras "|": una descripción comercial corta del tipo de producto (+ formato SOLO si hay uno único).
- Si hay MÚLTIPLES formatos: NO incluyas el formato en el título.
- Tras " - ": Línea. Tras " - ": Marca ®. La Marca aparece UNA SOLA VEZ al final.
- Si no hay Línea, omite ese " - Línea".

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  metaTitle: `Eres redactor SEO para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO el meta title del producto con este formato exacto:

[META_TITLE]
Meta title entre 50 y 60 caracteres. Incluye el nombre del producto y la marca. Atractivo para el clic.
[/META_TITLE]

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  metaDesc: `Eres redactor SEO para "La Tienda de Cosméticos". Escribe en español de España.

Redacta SOLO la meta description del producto con este formato exacto:

[META_DESC]
Meta description de unos 150 caracteres. Resume el beneficio clave e invita a hacer clic. Sin claims médicos.
[/META_DESC]

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  beneficios: `Eres redactor de fichas de producto para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

Redacta SOLO la sección BENEFICIOS Y PROPIEDADES con este formato exacto:

[BENEFICIOS]
<h2>BENEFICIOS Y PROPIEDADES</h2>
<ul>
<li>Beneficio 1.</li>
... (4-7 puntos)
</ul>
REGLA FORMATO: Si el campo Formato tiene MÚLTIPLES valores, añade AL FINAL (después de </ul>) un H3 con los formatos separados por comas:
<h3>FORMATO DE 30ml, 50ml</h3>
Si hay un solo formato, NO añadas el H3.
[/BENEFICIOS]

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,

  modo: `Eres redactor de fichas de producto para "La Tienda de Cosméticos". Escribe en español de España, tono profesional y cercano, sin claims médicos.

Redacta SOLO la sección MODO DE UTILIZACIÓN con este formato exacto:

[MODO]
<h2>MODO DE UTILIZACIÓN</h2>
<ol>
<li>Paso 1.</li>
<li>Paso 2.</li>
</ol>
[/MODO]

{{LONGITUD}}

Devuelve ÚNICAMENTE ese bloque, sin nada más.`,
};

export async function POST(req: Request) {
  try {
    const { nombre, linea, marca, formato, descripcion, ingredientes, seccion, longitud } =
      await req.json();

    if (!seccion || !PROMPTS[seccion]) {
      return Response.json({ error: "Sección no válida." }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "Falta la variable GEMINI_API_KEY en el servidor." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const userContent = `Datos del producto:
- Nombre: ${nombre}
- Línea: ${linea || "(no indicada)"}
- Marca: ${marca || "(no indicada)"}
- Formato: ${formato || "(no indicado)"}
- Descripción: ${descripcion || "(no indicada)"}
- Ingredientes: ${ingredientes || "(no indicados)"}`;

    const instruccionLongitud =
      longitud === "largo" ? "IMPORTANTE: El texto debe ser más extenso de lo habitual, con más detalle." :
      longitud === "corto" ? "IMPORTANTE: El texto debe ser más breve y conciso de lo habitual." :
      "";
    const prompt = PROMPTS[seccion].replace("{{LONGITUD}}", instruccionLongitud);

    let rawOutput = "";
    try {
      rawOutput = await llamarGemini(genAI, prompt, userContent);
    } catch {
      return Response.json(
        { error: "Modelos saturados. Espera unos segundos e inténtalo de nuevo." },
        { status: 503 }
      );
    }

    const secciones = parseSecciones(rawOutput);
    const html = secciones[seccion as keyof typeof secciones] || "";

    return Response.json({ html });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return Response.json({ error: msg }, { status: 500 });
  }
}
