import { credencialesPuestas, leerAjustes, leerConexion } from "../../../_google/cliente";

export const dynamic = "force-dynamic";

export async function GET() {
  const credenciales = credencialesPuestas();
  try {
    const conexion = await leerConexion();
    const ajustes = await leerAjustes();
    return Response.json({
      credenciales,
      conectado: Boolean(conexion),
      email: conexion?.email,
      conectadoEl: conexion?.conectadoEl,
      ajustes,
    });
  } catch {
    return Response.json({ credenciales, conectado: false, ajustes: {}, error: "No se pudo leer la base de datos (Upstash KV)." });
  }
}
