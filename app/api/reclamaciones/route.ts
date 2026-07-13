import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

const TIPOS = {
  extraviado: {
    etiqueta: "Envío extraviado / no llega",
    contexto:
      "El pedido está de camino (o debería estarlo) pero el cliente dice que no le ha llegado, lleva mucho retraso o el transportista no da señales de vida.",
    plantillaEjemplo: `Hola {nombre}! 😊 Vaya movida con tu pedido **{pedido}**, de verdad que lo sentimos un montón 😔 Nosotros lo sacamos de almacén en su día, así que esto es cosa de la agencia de transporte, que a veces se lía. Ya lo estamos **reclamando** para localizarlo cuanto antes y en cuanto sepamos algo te decimos 📦 Si en un par de días sigue sin aparecer, te lo **reponemos o te devolvemos el dinero**, lo que tú prefieras 💜 Mil gracias por la paciencia!`,
  },
  sin_stock: {
    etiqueta: "Pedido no ha salido (rotura de stock)",
    contexto:
      "El pedido todavía no ha salido de almacén porque falta stock de algún producto. Hay que disculparse y dar una alternativa (esperar, cambiar producto o reembolso).",
    plantillaEjemplo: `Hola {nombre}! 🙈 Mil perdones por el retraso con tu pedido **{pedido}** 🙏 Nos hemos quedado sin stock de uno de los productos justo cuando iba a salir, una pena 😩 Ya hemos pedido reposición y en cuanto entre te lo mandamos **volando** 📦 Si no quieres esperar, dímelo y te lo **cambio por otro producto o te devuelvo ese importe** sin ningún problema 😊 Perdona otra vez el lío!`,
  },
  roto: {
    etiqueta: "Producto llegado roto / dañado",
    contexto:
      "El producto ha llegado roto, dañado o derramado. Hay que disculparse mostrando que en almacén se embala con mucho cuidado (así que ha sido un golpe en el transporte), pedir foto si no la tiene y ofrecer reposición o devolución.",
    plantillaEjemplo: `Uy {nombre}! 😱 Mira que lo embalamos siempre **súper bien** desde almacén, pero está claro que en el camino le han dado un buen golpe 😔 Lo sentimos muchísimo. ¿Puedes pasarme una **foto** del producto y de la caja tal cual te llegó? Así lo reclamamos al transportista 📸 Y tú tranqui, que del pedido **{pedido}** te mando **uno nuevo ya mismo** (o te devuelvo el dinero, como prefieras) 📦💜 Gracias por avisarnos!`,
  },
  equivocado: {
    etiqueta: "Producto equivocado (enviado mal)",
    contexto:
      "Nos hemos equivocado y le hemos enviado un producto distinto al que pidió. La culpa es nuestra: hay que reconocerlo con naturalidad, disculparse y darle solución (enviarle el correcto ya mismo y decirle que se quede el equivocado o que gestionamos la recogida, sin coste para él).",
    plantillaEjemplo: `Ay {nombre}, la hemos liado nosotros con tu pedido **{pedido}** 🙈 Te hemos mandado el producto equivocado, ¡mil perdones! 😔 Ahora mismo te enviamos el **correcto sin que tengas que pagar nada** 📦 Y el que te llegó por error **quédatelo** o si prefieres te organizamos la recogida, tú tranqui, no te preocupes de nada 💜 Perdona el despiste!`,
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
      "Mensaje de WhatsApp: cortito (2-4 frases), tuteo directo, súper cercano. Sin saludos formales ni firma al final.",
  },
  email: {
    etiqueta: "Correo electrónico",
    formato:
      "Correo electrónico: empieza con 'Hola {nombre},' en su propia línea y termina con una despedida corta y cercana en su propia línea (ej: 'Un abrazo,' o '¡Gracias por tu paciencia!,') seguida de 'El equipo de La Tienda de Cosméticos'. Puede ser un pelín más largo que el WhatsApp, pero sigue igual de informal y cercano, nunca corporativo.",
  },
} as const;

type CanalKey = keyof typeof CANALES;

