import { NextRequest, NextResponse, after } from "next/server";
import { autorizado, lanzarPaso } from "../../revisar-fichas/autorizar";
import { guardarEstado, leerEstado, nuevaPasada, pasadaCortada, pasadaEnCurso, paso } from "../../revisar-fichas/revision";

// Revisión de las fichas de nuestra web. La lanza Vercel Cron cada mañana (vercel.json) o el botón «Revisar ahora».
// Cada llamada hace un paso de unos 4 minutos y, si quedan fichas, llama a la siguiente con ?id=<pasada>.
// Responde enseguida y trabaja después (after), así la cadena no espera a que acabe cada paso.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let id = req.nextUrl.searchParams.get("id");

  if (!id) {
    // Llamada de Vercel Cron: pasada nueva, salvo que ya haya una en marcha
    const e = await leerEstado();
    if (pasadaEnCurso(e)) return NextResponse.json({ ok: true, enCurso: e.pasada!.id });
    // Si la anterior se quedó a medias hace poco, se sigue por donde iba; si no, pasada nueva
    if (pasadaCortada(e)) e.pasada!.actualizado = new Date().toISOString();
    else e.pasada = nuevaPasada("cron");
    await guardarEstado(e);
    id = e.pasada!.id;
  }

  const base = req.nextUrl.origin;
  const pasada = id;
  after(async () => {
    let quedan = false;
    try { quedan = await paso(pasada); } catch { /* se retoma sola al abrir la página */ }
    if (quedan) await lanzarPaso(base, pasada);
  });
  return NextResponse.json({ ok: true, id });
}
