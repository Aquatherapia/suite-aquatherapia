// Límite de intentos fallidos en el login: 5 fallos desde la misma conexión (IP) bloquean 15 minutos.
// Se guarda en Upstash KV si está configurado; si no (en local), en memoria.

export const MAX_FALLOS = 5;
export const BLOQUEO_SEGUNDOS = 15 * 60;

const USE_KV = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
const memoria = new Map<string, { n: number; hasta: number }>();
const claveKv = (ip: string) => `login-fallos:${ip}`;

export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] || req.headers.get("x-real-ip") || "desconocida").trim();
}

export async function fallos(ip: string): Promise<number> {
  if (USE_KV) {
    try {
      const { kv } = await import("@vercel/kv");
      return (await kv.get<number>(claveKv(ip))) ?? 0;
    } catch { /* si KV falla, se sigue con la memoria */ }
  }
  const m = memoria.get(ip);
  return m && m.hasta > Date.now() ? m.n : 0;
}

export async function apuntarFallo(ip: string): Promise<number> {
  if (USE_KV) {
    try {
      const { kv } = await import("@vercel/kv");
      const n = await kv.incr(claveKv(ip));
      if (n === 1 || n === MAX_FALLOS) await kv.expire(claveKv(ip), BLOQUEO_SEGUNDOS);
      return n;
    } catch { /* memoria */ }
  }
  const m = memoria.get(ip);
  const n = m && m.hasta > Date.now() ? m.n + 1 : 1;
  memoria.set(ip, { n, hasta: Date.now() + BLOQUEO_SEGUNDOS * 1000 });
  return n;
}

export async function borrarFallos(ip: string): Promise<void> {
  memoria.delete(ip);
  if (USE_KV) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.del(claveKv(ip));
    } catch { /* nada */ }
  }
}
