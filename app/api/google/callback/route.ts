import { NextRequest, NextResponse } from "next/server";
import { canjearCodigo, emailDeIdToken, guardarConexion, leerConexion } from "../../../_google/cliente";

// Google vuelve aquí después de dar permiso
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const volver = (q: string) => {
    const res = NextResponse.redirect(new URL(`/conexion-google?${q}`, req.url));
    res.cookies.delete("google_oauth_state");
    return res;
  };

  if (p.get("error")) return volver("error=cancelado");
  const state = req.cookies.get("google_oauth_state")?.value;
  if (!state || state !== p.get("state")) return volver("error=estado");

  try {
    const tok = await canjearCodigo(p.get("code") ?? "", req.nextUrl.origin);
    let refresh = tok.refresh_token;
    if (!refresh) refresh = (await leerConexion())?.refreshToken; // reconexión sin token nuevo
    if (!refresh) return volver("error=sin-refresh");
    await guardarConexion({
      refreshToken: refresh,
      email: emailDeIdToken(tok.id_token),
      conectadoEl: new Date().toISOString(),
      scopes: tok.scope,
    });
    return volver("ok=1");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return volver(`error=${encodeURIComponent(msg)}`);
  }
}
