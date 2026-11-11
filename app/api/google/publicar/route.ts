import { NextRequest } from "next/server";
import { leerAjustes, llamarGoogle, negocioDe, NOMBRE_NEGOCIO, respuestaError } from "../../../_google/cliente";

// Publica una novedad en la ficha de Google (localPosts)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const negocio = negocioDe(body.negocio);
    const ficha = (await leerAjustes())[negocio]?.ficha;
    if (!ficha)
      return Response.json({ error: `Falta elegir la ficha de ${NOMBRE_NEGOCIO[negocio]} en «Conexión con Google».` }, { status: 400 });

    const texto = String(body.texto ?? "").trim();
    if (!texto) return Response.json({ error: "El texto está vacío" }, { status: 400 });
    if (texto.length > 1500) return Response.json({ error: "Google admite como máximo 1.500 caracteres" }, { status: 400 });

    const enlace = String(body.enlace ?? "").trim();
    const post: Record<string, unknown> = { languageCode: "es", summary: texto, topicType: "STANDARD" };
    if (enlace) {
      if (!/^https?:\/\/\S+$/.test(enlace)) return Response.json({ error: "El enlace no es válido" }, { status: 400 });
      post.callToAction = { actionType: body.boton === "BOOK" ? "BOOK" : "LEARN_MORE", url: enlace };
    }

    const r = await llamarGoogle<{ name: string; searchUrl?: string; state?: string }>(
      "ficha",
      `https://mybusiness.googleapis.com/v4/${ficha}/localPosts`,
      { method: "POST", body: post }
    );
    return Response.json({ ok: true, url: r.searchUrl ?? null, estado: r.state ?? null });
  } catch (e) {
    return respuestaError(e);
  }
}
