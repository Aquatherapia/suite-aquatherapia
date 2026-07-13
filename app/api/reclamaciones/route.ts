import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

const TIPOS = {
  extraviado: {
    etiqueta: "Envío extraviado / no llega (ya salió)",
    contexto:
      "El pedido ya salió de nuestras instalaciones pero el cliente dice que no le ha llegado. Hay que investigar y abrir una reclamación con la empresa de transporte.",
  },
  sin_stock: {
    etiqueta: "Retraso: no ha salido de almacén (rotura de stock)",
    contexto:
      "El pedido todavía no ha salido porque falta stock de algún producto. Somos nosotros quienes avisamos al cliente y le damos opciones.",
  },
  contrareembolso: {
    etiqueta: "Contrarreembolso recibido de vuelta",
    contexto:
      "Un envío contrarreembolso no se ha podido entregar y vuelve de camino a nuestras instalaciones. Hay que ofrecer volver a enviarlo.",
  },
  roto: {
    etiqueta: "Producto llegado roto / dañado",
    contexto:
      "El producto ha llegado roto o dañado. Según si el cliente ya ha enviado fotos y si hay que recoger el producto, la gestión cambia.",
  },
  equivocado: {
    etiqueta: "Producto equivocado (enviado mal)",
    contexto:
      "Le hemos enviado un producto distinto al que pidió. La culpa es nuestra.",
  },
  descatalogado: {
    etiqueta: "Producto descatalogado (ofrecer otro)",
    contexto:
      "El producto que pidió está descatalogado y no volverá a entrar. Hay que ofrecerle alternativas o el reembolso.",
  },
  otro: {
    etiqueta: "Otro / reclamación general",
    contexto:
      "Cualquier otra reclamación que no encaje en las anteriores. Sin plantilla fija: escuchar la queja y ofrecer solución con el mismo tono cercano.",
  },
} as const;

type TipoKey = keyof typeof TIPOS;

// ───────────────────────── Plantillas (texto real del cliente) ─────────────────────────
// Placeholders entre {llaves}: se rellenan con los datos aportados; si falta alguno,
// la IA lo adapta con naturalidad (nunca deja las llaves ni inventa datos concretos).

const TPL_SIN_STOCK = `Asunto: {nombre}, tenemos una pequeña actualización sobre tu pedido #{pedido}

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
La Tienda de Cosméticos`;

const TPL_EXTRAVIADO = `Asunto: {nombre}, ya hemos revisado tu pedido #{pedido}

¡Hola, {nombre}!

¿Cómo es posible que tu pedido todavía no esté en tus manos? La verdad es que esto no suele pasar, así que en cuanto hemos recibido tu mensaje nos hemos puesto a investigar.

Vemos que {incidencia del transporte}.

Como el pedido ya debería haberse entregado, hemos puesto en marcha una reclamación con la empresa de transporte para que revisen qué ha podido pasar. Normalmente suelen respondernos en un plazo de 24 a 72 horas laborables.

En cuanto tengamos una respuesta, nos pondremos en contacto contigo para contarte qué ha ocurrido y, sobre todo, darte una solución lo antes posible.

Mientras tanto, vamos a seguir muy de cerca esta gestión hasta que el pedido llegue a tus manos.

Gracias por avisarnos. Esperamos escribirte muy pronto con buenas noticias.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_CONTRA_1 = `Asunto: {nombre}, tenemos una pequeña actualización sobre tu pedido #{pedido}

¡Hola, {nombre}!

Hemos estado revisando el seguimiento de tu pedido #{pedido} y la empresa de transporte nos indica que {incidencia}.

Como se trata de un envío contrarreembolso, el pedido ya viene de camino de vuelta a nuestras instalaciones.

Si sigues interesado en recibirlo, no te preocupes, podemos prepararlo de nuevo y enviártelo otra vez por contrarreembolso, sin problema.

Solo tienes que responder a este correo confirmándonos que quieres que lo volvamos a enviar y, en cuanto lo recibamos de vuelta, nos pondremos con ello.

Esperamos que esta vez sí consiga llegar a su destino.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_CONTRA_2 = `Asunto: {nombre}, vamos a hacer que esta vez tu pedido llegue sin problemas

¡Hola, {nombre}!

Hemos estado revisando tu pedido #{pedido} y la empresa de transporte nos indica que {incidencia}, por lo que el paquete ya viene de camino de vuelta a nuestras instalaciones.

Además, al revisar tu historial de pedidos, hemos visto que esta situación ya nos ocurrió en una ocasión anterior.

Como nuestra prioridad es que recibas tu pedido y evitar que vuelva a pasar lo mismo, en este caso necesitaremos que el pedido esté abonado antes de volver a enviarlo.

En cuanto el paquete llegue de nuevo a nuestro almacén, podremos prepararlo otra vez para que salga lo antes posible.

Si quieres que lo gestionemos, solo tienes que responder a este correo y te indicaremos cómo realizar el pago para ponerlo en marcha.

Esperamos que esta vez el pedido llegue a tus manos sin más rodeos.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_ROTO_1 = `Asunto: {nombre}, vamos a solucionarlo #{pedido}

