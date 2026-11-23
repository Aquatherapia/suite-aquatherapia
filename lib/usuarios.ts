// Usuarios de la Suite (solo rutas de Node: usa scrypt y, en local, el disco).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { KV_USUARIOS, USE_KV, leerUsuariosKv, type Rol, type Usuario, type Usuarios } from "./usuarios-kv";

export type { Rol, Usuario, Usuarios };

const ARCHIVO = path.join(process.cwd(), "data", "usuarios.json");

function scrypt(pw: string, sal: Buffer): Promise<Buffer> {
  return new Promise((ok, mal) => scryptCb(pw, sal, 64, (e, h) => (e ? mal(e) : ok(h))));
}

export async function leerUsuarios(): Promise<Usuarios> {
  if (USE_KV) return leerUsuariosKv();
  try { return JSON.parse(await fs.readFile(ARCHIVO, "utf-8")); } catch { return {}; }
}

export async function guardarUsuarios(u: Usuarios): Promise<void> {
  if (USE_KV) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_USUARIOS, u);
    return;
  }
  await fs.mkdir(path.dirname(ARCHIVO), { recursive: true });
  await fs.writeFile(ARCHIVO, JSON.stringify(u, null, 2));
}

export async function cifrar(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scrypt(contrasena, sal);
  return ["scrypt", sal.toString("hex"), h.toString("hex")].join(":");
}

// Siempre hace el cálculo, aunque el usuario no exista, para que no se note por el tiempo de respuesta
const SAL_FALSA = "0".repeat(32);
export async function comprobar(contrasena: string, hash: string | undefined): Promise<boolean> {
  const [tipo, salHex, hHex] = (hash ?? `scrypt:${SAL_FALSA}:`).split(":");
  if (tipo !== "scrypt" || !salHex) return false;
  const h = await scrypt(contrasena, Buffer.from(salHex, "hex"));
  const esperado = Buffer.from(hHex ?? "", "hex");
  return hash !== undefined && esperado.length === h.length && timingSafeEqual(h, esperado);
}

export const normalizar = (u: string) => u.trim().toLowerCase();
export const USUARIO_VALIDO = /^[a-z0-9._-]{2,30}$/;
// «admin» sí se puede crear (la entrada de arranque deja de valer en cuanto existe algún usuario)
export const RESERVADOS = new Set(["sistema"]);
export const MIN_CONTRASENA = 8;

export function sinHash(u: Usuario): Omit<Usuario, "hash"> {
  const { hash: _h, ...resto } = u; // eslint-disable-line @typescript-eslint/no-unused-vars
  return resto;
}

// Quién hace la petición: lo pone el middleware tras comprobar la sesión (y borra lo que venga de fuera)
export function quien(req: NextRequest): { usuario: string; rol: string; nombre: string } {
  return {
    usuario: req.headers.get("x-suite-usuario") ?? "",
    rol: req.headers.get("x-suite-rol") ?? "",
    nombre: decodeURIComponent(req.headers.get("x-suite-nombre") ?? ""),
  };
}
