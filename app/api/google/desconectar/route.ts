import { borrarConexion, leerConexion } from "../../../_google/cliente";

export async function POST() {
  const c = await leerConexion();
  if (c) {
    // Retira el permiso en Google (si falla, se borra igual)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST" }).catch(() => {});
  }
  await borrarConexion();
  return Response.json({ ok: true });
}
