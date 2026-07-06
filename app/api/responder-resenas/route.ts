import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

const CONTEXTO = {
  tienda: {
    nombre: "La Tienda de Cosméticos",
    descripcion:
      "una tienda online de cosmética y dermocosmética (latiendadecosmeticos.com). Las reseñas suelen ser sobre productos, marcas, el pedido, el envío o la atención al cliente.",
    web: "latiendadecosmeticos.com",
    firma: "El equipo de La Tienda de Cosméticos",
  },
  aquatherapia: {
    nombre: "Aquatherapia",
    descripcion:
      "un centro de estética, spa y bienestar en Salamanca (spasalamanca.com). Las reseñas suelen ser sobre tratamientos faciales o corporales, masajes, la experiencia en el centro y la atención.",
    web: "spasalamanca.com",
    firma: "El equipo de Aquatherapia",
  },
} as const;

type Negocio = keyof typeof CONTEXTO;

function systemPrompt(negocio: Negocio) {
  const c = CONTEXTO[negocio];
  return `Eres el responsable de atención al cliente de ${c.nombre}, ${c.descripcion}

Tu tarea es redactar la RESPUESTA PÚBLICA a una reseña de Google, para publicarla en el Perfil de Empresa.

ESTILO OBLIGATORIO (tono corto, muy familiar, cálido y con emojis). Fíjate en que cada ejemplo empieza y termina DE FORMA DISTINTA:

Ejemplos (para reseñas positivas):
1. ¡Qué maravilla, Begoña! 🥰 Gracias de corazón por confiar en nosotras. ¡Un abrazo enorme! ✨
2. ¡Mil gracias por tus palabras, Lucía! 💖 Nos alegras el día. ¡Aquí nos tienes siempre!
3. ¡Cuánto nos alegra leerte, Marta! 😊 Gracias por la confianza, ¡a cuidarse mucho! 🌸
4. ¡Ay, Cardales, gracias! 🙌 Nos hace muchísima ilusión. ¡Hasta pronto!
5. ¡Qué alegría, María! 💕 Gracias por tu reseña, ¡seguimos aquí para lo que necesites!

REGLAS:
- En español, tono muy cercano y familiar, como si hablaras con alguien de confianza. Nada robótico ni corporativo.
- MUY BREVE: 1 o 2 frases. Se lee en un vistazo.
- Usa 1 o 2 emojis bien colocados (💖 😊 ✨ 🥰 🙌 🌸 💕 ...), con naturalidad, sin abusar.
- VARÍA SIEMPRE el saludo inicial y la despedida. NO empieces siempre con "¡Qué maravilla" ni termines siempre con "te esperamos en la próxima". Los ejemplos son solo referencia de tono, NO plantillas para copiar; inventa un saludo y un cierre nuevos cada vez.
- Si conoces el nombre de quien reseña, salúdalo por su nombre.
- MUY IMPORTANTE: NO repitas ni parafrasees lo que dice la reseña. No enumeres los detalles que menciona el cliente (envío, empaquetado, precio, detalle sorpresa...). Solo agradece de forma general y cálida.
- Si solo hay estrellas y NO hay texto: da las gracias de forma cálida por la valoración, igual de breve.
- Si la reseña es negativa o hay queja: muestra cercanía y empatía, discúlpate con naturalidad (sin humillarse) e invita a escribiros para arreglarlo (por ejemplo a través de ${c.web}). Nunca a la defensiva.
- NO inventes datos que no aparezcan (nombres de empleados, pedidos, fechas...).
- NO firmes ni pongas "${c.firma}" al final: solo el mensaje.
- Devuelve SOLO el texto de la respuesta, sin comillas, sin explicaciones ni etiquetas.`;
}

function buildUserContent(body: {
  resena?: string;
  estrellas?: number | string;
  autor?: string;
}) {
  const lineas: string[] = [];
  if (body.autor?.toString().trim()) lineas.push(`Nombre de quien reseña: ${body.autor}`);
  if (body.estrellas) lineas.push(`Valoración: ${body.estrellas} de 5 estrellas`);
  const resena = body.resena?.toString().trim();
  if (resena) {
    lineas.push(`Texto de la reseña:\n${resena}`);
  } else {
    lineas.push(`El cliente NO ha dejado texto, solo la valoración de estrellas.`);
  }
  return lineas.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Sin clave Gemini" }, { status: 500 });

  const negocio: Negocio = body.negocio === "aquatherapia" ? "aquatherapia" : "tienda";
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const texto = await llamarGemini(genAI, systemPrompt(negocio), buildUserContent(body));
    return NextResponse.json({ texto });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
