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
      "El pedido todavía no ha salido de almacén porque falta stock de algún producto (retraso en el envío). Somos nosotros quienes contactamos con el cliente para avisarle y darle opciones.",
    plantillaEjemplo: `Asunto: {nombre}, tenemos una pequeña actualización sobre tu pedido #{pedido}

¡Hola!, {nombre}.

Hemos estado revisando tu pedido #{pedido} y... tenemos un pequeño culpable que está retrasando la salida. Se trata de: {producto pendiente}.

Justo cuando realizaste el pedido se agotaron las últimas unidades disponibles. La buena noticia es que el proveedor ya nos ha confirmado la reposición y esperamos recibirla {fecha estimada}, así que no debería tardar mucho más.

Mientras tanto, te damos dos opciones:
- Esperar unos días y enviártelo todo junto en cuanto recibamos el producto.
- O, si te viene mejor, hoy mismo sacamos el resto del pedido y, en cuanto llegue {producto pendiente}, te lo enviaremos en un segundo paquete sin ningún coste adicional.

Solo dinos qué prefieres y nos ponemos con ello.

Gracias por esperar y por confiar en nosotros. Estamos pendientes de este pedido para que salga de nuestro almacén en cuanto llegue la reposición.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`,
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
  descatalogado: {
    etiqueta: "Producto descatalogado (ofrecer otro)",
    contexto:
      "El producto que pidió el cliente está descatalogado / ya no está disponible y no va a volver. Hay que disculparse, explicárselo con naturalidad y ofrecerle un producto alternativo parecido; si no le encaja, devolverle el dinero.",
    plantillaEjemplo: `Hola {nombre}! 😔 Tenemos que darte una noticia regular sobre tu pedido **{pedido}**: el producto que pediste ({producto descatalogado}) lo han **descatalogado** y ya no nos vuelve a entrar, una pena 😩 Como alternativa te podemos ofrecer **{producto alternativo}**, que es muy parecido y va genial ✨ Si te encaja te lo enviamos ya mismo y si prefieres te **devolvemos el dinero** sin ningún problema 💜 Dime qué prefieres!`,
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
      "Mensaje de WhatsApp: cortito (2-4 frases), tuteo directo, súper cercano y muy informal. CON emojis/iconos con naturalidad. SIN asunto ni firma. Si hay plantilla de referencia (que estará en versión email), quédate con su contenido y las opciones, pero hazlo mucho más corto e informal.",
  },
  email: {
    etiqueta: "Correo electrónico",
    formato:
      "Correo electrónico: SIN emojis. Empieza con una línea 'Asunto: ...' (que incluya el nombre del cliente y el nº de pedido), luego una línea en blanco y el cuerpo. Saluda ('¡Hola!, {nombre}.' o 'Hola {nombre},') y cierra en líneas separadas con 'Un saludo,' / 'Atención al Cliente' / 'La Tienda de Cosméticos'. Tono cercano y humano pero algo más cuidado que el WhatsApp, nunca acartonado. Si hay plantilla de referencia, sigue de cerca su estructura y contenido.",
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
${t.plantillaEjemplo ? `\nPlantilla de referencia (te marca el CONTENIDO y la SOLUCIÓN de este caso; el FORMATO — asunto, saludo, cierre y emojis — lo manda el "Formato del canal", no la plantilla). Varíala un poco para que no sea un copia-pega idéntico:\n"""\n${t.plantillaEjemplo}\n"""\n` : ""}
CANAL: ${c.etiqueta}
Formato del canal: ${c.formato}
${instruccionesExtra ? `\nINSTRUCCIONES ADICIONALES PARA ESTE CASO (tenlas muy en cuenta):\n${instruccionesExtra}\n` : ""}
ESTILO OBLIGATORIO:
- Tono cercano y humano, nada corporativo ni acartonado. El nivel exacto depende del canal (ver "Formato del canal"): WhatsApp muy informal; email cercano pero algo más cuidado.
- SIEMPRE menciona el nombre del cliente y el número de pedido en algún punto del mensaje.
- Usa **negritas** poniendo el texto entre dobles asteriscos (por ejemplo **el número de pedido**, **la solución que ofreces**, **el regalo**...). 2 o 3 negritas como mucho, para resaltar lo importante. En ambos canales.
- Emojis/iconos SEGÚN EL CANAL: en WhatsApp usa varios con naturalidad (📦 😊 🎁 🙏 ✨ 💜 😔 📸 ...); en EMAIL no uses ningún emoji.
- Ten en cuenta lo que ha escrito el cliente para responder acorde: si está enfadado, más empatía; si solo pregunta, más ligero.
- Ofrece siempre una solución o siguiente paso concreto (reponer, reembolsar, esperar reposición, pedir foto...).
- NO inventes datos que no te den (plazos exactos, nombres de empleados, políticas concretas) más allá de lo que aparece en la plantilla de referencia.
- Varía el saludo y el cierre cada vez, que no suene a copia-pega.
- Devuelve SOLO el texto del mensaje final, sin comillas ni explicaciones. Las negritas van con dobles asteriscos **así**.`;
}

function buildUserContent(body: {
  nombre?: string;
  pedido?: string;
  productoPendiente?: string;
  productoDescatalogado?: string;
  productoAlternativo?: string;
  mensajeCliente?: string;
}) {
  const lineas: string[] = [];
  if (body.nombre?.trim()) lineas.push(`Nombre del cliente: ${body.nombre.trim()}`);
  if (body.pedido?.trim()) lineas.push(`Número de pedido: ${body.pedido.trim()}`);
  if (body.productoPendiente?.trim())
    lineas.push(`Producto pendiente / que falta (causa del retraso): ${body.productoPendiente.trim()}`);
  if (body.productoDescatalogado?.trim())
    lineas.push(`Producto descatalogado que pidió: ${body.productoDescatalogado.trim()}`);
  if (body.productoAlternativo?.trim())
    lineas.push(`Producto alternativo que le ofrecemos: ${body.productoAlternativo.trim()}`);
  const mensaje = body.mensajeCliente?.trim();
  if (mensaje) {
    lineas.push(`Lo que ha escrito el cliente:\n${mensaje}`);
  } else {
    lineas.push("El cliente no ha escrito ningún mensaje concreto, solo se sabe el motivo de la reclamación.");
  }
  return lineas.join("\n");
}

// Días laborables (lunes-viernes) transcurridos desde la fecha de compra. null si no válida.
function diasLaborables(fecha?: string): number | null {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(d);
  cur.setDate(cur.getDate() + 1); // desde el día siguiente a la compra
  while (cur <= hoy) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Fecha (YYYY-MM-DD) en texto largo español, ej. "miércoles 5 de agosto". null si no válida.
function fechaLarga(fecha?: string): string | null {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
      .format(d)
      .replace(",", "");
  } catch {
    return fecha;
  }
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

  const diasLab = diasLaborables(body.fechaCompra);
  const regaloPorTardanza = tipo === "sin_stock" && diasLab !== null && diasLab > 5;

  const extras: string[] = [];
  if (tipo === "sin_stock") {
    if (body.variosProductos) {
      extras.push(
        "- El pedido lleva MÁS productos además del que falta: ofrécele la opción de enviarle YA lo que sí está disponible y mandarle el producto pendiente en un segundo paquete en cuanto nos llegue, sin coste adicional (con la fecha aproximada si se conoce); o, si prefiere, esperar y recibirlo todo junto. Que elija."
      );
    } else {
      extras.push(
        "- El pedido es SOLO el producto que falta (no hay más productos): NO ofrezcas 'enviar el resto del pedido', porque no hay nada más que mandar. Las opciones son esperar a que llegue la reposición (dile la fecha aproximada si se sabe) o devolverle el dinero."
      );
    }
  }
  if (regaloPorTardanza) {
    extras.push(
      "- Han pasado más de 5 días laborables desde la compra: además de disculparte por el retraso, dile que como agradecimiento por su paciencia, cuando reciba el paquete encontrará un **regalo/detalle** de nuestra parte. Con naturalidad y cariño."
    );
  }
  if (tipo === "descatalogado" && !body.productoAlternativo?.trim()) {
    extras.push(
      "- No se ha indicado un producto alternativo concreto: NO te inventes un nombre de producto. Dile que le buscamos/proponemos una alternativa parecida (sin nombrarla) y que, si prefiere, le devolvemos el dinero."
    );
  }
  const pideFoto = tipo === "equivocado" || tipo === "roto";
  const pideStock =
    pideFoto || tipo === "sin_stock" || tipo === "extraviado";
  const avisoInterno = tipo === "extraviado" && !body.hayStock;

  if (pideFoto) {
    const queFoto =
      tipo === "roto"
        ? "una foto del producto roto y de la caja tal cual le llegó"
        : "una foto del producto que le ha llegado por error";
    if (!body.fotoRecibida) {
      extras.push(
        `- Todavía NO nos ha enviado la foto: pídesela con naturalidad (${queFoto}) para poder gestionarlo. 📸`
      );
    } else {
      extras.push("- Ya tenemos la foto, así que NO le pidas ninguna foto.");
    }
  }
  if (pideStock) {
    if (tipo === "extraviado") {
      if (body.hayStock) {
        extras.push(
          "- SÍ tenemos otro en almacén: dile que **le enviamos otro hoy mismo**. 📦"
        );
      } else {
        extras.push(
          "- NO tenemos otro en almacén ahora mismo: discúlpate, dile que ya lo estamos gestionando y ofrécele reponérselo en cuanto lo tengamos o devolverle el dinero, lo que prefiera. NO prometas que sale hoy."
        );
      }
    } else if (body.hayStock) {
      extras.push(
        "- SÍ tenemos stock del producto: dile que **se lo enviamos hoy mismo**. 📦"
      );
    } else {
      const llegada = fechaLarga(body.fechaLlegada);
      if (llegada) {
        extras.push(
          `- Ahora mismo NO tenemos stock, pero la reposición nos entra el ${llegada}. Explícale que en cuanto nos llegue se lo enviamos, y que a él le llegaría aproximadamente **2 días laborables después**. NO prometas que sale hoy.`
        );
      } else {
        extras.push(
          "- NO tenemos stock ahora mismo: NO prometas que sale hoy; dile que se lo enviamos en cuanto vuelva a entrar en stock / lo repongamos, lo antes posible."
        );
      }
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
    return NextResponse.json({ texto, regaloPorTardanza, avisoInterno });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