function systemPrompt(
  tipo: TipoKey,
  canal: CanalKey,
  instruccionesExtra: string
) {
  const t = TIPOS[tipo];
  const c = CANALES[canal];
  return `Eres quien lleva la atención al cliente de La Tienda de Cosméticos (latiendadecosmeticos.com), una tienda online de cosmética y dermocosmética.

Tu tarea es redactar la RESPUESTA a la reclamación de un cliente, para enviársela directamente.

TIPO DE RECLAMACIÓN: ${t.etiqueta}
Contexto de esta situación: ${t.contexto}
${t.plantillaEjemplo ? `\nPlantilla de referencia (tono orientativo, NO la copies literalmente, varía saludo/cierre/palabras cada vez):\n"""\n${t.plantillaEjemplo}\n"""\n` : ""}
CANAL: ${c.etiqueta}
Formato del canal: ${c.formato}
${instruccionesExtra ? `\nINSTRUCCIONES ADICIONALES PARA ESTE CASO (tenlas muy en cuenta):\n${instruccionesExtra}\n` : ""}
ESTILO OBLIGATORIO:
- Español, tono **muy muy informal** y cercano, como un mensaje a un colega de confianza. Nada de "Estimado cliente" ni lenguaje corporativo o acartonado.
- SIEMPRE menciona el nombre del cliente y el número de pedido en algún punto del mensaje.
- Usa **negritas** poniendo el texto entre dobles asteriscos (por ejemplo **el número de pedido**, **la solución que ofreces**, **el regalo**...). 2 o 3 negritas como mucho, para resaltar lo importante.
- Usa varios emojis/iconos con naturalidad (📦 😊 🎁 🙏 ✨ 💜 😔 📸 ...), TANTO en WhatsApp como en email.
- Ten en cuenta lo que ha escrito el cliente para responder acorde: si está enfadado, más empatía; si solo pregunta, más ligero.
- Ofrece siempre una solución o siguiente paso concreto (reponer, reembolsar, esperar reposición, pedir foto...).
- NO inventes datos que no te den (plazos exactos, nombres de empleados, políticas concretas) más allá de lo que aparece en la plantilla de referencia.
- Varía el saludo y el cierre cada vez, que no suene a copia-pega.
- Devuelve SOLO el texto del mensaje final, sin comillas ni explicaciones. Las negritas van con dobles asteriscos **así**.`;
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

// Días transcurridos desde la fecha de compra (YYYY-MM-DD). null si no válida.
function diasDesde(fecha?: string): number | null {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
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

  const dias = diasDesde(body.fechaCompra);
  const regaloPorTardanza = tipo === "sin_stock" && dias !== null && dias > 7;

  const extras: string[] = [];
  if (regaloPorTardanza) {
    extras.push(
      "- Han pasado más de una semana desde que hizo la compra: además de disculparte por el retraso, dile que **por las molestias le vamos a meter un regalito/detalle en el pedido** 🎁, con naturalidad y cariño."
    );
  }
  if (tipo === "equivocado" || tipo === "roto") {
    const queFoto =
      tipo === "roto"
        ? "una foto del producto roto y de la caja tal cual le llegó"
        : "una foto del producto que le ha llegado por error";
    if (!body.fotoRecibida) {
      extras.push(
        `- Todavía NO nos ha enviado la foto: pídesela con naturalidad (${queFoto}) para poder gestionarlo. 📸`
      );
    } else {
      extras.push(
        "- Ya tenemos la foto, así que NO le pidas ninguna foto."
      );
    }
    if (body.hayStock) {
      extras.push(
        "- SÍ tenemos stock del producto correcto: dile que **se lo enviamos hoy mismo**. 📦"
      );
    } else {
      extras.push(
        "- NO tenemos stock del producto correcto ahora mismo: NO prometas que sale hoy; dile que se lo enviamos en cuanto vuelva a entrar en stock / lo repongamos, lo antes posible."
      );
    }
  }
  const instruccionesExtra = extras.join("\n");

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const texto = await llamarGemini(
      genAI,
      systemPrompt(tipo, canal, instruccionesExtra),
      buildUserContent(body)
    );
    return NextResponse.json({ texto, regaloPorTardanza });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
