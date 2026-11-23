// Registro de actividad: quién hizo qué y cuándo. Se ve en Administración → Actividad.
// Se guardan los últimos 3.000 movimientos en KV (lista «suite-actividad»); en local, en memoria.
// Vale en el middleware (Edge) y en las rutas.

export type Movimiento = {
  t: string;          // fecha ISO
  u: string;          // usuario
  n?: string;         // nombre
  que: string;        // herramienta o acción («Entrar», «Pedidos a las marcas»…)
  det?: string;       // detalle: acción y datos principales
};

const KV_ACTIVIDAD = "suite-actividad";
const MAX = 3000;
const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const memoria: Movimiento[] = [];

export async function registrar(m: Omit<Movimiento, "t">): Promise<void> {
  const mov: Movimiento = { t: new Date().toISOString(), ...m };
  if (!USE_KV) { memoria.unshift(mov); memoria.length = Math.min(memoria.length, MAX); return; }
  try {
    const { kv } = await import("@vercel/kv");
    await kv.lpush(KV_ACTIVIDAD, mov);
    await kv.ltrim(KV_ACTIVIDAD, 0, MAX - 1);
  } catch { /* el registro nunca debe romper la herramienta */ }
}

export async function leerActividad(desde = 0, cuantos = 300): Promise<Movimiento[]> {
  if (!USE_KV) return memoria.slice(desde, desde + cuantos);
  const { kv } = await import("@vercel/kv");
  return (await kv.lrange<Movimiento>(KV_ACTIVIDAD, desde, desde + cuantos - 1)) ?? [];
}

// Nombre de cada herramienta según la ruta de la API (para el registro automático del middleware)
const HERRAMIENTAS: [string, string][] = [
  ["/api/comparar-competidores", "Comparar con la competencia"],
  ["/api/comparar-precios", "Comparar precios con Cosméticos24h"],
  ["/api/generate", "Ficha de producto"],
  ["/api/regenerate", "Ficha de producto"],
  ["/api/pack", "Ficha de pack"],
  ["/api/google-business", "Post para Google Business"],
  ["/api/google/publicar", "Google: publicar post"],
  ["/api/google/resenas", "Google: reseñas"],
  ["/api/google/ajustes", "Google: ajustes"],
  ["/api/google/desconectar", "Google: desconectar"],
  ["/api/google", "Google"],
  ["/api/informes", "Informe mensual"],
  ["/api/margen-productos", "Margen de cada producto"],
  ["/api/pedidos-marcas", "Pedidos a las marcas"],
  ["/api/reclamaciones", "Reclamaciones"],
  ["/api/responder-resenas", "Responder reseñas"],
  ["/api/revisar-fichas", "Revisar fichas"],
  ["/api/vigilar-comp", "Vigilar competidores"],
  ["/api/vigilar-novedades", "Vigilar novedades"],
  ["/api/vigilar", "Vigilar precios"],
];

export function herramientaDe(ruta: string): string {
  return HERRAMIENTAS.find(([p]) => ruta === p || ruta.startsWith(p + "/"))?.[1] ?? ruta;
}

// Campos del cuerpo que se apuntan como detalle (nunca textos largos ni datos de clientes)
const CAMPOS = ["action", "accion", "slug", "marca", "id", "estado", "competidor", "negocio", "descuento"];

export function detalleDe(metodo: string, cuerpo: unknown): string {
  const partes: string[] = [];
  if (cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo)) {
    for (const c of CAMPOS) {
      const v = (cuerpo as Record<string, unknown>)[c];
      if (v == null || typeof v === "object") continue;
      const s = String(v);
      partes.push(c === "action" || c === "accion" ? s : `${c}: ${s.length > 60 ? s.slice(0, 60) + "…" : s}`);
    }
  }
  if (!partes.length) partes.push(metodo === "DELETE" ? "borrar" : metodo === "PUT" || metodo === "PATCH" ? "cambiar" : "usar");
  return partes.join(" · ");
}
