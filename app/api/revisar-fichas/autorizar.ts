import type { NextRequest } from "next/server";

// Quién puede lanzar un paso de la revisión de fichas (la ruta /api/cron/ no pasa por la clave de la web):
// - Vercel Cron, que manda «Authorization: Bearer CRON_SECRET» (hay que poner CRON_SECRET en Vercel).
// - La propia app al encadenar los pasos, con la clave de la web en «x-clave».
// En local, sin ninguna de las dos variables, pasa todo.
export function autorizado(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  const clave = process.env.SITE_PASSWORD;
  if (cron && req.headers.get("authorization") === `Bearer ${cron}`) return true;
  if (clave && req.headers.get("x-clave") === clave) return true;
  return !cron && !clave;
}

export const cabeceraClave = (): Record<string, string> =>
  process.env.SITE_PASSWORD ? { "x-clave": process.env.SITE_PASSWORD } : {};
