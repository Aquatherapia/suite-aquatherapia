import { NextRequest } from "next/server";
import { Ajustes, guardarAjustes, NEGOCIOS } from "../../../_google/cliente";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Ajustes;
  const limpio: Ajustes = {};
  for (const n of NEGOCIOS) {
    const a = body[n];
    if (!a) continue;
    limpio[n] = {
      ficha: a.ficha && /^accounts\/[^/]+\/locations\/[^/]+$/.test(a.ficha) ? a.ficha : undefined,
      fichaNombre: a.fichaNombre?.slice(0, 200),
      sitio: a.sitio?.slice(0, 300) || undefined,
      propiedad: a.propiedad && /^properties\/\d+$/.test(a.propiedad) ? a.propiedad : undefined,
      propiedadNombre: a.propiedadNombre?.slice(0, 200),
    };
  }
  await guardarAjustes(limpio);
  return Response.json({ ok: true, ajustes: limpio });
}
