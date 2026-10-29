import { NextRequest, NextResponse, after } from "next/server";

// Revisión diaria del comparador de precios (Vercel Cron, ver vercel.json).
// Cada llamada revisa una marca (puede tardar varios minutos) y luego llama a la siguiente: ?i=0, ?i=1…
// Responde enseguida y trabaja después (after), así la llamada a la siguiente no espera a toda la cadena.
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const SITE_PASSWORD = process.env.SITE_PASSWORD;

// Vercel Cron manda «Authorization: Bearer CRON_SECRET» si esa variable existe.
// Las llamadas de la cadena llevan la contraseña de la web. Sin CRON_SECRET, el primer paso
// se reconoce por el user-agent de Vercel Cron.
function autorizado(req: NextRequest): boolean {
  if (CRON_SECRET && req.headers.get("authorization") === `Bearer ${CRON_SECRET}`) return true;
  if (SITE_PASSWORD && req.headers.get("x-clave") === SITE_PASSWORD) return true;
  if (!SITE_PASSWORD && !CRON_SECRET) return true; // en local
  return !CRON_SECRET && (req.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const i = Number(req.nextUrl.searchParams.get("i") ?? "0");
  const base = req.nextUrl.origin;
  const cookie = SITE_PASSWORD ? `suite_auth=${SITE_PASSWORD}` : "";

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
      await fetch(`${base}/api/cron/comparar-precios?i=${i + 1}`, { headers: SITE_PASSWORD ? { "x-clave": SITE_PASSWORD } : {}, cache: "no-store" }).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, i });
}
