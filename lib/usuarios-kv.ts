// Lista de usuarios de la Suite guardada en Upstash KV (clave «suite-usuarios»). Este archivo vale también
// en el middleware (Edge): no usa el disco. En local, sin KV, la lista vive en data/usuarios.json (lib/usuarios.ts).

export type Rol = "admin" | "equipo";

export type Usuario = {
  usuario: string;        // nombre de entrada, en minúsculas (p. ej. «andrea»)
  nombre: string;         // nombre para mostrar
  rol: Rol;               // admin: entra en Administración
  hash: string;           // contraseña cifrada (scrypt)
  activo: boolean;        // false = dado de baja
  version: number;        // sube al cambiar contraseña, rol o baja: cierra sus sesiones abiertas
  creado: string;
  ultimoAcceso?: string;
};

export type Usuarios = Record<string, Usuario>;

export const KV_USUARIOS = "suite-usuarios";
export const USE_KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export async function leerUsuariosKv(): Promise<Usuarios> {
  const { kv } = await import("@vercel/kv");
  return (await kv.get<Usuarios>(KV_USUARIOS)) ?? {};
}

// Para el middleware: se consulta como mucho cada 20 s por instancia, para no gastar comandos de KV.
// Con «fresco» se vuelve a leer (lo usa el middleware antes de rechazar una sesión, por si la lista cambió).
let cache: { datos: Usuarios; hasta: number } | null = null;
export async function usuariosConCache(fresco = false): Promise<Usuarios | null> {
  if (!USE_KV) return null; // en local no se comprueba (no hay KV en el middleware)
  if (cache && cache.hasta > Date.now() && !fresco) return cache.datos;
  try {
    const datos = await leerUsuariosKv();
    cache = { datos, hasta: Date.now() + 20_000 };
    return datos;
  } catch {
    return cache?.datos ?? null;
  }
}
