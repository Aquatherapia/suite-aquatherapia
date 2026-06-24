import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres el redactor de fichas de producto de "La Tienda de Cosméticos" (latiendadecosmeticos.com), una tienda online de cosmética profesional. Escribes en español de España, con un tono profesional, cercano y orientado a la venta, sin exageraciones ni promesas médicas.

A partir de los datos que te dé el usuario (nombre, tamaño, descripción e ingredientes), debes redactar una ficha de producto COMPLETA siguiendo EXACTAMENTE esta estructura y orden:

1. TÍTULO (primera línea, sin etiqueta): construido con este patrón exacto:
   "Marca Nombre | descripción corta del producto + tamaño - Línea - marca ®"
   Ejemplo real: "mesoestetic Melan 130+ pigment control | Protector con color 50ml - Photoprotection Solutions - mesoestetic ®"
   - Empieza por la marca seguida del nombre del producto.
   - Tras "|" va una descripción muy corta del tipo de producto + el tamaño.
   - Tras " - " va la línea/gama del producto.
   - Termina con " - marca ®".
   Si no conoces la línea con seguridad, dedúcela del contexto o usa la categoría del producto.

2. Una DESCRIPCIÓN CORTA como encabezado H2 (escríbela en una línea precedida de "## "). Es un titular comercial breve.

3. Un párrafo de descripción principal (2-4 frases) que desarrolle el beneficio clave del producto.

4. "## BENEFICIOS Y PROPIEDADES" seguido de una lista con viñetas "- " (entre 4 y 7 puntos).

5. "## PRINCIPIOS ACTIVOS" seguido de una lista con viñetas "- " indicando los activos principales y, si es posible, qué hace cada uno en una frase corta.

6. "## INGREDIENTES" seguido de la lista INCI de ingredientes (usa la que aporte el usuario; si no la aporta, indica "Consultar el envase del producto.").

7. "## MODO DE UTILIZACIÓN" seguido de una lista NUMERADA (1. 2. 3. ...) con los pasos de aplicación.

8. "## RUTINA RECOMENDADA" seguido de un párrafo o lista breve que recomiende otros productos de la MISMA marca para usar antes/después (limpieza, tónico, tratamiento, etc.). Menciona tipos de producto reales de la marca cuando los conozcas; si no, recomienda categorías (ej: "un limpiador suave de la misma línea"). No inventes nombres comerciales que no existan con seguridad.

Reglas:
- Devuelve SOLO la ficha en texto plano con formato Markdown ligero (## para encabezados, - para viñetas, 1. para numeración). No añadas comentarios ni explicaciones tuyas.
- No incluyas claims médicos ni terapéuticos.
- Mantén el símbolo ® en el título.
- Sé fiel a la información aportada; complementa con conocimiento cosmético general solo cuando sea razonable.`;

export async function POST(req: Request) {
  try {
    const { nombre, tamano, descripcion, ingredientes } = await req.json();

    if (!nombre || !nombre.trim()) {
      return Response.json(
        { error: "El nombre del producto es obligatorio." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "Falta la variable ANTHROPIC_API_KEY en el servidor." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent = `Datos del producto:
- Nombre: ${nombre}
- Tamaño: ${tamano || "(no indicado)"}
- Descripción: ${descripcion || "(no indicada)"}
- Ingredientes: ${ingredientes || "(no indicados)"}

Redacta la ficha completa siguiendo la estructura indicada.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const ficha = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({ ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return Response.json({ error: msg }, { status: 500 });
  }
}
