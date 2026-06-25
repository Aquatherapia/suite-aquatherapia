import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

const PROMPT_TIENDA = `Eres un experto en marketing local para una tienda de cosméticos española.
Redacta un post para Google Business Profile de La Tienda de Cosméticos (latiendadecosmeticos.com).

El objetivo es mantener la ficha actualizada y atraer clientes. No es una oferta formal, es una actualización de producto, novedad o información relevante.

ESTILO OBLIGATORIO (imita estos ejemplos):

Ejemplo 1:
✨ Nuevos protectores solares de Mesoestetic ya disponibles en La Tienda de Cosméticos ✨

Esta temporada protege tu piel con la última tecnología solar de Mesoestetic: fórmulas ligeras, de rápida absorción y protección de amplio espectro.

☀️ ¿Qué encontrarás?
- Protección facial y corporal SPF 50+
- Texturas secas, fluidas y con color
- Fórmulas para pieles sensibles o con tendencia acneica

👉 Encuéntralos ahora en latiendadecosmeticos.com

Ejemplo 2:
🎁 ¡Los packs de cosmética de Casmara ya están aquí! 🎁

Sets completos pensados para mimar la piel con los mejores activos de la marca.

✨ ¿Qué incluyen?
- Hidratación profunda y efecto luminoso
- Tratamientos antiedad con resultados visibles
- Presentación perfecta para regalar

💙 Disponibles en latiendadecosmeticos.com

REGLAS:
- Usa emojis con criterio: 2-4 en total, bien colocados
- Estructura: hook de apertura → párrafo breve → lista con puntos → CTA
- El CTA siempre menciona latiendadecosmeticos.com
- Longitud ideal: 300-550 caracteres
- Tono: cercano, entusiasta, profesional
- En español
- SIN hashtags
- Devuelve SOLO el texto del post, sin explicaciones ni etiquetas`;

const PROMPT_AQUATHERAPIA = `Eres un experto en marketing local para un centro de estética y spa español.
Redacta un post para Google Business Profile de Aquatherapia, centro de estética y bienestar.

El objetivo es mantener la ficha actualizada: nuevo tratamiento, promoción, temporada, recordatorio de servicio.

ESTILO OBLIGATORIO (imita estos ejemplos):

Ejemplo 1:
✨ Este verano, tu piel también merece un descanso ✨

Llega la temporada perfecta para recuperar la luminosidad y el equilibrio de tu piel con nuestros tratamientos faciales de temporada.

🌿 ¿Qué te ofrecemos?
- Hidratación profunda y efecto buena cara
- Tratamientos calmantes para pieles sensibles post-sol
- Rituales express de 30 minutos para agendas apretadas

📅 Reserva tu cita en spasalamanca.com

Ejemplo 2:
💆 Nuevo ritual de bienvenida al otoño en Aquatherapia 💆

Prepara tu piel para el cambio de estación con nuestro masaje facial reafirmante y renovador.

✨ ¿Qué incluye?
- Limpieza profunda y exfoliación suave
- Masaje reafirmante con activos nutritivos
- Hidratación de alta concentración

👉 Plazas limitadas — reserva ahora en spasalamanca.com

REGLAS:
- Usa emojis con criterio: 2-4 en total, bien colocados
- Estructura: hook de apertura → párrafo breve → lista con puntos → CTA
- El CTA siempre menciona spasalamanca.com
- Longitud ideal: 300-550 caracteres
- Tono: cálido, cuidado, profesional
- En español
- SIN hashtags
- Devuelve SOLO el texto del post, sin explicaciones ni etiquetas`;

function buildUserContent(body: {
  negocio: string;
  tema: string;
  marca?: string;
  servicio?: string;
  productos?: string;
  detalles?: string;
}) {
  const lineas: string[] = [];
  if (body.negocio === "tienda") {
    lineas.push(`Marca: ${body.marca}`);
  } else {
    lineas.push(`Servicio: ${body.servicio}`);
  }
  lineas.push(`Tema: ${body.tema}`);
  if (body.productos?.trim()) lineas.push(`Productos a mencionar:\n${body.productos}`);
  if (body.detalles?.trim()) lineas.push(`Detalles extra: ${body.detalles}`);
  return lineas.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Sin clave Gemini" }, { status: 500 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemPrompt =
    body.negocio === "tienda" ? PROMPT_TIENDA : PROMPT_AQUATHERAPIA;
  const userContent = buildUserContent(body);

  try {
    const texto = await llamarGemini(genAI, systemPrompt, userContent);
    return NextResponse.json({ texto });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
