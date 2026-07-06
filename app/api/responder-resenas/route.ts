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

ESTILO OBLIGATORIO (imita este tono: corto, muy familiar, cálido y con emojis):

Ejemplo:
¡Muchas gracias, Carlos Iván! 💖
Nos alegra mucho que te hayan gustado esos pequeños detalles. Creemos que un pedido siempre sabe mejor con un toque de cariño. 😊 ¡Hasta la próxima!

REGLAS:
- En español, tono muy cercano y familiar, como si hablaras con alguien de confianza. Nada robótico ni corporativo.
- MUY BREVE: 2 o 3 frases como máximo. Se lee en un vistazo.
- Usa 1 o 2 emojis bien colocados (💖 😊 ✨ 🥰 🙌 ...), con naturalidad, sin abusar.
- Si conoces el nombre de quien reseña, empieza saludándolo por su nombre ("¡Muchas gracias, María!").
- Si la reseña tiene texto: agradece mencionando algo concreto de lo que dice, para que se note que la has leído.
- Si solo hay estrellas y NO hay texto: da las gracias de forma cálida por la valoración, sin inventarte detalles ni motivos.
- Si la reseña es negativa o hay queja: muestra cercanía y empatía, discúlpate con naturalidad (sin humillarse) e invita a escribiros para arreglarlo (por ejemplo a través de ${c.web}). Nunca a la defensiva.
- Termina con un cierre cálido tipo "¡Hasta la próxima!" cuando encaje.
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