¡Hola, {nombre}!

Vaya... ese no era precisamente el estado en el que queríamos que recibieras tu pedido.

Para poder gestionar la incidencia lo antes posible, necesitamos que nos envíes unas fotografías donde podamos ver el estado en el que ha llegado el producto. Si también puedes incluir una foto del embalaje, mucho mejor, ya que nos ayudará a revisar qué ha podido ocurrir durante el transporte.

En cuanto las recibamos, revisaremos la incidencia y nos pondremos con la solución para que puedas disfrutar de tu pedido cuanto antes.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_ROTO_2 = `Asunto: {nombre}, ya estamos preparando la solución #{pedido}

¡Hola, {nombre}!

Vaya... ese no era precisamente el estado en el que queríamos que recibieras tu pedido.

Ya hemos revisado las fotografías y vamos a solucionarlo.

En este caso necesitamos recoger el producto, así que vamos a gestionar una recogida y entrega simultánea. Es decir, el mismo repartidor que te entregará la nueva unidad será quien recoja el producto dañado.

Y no te preocupes por la etiqueta o por preparar el envío, nosotros nos encargamos de todo. El repartidor llevará la etiqueta de devolución, así que solo tendrás que tener el producto correctamente embalado para que pueda recogerlo.

En cuanto tengamos la gestión organizada, te escribiremos con todos los detalles.

Nosotros nos encargamos del resto para que puedas olvidarte de la parte complicada.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_ROTO_3 = `Asunto: {nombre}, ya lo tenemos solucionado #{pedido}

¡Hola, {nombre}!

Vaya... ese no era precisamente el estado en el que queríamos que recibieras tu pedido.

Ya hemos revisado las fotografías y, para que no tengas que esperar más, vamos a preparar una nueva unidad para que salga hacia tu dirección lo antes posible.

En cuanto el pedido salga de nuestras instalaciones, recibirás un correo con toda la información del envío.

Esperamos que esta vez llegue en perfecto estado.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_EQUIV_1 = `Asunto: {nombre}, vamos a revisar tu pedido #{pedido}

¡Hola, {nombre}!

¡Oh, no! Esto no tenía que haber pasado.

Vamos a revisarlo para que puedas recibir el producto correcto lo antes posible.

¿Podrías enviarnos una fotografía del producto que has recibido? Si en la imagen también aparece el código del producto, mucho mejor, ya que nos ayudará a comprobar qué ha ocurrido.

En cuanto la recibamos, revisaremos la incidencia y la solucionaremos cuanto antes.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_EQUIV_2 = `Asunto: {nombre}, ya estamos preparando la solución de tu #{pedido}

¡Hola, {nombre}!

¡Oh, no! Esto no tenía que haber pasado.

Ya hemos revisado las fotografías y vamos a preparar el envío del producto correcto.

Además, para que no tengas que preocuparte por nada, gestionaremos una recogida y entrega simultánea. El mismo repartidor que te entregue el producto correcto recogerá el que has recibido por error.

Y no te preocupes por la etiqueta de devolución. Nosotros nos encargamos de todo: el repartidor la llevará preparada, así que solo tendrás que tener el producto correctamente embalado para que pueda recogerlo.

En cuanto tengamos la gestión organizada, te escribiremos con todos los detalles.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

const TPL_DESCAT = `Asunto: {nombre}, tenemos una actualización sobre tu pedido #{pedido}

¡Hola, {nombre}!

Mientras preparábamos tu pedido nos hemos encontrado con algo que no esperábamos.

Al ir a preparar {producto}, hemos comprobado que se habían agotado las últimas unidades. Al intentar reponerlo, la marca nos ha confirmado que el producto ya está descatalogado, por lo que no podremos volver a recibirlo.

Sabemos que no es la noticia que esperabas, y créenos que a nosotros tampoco nos gusta tener que dar este tipo de noticias.

Pero no queremos dejarte sin una solución. Así que, si te parece bien, podemos ofrecerte cualquiera de estas alternativas para que no te quedes sin el tratamiento que buscabas:
- {alternativa 1}
- {alternativa 2}

Si alguna de ellas encaja contigo, nos encargaremos de hacer el cambio. Y si prefieres otra opción, estaremos encantados de ayudarte a encontrar el producto que mejor se adapte a lo que buscabas.

Solo dinos qué prefieres y nos ponemos con ello.

Un saludo,
Atención al Cliente
La Tienda de Cosméticos`;

