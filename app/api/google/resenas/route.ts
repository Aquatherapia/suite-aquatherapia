import { NextRequest } from "next/server";
import { leerAjustes, llamarGoogle, negocioDe, NOMBRE_NEGOCIO, respuestaError } from "../../../_google/cliente";

export const dynamic = "force-dynamic";

type ResenaGoogle = {
  name: string;
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime?: string };
};

const ESTRELLAS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as Record<string, number>;

/** Google añade la traducción automática al texto: nos quedamos con el original. */
function limpiarComentario(c?: string) {
  if (!c) return "";
  const m = c.match(/\(Original\)\n([\s\S]*)$/);
  if (m) return m[1].trim();
  return c.replace(/\n*\(Translated by Google\)[\s\S]*$/, "").trim();
}

async function fichaDe(negocio: ReturnType<typeof negocioDe>) {
  const ficha = (await leerAjustes())[negocio]?.ficha;
  if (!ficha) throw Object.assign(new Error(`Falta elegir la ficha de ${NOMBRE_NEGOCIO[negocio]} en «Conexión con Google».`), { status: 400 });
  return ficha;
}

// Lista de reseñas de la ficha
export async function GET(req: NextRequest) {
  try {
    const negocio = negocioDe(req.nextUrl.searchParams.get("negocio"));
    const ficha = await fichaDe(negocio);
    const url = new URL(`https://mybusiness.googleapis.com/v4/${ficha}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    const pt = req.nextUrl.searchParams.get("pageToken");
    if (pt) url.searchParams.set("pageToken", pt);

    const r = await llamarGoogle<{
      reviews?: ResenaGoogle[];
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
    }>("ficha", url.toString());

    return Response.json({
      media: r.averageRating ?? null,
      total: r.totalReviewCount ?? 0,
      siguiente: r.nextPageToken ?? null,
      resenas: (r.reviews ?? []).map((v) => ({
        id: v.name,
        autor: v.reviewer?.isAnonymous ? "" : v.reviewer?.displayName ?? "",
        foto: v.reviewer?.profilePhotoUrl ?? null,
        estrellas: ESTRELLAS[v.starRating ?? ""] ?? 0,
        texto: limpiarComentario(v.comment),
        fecha: v.createTime,
        respuesta: v.reviewReply?.comment ?? null,
        fechaRespuesta: v.reviewReply?.updateTime ?? null,
      })),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 400) return Response.json({ error: (e as Error).message }, { status: 400 });
    return respuestaError(e);
  }
}

function comprobarId(id: unknown, ficha: string): id is string {
  return typeof id === "string" && id.startsWith(`${ficha}/reviews/`) && !id.includes("..");
}

// Publica o cambia la respuesta a una reseña
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const negocio = negocioDe(body.negocio);
    const ficha = await fichaDe(negocio);
    const comentario = String(body.respuesta ?? "").trim();
    if (!comprobarId(body.id, ficha)) return Response.json({ error: "Reseña no válida" }, { status: 400 });
    if (!comentario) return Response.json({ error: "La respuesta está vacía" }, { status: 400 });
    if (comentario.length > 4000) return Response.json({ error: "La respuesta es demasiado larga (máx. 4.000 caracteres)" }, { status: 400 });

    const r = await llamarGoogle<{ comment: string; updateTime: string }>(
      "ficha",
      `https://mybusiness.googleapis.com/v4/${body.id}/reply`,
      { method: "PUT", body: { comment: comentario } }
    );
    return Response.json({ ok: true, respuesta: r.comment, fechaRespuesta: r.updateTime });
  } catch (e) {
    if ((e as { status?: number }).status === 400) return Response.json({ error: (e as Error).message }, { status: 400 });
    return respuestaError(e);
  }
}

// Borra la respuesta publicada
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const negocio = negocioDe(body.negocio);
    const ficha = await fichaDe(negocio);
    if (!comprobarId(body.id, ficha)) return Response.json({ error: "Reseña no válida" }, { status: 400 });
    await llamarGoogle("ficha", `https://mybusiness.googleapis.com/v4/${body.id}/reply`, { method: "DELETE" });
    return Response.json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 400) return Response.json({ error: (e as Error).message }, { status: 400 });
    return respuestaError(e);
  }
}
