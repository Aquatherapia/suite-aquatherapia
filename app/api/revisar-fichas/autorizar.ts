import { cabeceraInterna } from "../../../lib/acceso";

// Quién puede lanzar un paso de la revisión de fichas: ver autorizadoCron en lib/acceso.ts
// (Vercel Cron con CRON_SECRET, o la propia app con un token interno firmado).
export { autorizadoCron as autorizado } from "../../../lib/acceso";

// Lanza (sin esperar) el siguiente paso de la pasada «id» en otra llamada a la ruta del cron
export async function lanzarPaso(origen: string, id: string): Promise<void> {
  return fetch(`${origen}/api/cron/revisar-fichas?id=${encodeURIComponent(id)}`, { headers: await cabeceraInterna(), cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .then(() => {}).catch(() => {});
}