type Body = {
  nombre?: string;
  pedido?: string;
  canal?: string;
  tipo?: string;
  productoPendiente?: string;
  variosProductos?: boolean;
  fechaCompra?: string;
  fechaLlegada?: string;
  incidencia?: string;
  hayStock?: boolean;
  contraRepetido?: boolean;
  fotoRecibida?: boolean;
  hayQueRecoger?: boolean;
  productoAlternativo?: string;
  productoDescatalogado?: string;
  alternativa1?: string;
  alternativa2?: string;
  mensajeCliente?: string;
};

function plantillaPara(tipo: TipoKey, body: Body): string {
  switch (tipo) {
    case "sin_stock":
      return TPL_SIN_STOCK;
    case "extraviado":
      return TPL_EXTRAVIADO;
    case "contrareembolso":
      return body.contraRepetido ? TPL_CONTRA_2 : TPL_CONTRA_1;
    case "roto":
      if (!body.fotoRecibida) return TPL_ROTO_1;
      return body.hayQueRecoger ? TPL_ROTO_2 : TPL_ROTO_3;
    case "equivocado":
      return body.fotoRecibida ? TPL_EQUIV_2 : TPL_EQUIV_1;
    case "descatalogado":
      return TPL_DESCAT;
    default:
      return "";
  }
}

const CANALES = {
  whatsapp: {
    etiqueta: "WhatsApp",
    formato:
      "Mensaje de WhatsApp: cortito (2-4 frases), tuteo directo, súper cercano y muy informal. CON emojis/iconos con naturalidad. SIN asunto ni firma. Si hay plantilla de referencia (que estará en versión email), quédate con su contenido y la solución, pero hazlo mucho más corto e informal.",
  },
  email: {
    etiqueta: "Correo electrónico",
    formato:
      "Correo electrónico: reproduce la plantilla de referencia CASI TAL CUAL, palabra por palabra. Tu única tarea es: (1) rellenar los datos entre {llaves} con lo que te den; (2) aplicar las 'instrucciones adicionales' si las hay. NO reformules el resto del texto, NO añadas frases nuevas, NO añadas negritas ni emojis. Mantén su línea 'Asunto: ...', su saludo y su cierre 'Un saludo,' / 'Atención al Cliente' / 'La Tienda de Cosméticos'. Si falta el dato de alguna {llave}, adáptala con naturalidad o quita esa parte, sin dejar huecos.",
  },
} as const;

type CanalKey = keyof typeof CANALES;

function systemPrompt(
  tipo: TipoKey,
  canal: CanalKey,
  plantilla: string,
  instruccionesExtra: string
) {
  const t = TIPOS[tipo];
  const c = CANALES[canal];
  return `Eres quien lleva la atención al cliente de La Tienda de Cosméticos (latiendadecosmeticos.com), una tienda online de cosmética y dermocosmética.

Tu tarea es redactar la RESPUESTA a la reclamación de un cliente, para enviársela directamente.

TIPO DE RECLAMACIÓN: ${t.etiqueta}
Contexto de esta situación: ${t.contexto}
${plantilla ? `\nPlantilla de referencia. Los datos entre {llaves} debes rellenarlos con los datos que te den más abajo; si falta alguno, adáptalo con naturalidad o quítalo, pero NUNCA dejes las {llaves} escritas ni inventes datos concretos. Cómo de fiel ser a esta plantilla depende del canal (ver "Formato del canal"): en EMAIL se reproduce casi literal; en WhatsApp se coge su contenido y solución pero se hace más corto e informal:\n"""\n${plantilla}\n"""\n` : ""}
CANAL: ${c.etiqueta}
Formato del canal: ${c.formato}
${instruccionesExtra ? `\nINSTRUCCIONES ADICIONALES PARA ESTE CASO (tenlas muy en cuenta):\n${instruccionesExtra}\n` : ""}
ESTILO OBLIGATORIO:
- SIEMPRE menciona el nombre del cliente y el número de pedido en algún punto del mensaje.
- Emojis y negritas SOLO en WhatsApp: allí usa varios emojis con naturalidad (📦 😊 🎁 🙏 ✨ 💜 😔 📸 ...) y alguna **negrita** (dobles asteriscos) para resaltar 1-2 cosas, con tono muy informal y cercano. En EMAIL: ni emojis ni negritas añadidas — respeta la plantilla tal cual.
- Ten en cuenta lo que ha escrito el cliente para responder acorde: si está enfadado, más empatía; si solo pregunta, más ligero.
- Ofrece siempre la solución o siguiente paso concreto de la plantilla.
- NO inventes datos que no te den (plazos exactos, nombres de empleados, políticas concretas) más allá de lo que aparece en la plantilla.
- Devuelve SOLO el texto del mensaje final, sin comillas ni explicaciones. Las negritas van con dobles asteriscos **así**.`;
}

