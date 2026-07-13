import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

const TIPOS = {
  extraviado: {
    etiqueta: "Envío extraviado / no llega",
    contexto:
      "El pedido está de camino (o debería estarlo) pero el cliente dice que no le ha llegado, lleva mucho retraso o el transportista no da señales de vida.",
    plantillaEjemplo: `Hola {nombre}! 😊 Vaya rollo con el envío del pedido {pedido}, de verdad que lo sentimos. Nosotros lo sacamos de almacén en su día, así que esto es cosa de la agencia de transporte, que a veces se les pierde algún paquete por el camino. Ya lo estamos reclamando para localizarlo cuanto antes; en cuanto sepamos algo te decimos. Si en un par de días no hay noticias, te lo reponemos o te devolvemos el dinero, tú eliges. Gracias por la paciencia!`,
  },
  sin_stock: {
    etiqueta: "Pedido no ha salido (rotura de stock)",
    contexto:
      "El pedido todavía no ha salido de almacén porque falta stock de algún producto. Hay que disculparse y dar una alternativa (esperar, cambiar producto o reembolso).",
    plantillaEjemplo: `Hola {nombre}, mil perdones por el retraso con el pedido {pedido} 🙏 Nos hemos quedado sin stock de uno de los productos justo cuando iba a salir, una faena. Ya hemos pedido reposición y en cuanto entre te lo enviamos corriendo. Si prefieres no esperar, dime y te lo cambio por otro producto o te devuelvo ese importe sin problema. Perdona de nuevo el lío!`,
  },
  roto: {
    etiqueta: "Producto llegado roto / dañado",
    contexto:
      "El producto ha llegado roto, dañado o derramado. Hay que disculparse mostrando que en almacén se embala con mucho cuidado (así que ha sido un golpe en el transporte), pedir foto si no la tiene y ofrecer reposición o devolución.",
    plantillaEjemplo: `Uy {nombre}, mira que lo embalamos siempre muy bien desde almacén, pero está claro que en el camino le han dado un buen golpe 😔 Lo sentimos mucho. Si puedes pasarme una foto del producto y de la caja tal cual te ha llegado nos ayuda muchísimo para reclamar al transportista. Y no te preocupes, del pedido {pedido} te enviamos uno nuevo ya mismo (o te devolvemos el dinero, como prefieras). Gracias por avisarnos!`,
  },
  otro: {
    etiqueta: "Otro / reclamación general",
    contexto:
      "Cualquier otra reclamación que no encaje en las anteriores (producto equivocado, factura, plazo, etc). Responder con el mismo tono cercano, sin plantilla fija: escuchar la queja y ofrecer solución.",
    plantillaEjemplo: "",
  },
} as const;

type TipoKey = keyof typeof TIPOS;

const CANALES = {
  whatsapp: {
    etiqueta: "WhatsApp",
    formato:
      "Mensaje de WhatsApp: muy corto (2-4 frases), sin saludos formales tipo 'Estimado/a', tuteo directo, puede llevar 1-2 emojis con naturalidad. Sin firma al final.",
  },
  email: {
    etiqueta: "Correo electrónico",
    formato:
      "Correo electrónico: empieza con 'Hola {nombre},' en su propia línea y termina con una despedida corta y cercana en su propia línea (ej: 'Un abrazo,' o 'Gracias por tu paciencia,') seguida de 'El equipo de La Tienda de Cosméticos'. Puede ser un pelín más largo que el WhatsApp pero sigue siendo informal y cercano, nunca corporativo ni acartonado. Como mucho 1 emoji.",
  },
} as const;

type CanalKey = keyof typeof CANALES;

function systemPrompt(tipo: TipoKey, canal: CanalKey) {
  const t = TIPOS[tipo];
  const c = CANALES[canal];
  return `Eres el responsable de atención al cliente de La Tienda de Cosméticos (latiendadecosmeticos.com), una tienda online de cosmética y dermocosmética.

Tu tarea es redactar la RESPUESTA a la reclamación de un cliente, para enviársela directamente.

TIPO DE RECLAMACIÓN: ${t.etiqueta}
Contexto de esta situación: ${t.contexto}
${t.plantillaEjemplo ? `\nPlantilla de referencia (tono orientativo, NO la copies literalmente, varía saludo/cierre/palabras cada vez):\n"""\n${t.plantillaEjemplo}\n"""\n` : ""}
CANAL: ${c.etiqueta}
Formato del canal: ${c.formato}

ESTILO OBLIGATORIO:
- Español, tono informal, cercano y familiar, como si le escribieras a un/a conocido/a. Nada de "Estimado cliente" ni lenguaje corporativo.
- SIEMPRE menciona el nombre del cliente y el número de pedido en algún punto del mensaje.
- Ten en cuenta lo que ha escrito el cliente (su mensaje) para responder de forma acorde: si está molesto, muestra más empatía; si solo pregunta, responde más ligero.
- Ofrece siempre una solución o siguiente paso concreto (reponer, reembolsar, esperar reposición, pedir foto...), según el tipo de reclamación.
- NO inventes datos que no te den (plazos exactos, nombres de empleados, políticas concretas de la empresa) más allá de lo que aparece en la plantilla de referencia.
- NO uses siempre el mismo saludo ni el mismo cierre: varíalos cada vez para que no suene a copia-pega.
- Devuelve SOLO el texto del mensaje final, sin comillas, sin explicaciones ni etiquetas.`;
}

function buildUserContent(body: {
  nombre?: string;
  pedido?: string;
  mensajeCliente?: string;
}) {
  const lineas: string[] = [];
  if (body.nombre?.trim()) lineas.push(`Nombre del cliente: ${body.nombre.trim()}`);
  if (body.pedido?.trim()) lineas.push(`Número de pedido: ${body.pedido.trim()}`);
  const mensaje = body.mensajeCliente?.trim();
  if (mensaje) {
    lineas.push(`Lo que ha escrito el cliente:\n${mensaje}`);
  } else {
    lineas.push("El cliente no ha escrito ningún mensaje concreto, solo se sabe el motivo de la reclamación.");
  }
  return lineas.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Sin clave Gemini" }, { status: 500 });

  const tipo: TipoKey = body.tipo in TIPOS ? body.tipo : "otro";
  const canal: CanalKey = body.canal === "email" ? "email" : "whatsapp";

  if (!body.nombre?.trim() || !body.pedido?.trim()) {
    return NextResponse.json(
      { error: "Faltan el nombre del cliente o el número de pedido" },
      { status: 400 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const texto = await llamarGemini(
      genAI,
      systemPrompt(tipo, canal),
      buildUserContent(body)
    );
    return NextResponse.json({ texto });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
