// Conexión con las APIs de Google (Perfil de Empresa, Search Console y GA4).
// Solo se usa en el servidor. El token de la cuenta se guarda en Upstash KV.

export type Negocio = "tienda" | "aquatherapia";
export const NEGOCIOS: Negocio[] = ["tienda", "aquatherapia"];
export const NOMBRE_NEGOCIO: Record<Negocio, string> = {
  tienda: "La Tienda de Cosméticos",
  aquatherapia: "Aquatherapia",
};

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  // Merchant Center (Merchant API): visibilidad frente a la competencia
  "https://www.googleapis.com/auth/content",
];

export type AjustesNegocio = {
  /** Ficha en formato v4: accounts/123/locations/456 */
  ficha?: string;
  fichaNombre?: string;
  /** Propiedad de Search Console: sc-domain:… o https://… */
  sitio?: string;
  /** Propiedad de GA4: properties/123 */
  propiedad?: string;
  propiedadNombre?: string;
};
export type Ajustes = Partial<Record<Negocio, AjustesNegocio>>;

type Conexion = {
  refreshToken: string;
  email?: string;
  conectadoEl: string;
  scopes?: string;
};

const K_CONEXION = "google-conexion";
const K_AJUSTES = "google-ajustes";
const K_TOKEN = "google-access-token";

async function kv() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

export function credencialesPuestas() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;
}

export async function leerConexion(): Promise<Conexion | null> {
  return (await (await kv()).get<Conexion>(K_CONEXION)) ?? null;
}

export async function guardarConexion(c: Conexion) {
  await (await kv()).set(K_CONEXION, c);
}

export async function borrarConexion() {
  const k = await kv();
  await k.del(K_CONEXION);
  await k.del(K_TOKEN);
}

export async function leerAjustes(): Promise<Ajustes> {
  return (await (await kv()).get<Ajustes>(K_AJUSTES)) ?? {};
}

export async function guardarAjustes(a: Ajustes) {
  await (await kv()).set(K_AJUSTES, a);
}

export async function canjearCodigo(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Google no aceptó el código");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
    scope?: string;
  };
}

/** Saca el email del id_token (sin verificar la firma: lo acabamos de recibir de Google por HTTPS). */
export function emailDeIdToken(idToken?: string) {
  if (!idToken) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload.email as string | undefined;
  } catch {
    return undefined;
  }
}

export class ErrorGoogle extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/** Token de acceso vigente de la cuenta conectada (se renueva solo). Úsalo para llamar a cualquier API de Google incluida en SCOPES. */
export async function tokenDeAcceso(): Promise<string> {
  const k = await kv();
  const cache = await k.get<{ token: string; caduca: number }>(K_TOKEN);
  if (cache && cache.caduca > Date.now() + 60_000) return cache.token;

  const conexion = await leerConexion();
  if (!conexion) throw new ErrorGoogle("La Suite no está conectada con Google. Conéctala en «Conexión con Google».", 401);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conexion.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant")
      throw new ErrorGoogle("Google ha cerrado la conexión (permiso retirado o caducado). Vuelve a conectar en «Conexión con Google».", 401);
    throw new ErrorGoogle(data.error_description || data.error || "No se pudo renovar el acceso a Google", 502);
  }
  await k.set(K_TOKEN, { token: data.access_token, caduca: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

/** Traduce los errores de Google a algo que se entienda. */
function explicarError(api: string, status: number, data: unknown): string {
  const err = (data as { error?: { message?: string; status?: string; details?: unknown[] } })?.error;
  const msg = err?.message ?? "";
  const NOMBRES: Record<string, string> = { sc: "Search Console", ga: "Google Analytics", merchant: "Merchant Center", ficha: "Perfil de Empresa" };
  if (api === "ficha" && (status === 429 || /quota|Quota/.test(msg) || /has not been used|is disabled/.test(msg))) {
    return "Google todavía no ha dado acceso a la API de Perfil de Empresa (o falta activarla en Google Cloud). En cuanto aprueben la solicitud, funcionará sin tocar nada.";
  }
  if (/has not been used|is disabled|SERVICE_DISABLED/.test(msg)) {
    return `La API de ${NOMBRES[api] ?? "Google"} no está activada en el proyecto de Google Cloud. Actívala en «APIs y servicios → Biblioteca».`;
  }
  if (status === 403) return `La cuenta conectada no tiene permiso para esto en ${NOMBRES[api]}. Si es un permiso nuevo, vuelve a conectar en «Conexión con Google».`;
  // Merchant API: el proyecto de Google Cloud tiene que estar registrado una vez en la cuenta de Merchant Center
  if (api === "merchant" && /not registered with the merchant account/i.test(msg)) return `SIN_REGISTRAR: ${msg}`;
  if (status === 401) return "Google ha rechazado el acceso. Vuelve a conectar en «Conexión con Google».";
  return msg || `Error ${status} de Google`;
}

export async function llamarGoogle<T = unknown>(
  api: "ficha" | "sc" | "ga" | "merchant",
  url: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await tokenDeAcceso();
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : {};
  if (!res.ok) throw new ErrorGoogle(explicarError(api, res.status, data), res.status === 401 ? 401 : 502);
  return data as T;
}

export function respuestaError(e: unknown) {
  const status = e instanceof ErrorGoogle ? e.status : 500;
  const mensaje = e instanceof Error ? e.message : "Error con Google";
  return Response.json({ error: mensaje }, { status });
}

export function negocioDe(v: unknown): Negocio {
  return v === "aquatherapia" ? "aquatherapia" : "tienda";
}

// ── Fechas ──
export function isoDia(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function haceDias(n: number, desde = new Date()) {
  const d = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
/** Periodo actual y anterior de la misma duración, terminando `retraso` días antes de hoy. */
export function periodos(dias: number, retraso: number) {
  const fin = haceDias(retraso);
  const inicio = haceDias(retraso + dias - 1);
  const finAnt = haceDias(retraso + dias);
  const inicioAnt = haceDias(retraso + 2 * dias - 1);
  return {
    actual: { inicio: isoDia(inicio), fin: isoDia(fin) },
    anterior: { inicio: isoDia(inicioAnt), fin: isoDia(finAnt) },
  };
}
