import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseSecciones, llamarGemini } from "../gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres el redactor de fichas de producto de "La Tienda de Cosméticos" (latiendadecosmeticos.com), una tienda online de cosmética profesional. Escribes en español de España, con un tono profesional, cercano y orientado a la venta, sin exageraciones ni promesas médicas.

Te daré por separado el Nombre, la Línea, la Marca y el Formato del producto. Úsalos EXACTAMENTE como te los doy, sin mezclarlos ni repetirlos.

REGLA DEL FORMATO EN EL TÍTULO:
- Si el campo Formato contiene UN SOLO valor (ej: "30ml"): inclúyelo en el título pegado a la descripción.
  → "Sérum Rejuvenation | Sérum activador de la juventud 30ml - The Botox - Fhos ®"
- Si el campo Formato contiene MÚLTIPLES valores (ej: "30ml y 50ml", "textura ligera y textura rica", etc.): NO lo pongas en el título. El título queda solo con la descripción.
  → "Sérum Rejuvenation | Sérum activador de la juventud - The Botox - Fhos ®"

Redacta la ficha en formato HTML y devuelve la respuesta con EXACTAMENTE estos delimitadores, sin texto fuera de ellos:

[TITULO]
<h1>Nombre | descripción corta - [Línea] - [Marca] ®</h1>
Reglas del H1:
- Empieza con el Nombre tal cual.
- Tras "|": descripción comercial corta del tipo de producto (+ formato solo si es uno único).
- Tras " - ": Línea. Tras " - ": Marca ®. La Marca aparece UNA SOLA VEZ al final.
[/TITULO]

[DESCRIPCION]
<h2>[Tipo de producto] [adjetivo] de [Marca]</h2>
<p>Texto de 2-4 frases pensado para VENDER. Empieza con un gancho que conecte con el deseo o problema del cliente (ej: lucir piel más joven, eliminar el maquillaje sin irritar...). Describe el resultado que va a notar, no solo los ingredientes. Usa un tono cercano y entusiasta, sin exageraciones médicas. Que quien lo lea quiera seguir leyendo o comprarlo directamente.</p>
<h3>FORMATO DE [formato/s]</h3>
[/DESCRIPCION]
Reglas del H2 de esta sección:
- SIEMPRE incluye un adjetivo que describa la propiedad principal del producto (reafirmante, hidratante, iluminador, antiedad...). Nunca dejes el H2 solo con el tipo de producto a secas.
  → Ejemplo correcto: "Crema reafirmante corporal de Dermoder". Ejemplo incorrecto: "Crema corporal de Dermoder".
Regla del H3 de formato:
- SIEMPRE añádelo tras el párrafo, tanto si hay un solo formato como si hay varios (sepáralos por comas): <h3>FORMATO DE 30ml</h3> o <h3>FORMATO DE 30ml, 50ml</h3>.
- Si no hay ningún formato indicado, omite el H3 por completo.

[BENEFICIOS]
<h2>BENEFICIOS Y PROPIEDADES</h2>
<ul>
<li>Beneficio 1.</li>
<li>Beneficio 2.</li>
... (4-7 puntos)
</ul>
[/BENEFICIOS]

[ACTIVOS]
<h2>PRINCIPIOS ACTIVOS</h2>
<ul>
<li><strong>Activo:</strong> función en una frase.</li>
</ul>
[/ACTIVOS]

[INGREDIENTES]
<h2>INGREDIENTES</h2>
<p>Lista INCI o "Consultar el envase del producto."</p>
[/INGREDIENTES]

[MODO]
<h2>MODO DE UTILIZACIÓN</h2>
<ol>
<li>Paso 1.</li>
</ol>
[/MODO]

[IDEAL]
<h2>[TIPO EN MAYÚSCULAS] IDEAL PARA:</h2>
<p>Tipos de piel y condiciones indicadas.</p>
[/IDEAL]

[META_TITLE]
Meta title de máximo 60 caracteres (nunca los superes)
[/META_TITLE]

[META_DESC]
Meta description de máximo 160 caracteres (nunca los superes)
[/META_DESC]

Reglas generales:
- Usa solo: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>. Sin Markdown, sin bloques de código.
- No incluyas claims médicos ni terapéuticos.
- Sé fiel a la información aportada.`;


export async function POST(req: Request) {
  try {
    const { nombre, linea, marca, formato, descripcion, ingredientes } =
      await req.json();

    if (!nombre?.trim()) {
      return Response.json(
        { error: "El nombre del producto es obligatorio." },
        { status: 400 }
      );
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
- Ingredientes: ${ingredientes || "(no indicados)"}

Redacta la ficha completa siguiendo la estructura indicada.`;

    const raw = await llamarGemini(genAI, SYSTEM_PROMPT, userContent);
    const secciones = parseSecciones(raw);

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
