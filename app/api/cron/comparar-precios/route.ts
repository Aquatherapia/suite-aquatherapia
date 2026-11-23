import { NextRequest, NextResponse, after } from "next/server";
import { autorizadoCron, cabeceraInterna, cookieInterna } from "../../../../lib/acceso";

// Revisión diaria del comparador de precios (Vercel Cron, ver vercel.json).
// Cada llamada revisa una marca (puede tardar varios minutos) y luego llama a la siguiente: ?i=0, ?i=1…
// Responde enseguida y trabaja después (after), así la llamada a la siguiente no espera a toda la cadena.
export const maxDuration = 300;

// Quién puede llamar: ver autorizadoCron en lib/acceso.ts (Vercel Cron con CRON_SECRET o la propia app
// con un token interno firmado). Las llamadas a /api/comparar-precios llevan una cookie de sesión firmada.

export async function GET(req: NextRequest) {
  if (!(await autorizadoCron(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const i = Number(req.nextUrl.searchParams.get("i") ?? "0");
  const base = req.nextUrl.origin;
  const cookie = await cookieInterna();

  after(async () => {
    const config = await fetch(`${base}/api/comparar-precios`, { headers: { cookie }, cache: "no-store" }).then(r => r.json()) as { marcas: { slug: string }[] };
    const marca = config.marcas[i];
    if (!marca) return;
    await fetch(`${base}/api/comparar-precios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ action: "revisar", slug: marca.slug }),
      cache: "no-store",
    }).catch(() => { /* si una marca falla, se sigue con la siguiente */ });
    if (i + 1 < config.marcas.length) {
      await fetch(`${base}/api/cron/comparar-precios?i=${i + 1}`, { headers: await cabeceraInterna(), cache: "no-store" }).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, i });
}
