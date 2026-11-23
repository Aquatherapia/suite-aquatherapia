import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, DURACION_SESION, crearToken } from "../../../../lib/acceso";
import { registrar } from "../../../../lib/actividad";
import {
  MIN_CONTRASENA, RESERVADOS, USUARIO_VALIDO, cifrar, guardarUsuarios, leerUsuarios, normalizar, quien, sinHash,
  type Rol, type Usuarios,
} from "../../../../lib/usuarios";

// Administración de usuarios. El middleware ya solo deja pasar a administradores.

const lista = (u: Usuarios) =>
  Object.values(u).map(sinHash).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

const error = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status });

// Que siempre quede al menos un administrador activo
const adminsActivos = (u: Usuarios) => Object.values(u).filter(x => x.rol === "admin" && x.activo).length;

export async function GET() {
  return NextResponse.json({ usuarios: lista(await leerUsuarios()) });
}

export async function POST(req: NextRequest) {
  const yo = quien(req);
  const body = await req.json().catch(() => ({})) as {
    accion?: string; usuario?: string; nombre?: string; contrasena?: string; rol?: Rol; activo?: boolean;
  };
  const usuarios = await leerUsuarios();
  const arranque = !Object.keys(usuarios).length;
  const id = normalizar(body.usuario ?? "");
  const u = usuarios[id];
  let detalle = "";

  if (body.accion === "crear") {
    const nombre = (body.nombre ?? "").trim();
    const rol: Rol = arranque ? "admin" : body.rol === "admin" ? "admin" : "equipo";
    if (!USUARIO_VALIDO.test(id)) return error("El usuario solo puede llevar letras sin tildes, números, punto, guion o guion bajo (de 2 a 30).");
    if (RESERVADOS.has(id)) return error(`«${id}» está reservado: elige otro nombre de usuario.`);
    if (u) return error("Ya existe un usuario con ese nombre.");
    if (!nombre) return error("Falta el nombre.");
    if ((body.contrasena ?? "").length < MIN_CONTRASENA) return error(`La contraseña tiene que tener al menos ${MIN_CONTRASENA} caracteres.`);
    usuarios[id] = { usuario: id, nombre, rol, hash: await cifrar(body.contrasena!), activo: true, version: 1, creado: new Date().toISOString() };
    detalle = `alta de ${nombre} (${id}, ${rol === "admin" ? "administrador" : "equipo"})`;
  } else {
    if (!u) return error("No existe ese usuario.", 404);
    if (body.accion === "contrasena") {
      if ((body.contrasena ?? "").length < MIN_CONTRASENA) return error(`La contraseña tiene que tener al menos ${MIN_CONTRASENA} caracteres.`);
      u.hash = await cifrar(body.contrasena!);
      detalle = `contraseña nueva para ${u.nombre}`;
    } else if (body.accion === "rol") {
      const rol: Rol = body.rol === "admin" ? "admin" : "equipo";
      if (u.rol === "admin" && rol !== "admin" && u.activo && adminsActivos(usuarios) <= 1) return error("Tiene que quedar al menos un administrador.");
      u.rol = rol;
      detalle = `${u.nombre} pasa a ${rol === "admin" ? "administrador" : "equipo"}`;
    } else if (body.accion === "activo") {
      if (id === yo.usuario && !body.activo) return error("No puedes darte de baja a ti mismo.");
      if (!body.activo && u.rol === "admin" && adminsActivos(usuarios) <= 1) return error("Tiene que quedar al menos un administrador.");
      u.activo = !!body.activo;
      detalle = `${u.activo ? "alta de nuevo" : "baja"} de ${u.nombre}`;
    } else if (body.accion === "borrar") {
      if (id === yo.usuario) return error("No puedes borrarte a ti mismo.");
      if (u.rol === "admin" && u.activo && adminsActivos(usuarios) <= 1) return error("Tiene que quedar al menos un administrador.");
      delete usuarios[id];
      detalle = `borrado ${u.nombre} (${id})`;
    } else {
      return error("Acción desconocida.");
    }
    // Contraseña, rol o baja cierran sus sesiones abiertas
    if (usuarios[id]) usuarios[id].version += 1;
  }

  await guardarUsuarios(usuarios);
  await registrar({ u: yo.usuario, n: yo.nombre, que: "Administración", det: detalle });
  const res = NextResponse.json({ ok: true, usuarios: lista(usuarios) });

  // Al crear el primer usuario se cierra la entrada de arranque: se entra ya como ese usuario
  if (arranque) {
    const n = usuarios[id];
    res.cookies.set(COOKIE_SESION, await crearToken("sesion", DURACION_SESION, { u: n.usuario, v: n.version, r: n.rol, n: n.nombre }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_SESION,
    });
  }
  // Si me cambio a mí mismo la contraseña o el rol, renuevo mi sesión para no echarme
  if (!arranque && id === yo.usuario && usuarios[id]) {
    const n = usuarios[id];
    res.cookies.set(COOKIE_SESION, await crearToken("sesion", DURACION_SESION, { u: n.usuario, v: n.version, r: n.rol, n: n.nombre }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_SESION,
    });
  }
  return res;
}
