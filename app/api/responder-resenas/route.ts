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

REGLAS DE ESTILO:
- En español, tono cercano, humano y profesional. Nada robótico ni genérico.
- Extensión breve: 2 a 4 frases. Las respuestas de Google se leen rápido.
- Si conoces el nombre de quien reseña, salúdalo por su nombre ("¡Hola, María!").
- Da las gracias de forma sincera y concreta: menciona algo de lo que dice la reseña para que se note que la has leído (un producto, marca, tratamiento o detalle).
- Si la reseña es negativa o hay una queja: muestra empatía, discúlpate con mesura (sin humillarse ni admitir culpas legales), y ofrece resolverlo invitando a contactar directamente (por ejemplo a través de ${c.web}). No discutas ni te pongas a la defensiva.
- Si la reseña es positiva: agradece con calidez e invita a volver, sin sonar a plantilla.
- Puedes usar 0-1 emoji como mucho, solo si encaja con naturalidad. Sin exagerar.
- NO inventes datos que no aparezcan en la reseña (nombres de empleados, pedidos, fechas...).
- Cierra con una firma breve tipo "${c.firma}" solo si queda natural; si no, omítela.
- Devuelve SOLO el texto de la respuesta, sin comillas, sin explicaciones ni etiquetas.`;
}

function buildUserContent(body: {
  resena: string;
  estrellas?: number | string;
  autor?: string;
}) {
  const lineas: string[] = [];
  if (body.autor?.toString().trim()) lineas.push(`Nombre de quien reseña: ${body.autor}`);
  if (body.estrellas) lineas.push(`Valoración: ${body.estrellas} de 5 estrellas`);
  lineas.push(`Texto de la reseña:\n${body.resena}`);
  return lineas.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Sin clave Gemini" }, { status: 500 });

  if (!body.resena?.toString().trim())
    return NextResponse.json({ error: "Falta el texto de la reseña" }, { status: 400 });

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
