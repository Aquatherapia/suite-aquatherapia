// Acceso a la Suite: tokens firmados en lugar de guardar la contraseña en la cookie.
// Funciona igual en el middleware (Edge) y en las rutas (Node): solo usa Web Crypto.
//
// Un token es «v1.<propósito>.<caduca en ms>.<datos de la sesión>.<firma>», firmado con HMAC-SHA256. La clave de firma sale de
// SESSION_SECRET si existe; si no, de SITE_PASSWORD junto con KV_REST_API_TOKEN. Cambiar la contraseña
// de la web invalida todas las sesiones abiertas.

export const COOKIE_SESION = "suite_auth";
export const DURACION_SESION = 60 * 60 * 24 * 30; // 30 días, en segundos

type Proposito = "sesion" | "interno";

const enc = new TextEncoder();

function secreto(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!process.env.SITE_PASSWORD) return null;
  return `${process.env.SITE_PASSWORD}|${process.env.KV_REST_API_TOKEN ?? ""}`;
}

async function clave(): Promise<CryptoKey | null> {
  const s = secreto();
  if (!s) return null;
  return crypto.subtle.importKey("raw", enc.encode(`suite-acceso:${s}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function aBase64url(buf: ArrayBuffer | Uint8Array): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// Quién va en la sesión: usuario, versión (cambia al dar de baja o cambiar la contraseña) y rol
export type Sesion = { u: string; v: number; r: "admin" | "equipo" | "sistema"; n?: string };

// Crea un token que caduca en «segundos». Sin contraseña configurada (en local) devuelve "".
export async function crearToken(proposito: Proposito, segundos: number, sesion?: Sesion): Promise<string> {
  const k = await clave();
  if (!k) return "";
  const datos = sesion ? aBase64url(enc.encode(JSON.stringify(sesion))) : "-";
  const cuerpo = `v1.${proposito}.${Date.now() + segundos * 1000}.${datos}`;
  const firma = await crypto.subtle.sign("HMAC", k, enc.encode(cuerpo));
  return `${cuerpo}.${aBase64url(firma)}`;
}

// Comprueba la firma (en tiempo constante), el propósito y la caducidad. Devuelve los datos o null.
async function leerToken(token: string | null | undefined, proposito: Proposito): Promise<{ sesion: Sesion | null } | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 5 || partes[0] !== "v1" || partes[1] !== proposito) return null;
  const caduca = Number(partes[2]);
  if (!Number.isFinite(caduca) || caduca < Date.now()) return null;
  const firma = deBase64url(partes[4]);
  const k = await clave();
  if (!firma || !k) return null;
  if (!(await crypto.subtle.verify("HMAC", k, firma, enc.encode(partes.slice(0, 4).join("."))))) return null;
  if (partes[3] === "-") return { sesion: null };
  try {
    const bytes = deBase64url(partes[3]);
    const s = bytes && JSON.parse(new TextDecoder().decode(bytes));
    return s && typeof s.u === "string" && typeof s.v === "number" ? { sesion: s as Sesion } : null;
  } catch {
    return null;
  }
}

export async function tokenValido(token: string | null | undefined, proposito: Proposito): Promise<boolean> {
  return (await leerToken(token, proposito)) !== null;
}

export async function leerSesion(token: string | null | undefined): Promise<Sesion | null> {
  return (await leerToken(token, "sesion"))?.sesion ?? null;
}

// Solo rutas de esta misma web al volver del login: nada de «https://otra-web», «//otra-web» ni «/\otra-web».
export function rutaInterna(destino: string | null | undefined): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(destino)) return "/";
  try {
    const u = new URL(destino, "https://suite.invalid");
    if (u.origin !== "https://suite.invalid") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

// ── Rutas /api/cron/ (no pasan por el login) ────────────────────────────
// Pueden entrar:
// - Vercel Cron, que manda «Authorization: Bearer CRON_SECRET». Sin CRON_SECRET en Vercel, la revisión
//   programada no arranca: ya no vale fingir el user-agent de Vercel.
// - La propia app al encadenar pasos o con el botón «Revisar ahora», con un token interno firmado
//   de 15 minutos en «x-interno» (no la contraseña).
// - En local (sin SITE_PASSWORD ni CRON_SECRET, fuera de producción), todo.
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function autorizadoCron(req: Request): Promise<boolean> {
  const cron = process.env.CRON_SECRET;
  if (cron && igualSeguro(req.headers.get("authorization") ?? "", `Bearer ${cron}`)) return true;
  if (await tokenValido(req.headers.get("x-interno"), "interno")) return true;
  if (!cron && !process.env.SITE_PASSWORD && process.env.NODE_ENV !== "production") return true;
  if (!cron && !req.headers.get("x-interno")) console.warn("[cron] Llamada rechazada: falta CRON_SECRET en las variables de Vercel.");
  return false;
}

export async function cabeceraInterna(): Promise<Record<string, string>> {
  const t = await crearToken("interno", 15 * 60);
  return t ? { "x-interno": t } : {};
}

// Cookie de sesión para que una ruta del cron llame a otra ruta protegida de la app
export async function cookieInterna(): Promise<string> {
  const t = await crearToken("sesion", 15 * 60, { u: "sistema", v: 0, r: "sistema" });
  return t ? `${COOKIE_SESION}=${t}` : "";
}