function buildUserContent(body: Body, fechaEstimadaTxt: string | null) {
  const lineas: string[] = [];
  if (body.nombre?.trim()) lineas.push(`Nombre del cliente: ${body.nombre.trim()}`);
  if (body.pedido?.trim()) lineas.push(`Número de pedido: ${body.pedido.trim()}`);
  if (body.productoPendiente?.trim())
    lineas.push(`Producto pendiente / que falta (causa del retraso): ${body.productoPendiente.trim()}`);
  if (fechaEstimadaTxt)
    lineas.push(`Fecha estimada de reposición: ${fechaEstimadaTxt}`);
  if (body.incidencia?.trim())
    lineas.push(`Lo que indica el seguimiento / incidencia del transporte: ${body.incidencia.trim()}`);
  if (body.productoDescatalogado?.trim())
    lineas.push(`Producto descatalogado que pidió: ${body.productoDescatalogado.trim()}`);
  if (body.alternativa1?.trim())
    lineas.push(`Alternativa 1 que le ofrecemos: ${body.alternativa1.trim()}`);
  if (body.alternativa2?.trim())
    lineas.push(`Alternativa 2 que le ofrecemos: ${body.alternativa2.trim()}`);
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
  const body: Body = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Sin clave Gemini" }, { status: 500 });

  const tipo: TipoKey = (body.tipo && body.tipo in TIPOS
    ? body.tipo
    : "otro") as TipoKey;
  const canal: CanalKey = body.canal === "email" ? "email" : "whatsapp";

  if (!body.nombre?.trim() || !body.pedido?.trim()) {
    return NextResponse.json(
      { error: "Faltan el nombre del cliente o el número de pedido" },
      { status: 400 }
    );
  }

  const fechaEstimadaTxt =
    tipo === "sin_stock" ? fechaLarga(body.fechaLlegada) : null;
  const diasLab = diasLaborables(body.fechaCompra);
  const regaloPorTardanza =
    tipo === "sin_stock" && diasLab !== null && diasLab > 5;
  const avisoInterno = tipo === "extraviado" && body.hayStock === false;
  const pideStockAlt =
    tipo === "roto" ||
    tipo === "equivocado" ||
    tipo === "contrareembolso" ||
    tipo === "extraviado";

  const extras: string[] = [];
  if (pideStockAlt && body.hayStock === false) {
    if (body.productoAlternativo?.trim()) {
      extras.push(
        `- NO tenemos el producto en stock para enviárselo: ofrécele como alternativa **${body.productoAlternativo.trim()}** y, si no le encaja, el reembolso.`
      );
    } else {
      extras.push(
        "- NO tenemos el producto en stock para enviárselo: ofrécele una alternativa parecida (SIN inventarte un nombre concreto) y, si prefiere, el reembolso."
      );
    }
  }
  if (tipo === "sin_stock") {
    if (body.variosProductos) {
      extras.push(
        "- El pedido lleva MÁS productos además del que falta: mantén las DOS opciones de la plantilla (esperar y recibirlo todo junto, o enviarle ya lo disponible y el pendiente en un segundo paquete sin coste)."
      );
    } else {
      extras.push(
        "- El pedido es SOLO el producto que falta (no hay más productos): NO ofrezcas 'enviar el resto del pedido', porque no hay nada más que mandar. Las opciones son esperar a que llegue la reposición o devolverle el dinero. Adapta la plantilla a esto."
      );
    }
    if (!body.fechaLlegada) {
      extras.push(
        "- No se conoce la fecha estimada de reposición: no des una fecha concreta; di simplemente que la esperamos lo antes posible / en cuanto nos la confirme el proveedor."
      );
    }
    if (body.productoAlternativo?.trim()) {
      extras.push(
        `- Como alternativa a esperar la reposición, ofrécele también **${body.productoAlternativo.trim()}** (un producto parecido que sí tenemos disponible), por si prefiere no esperar.`
      );
    }
  }
  if (regaloPorTardanza) {
    extras.push(
      "- Han pasado más de 5 días laborables desde la compra: añade que, como agradecimiento por su paciencia, cuando reciba el paquete encontrará un **regalo/detalle** de nuestra parte. Con naturalidad y cariño."
    );
  }
  if (tipo === "descatalogado" && !body.alternativa1?.trim() && !body.alternativa2?.trim()) {
    extras.push(
      "- No se han indicado alternativas concretas: NO te inventes nombres de productos. Dile que le proponemos/buscamos alternativas parecidas y que, si prefiere, le devolvemos el dinero."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const texto = await llamarGemini(
      genAI,
      systemPrompt(tipo, canal, plantillaPara(tipo, body), extras.join("\n")),
      buildUserContent(body, fechaEstimadaTxt)
    );
    return NextResponse.json({ texto, regaloPorTardanza, avisoInterno });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar" },
      { status: 500 }
    );
  }
}
