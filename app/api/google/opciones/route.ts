import { llamarGoogle, respuestaError, leerConexion } from "../../../_google/cliente";

export const dynamic = "force-dynamic";

type Cuenta = { name: string; accountName?: string; type?: string };
type Ubicacion = { name: string; title?: string; storefrontAddress?: { locality?: string; addressLines?: string[] } };

// Lista lo que la cuenta conectada puede ver: fichas, propiedades de Search Console y de GA4
export async function GET() {
  try {
    if (!(await leerConexion())) return Response.json({ error: "Sin conectar" }, { status: 401 });
  } catch (e) {
    return respuestaError(e);
  }

  // Fichas, con diagnóstico por cuenta: si la lista sale vacía, se ve qué cuentas ve la Suite y qué devolvió cada una
  type Diag = { nombre: string; tipo: string; fichas: number; error?: string };
  const cuentasDiag: Diag[] = [];
  let errorCuentas = "";
  const fichas = (async () => {
    const lista: { id: string; nombre: string; cuenta: string }[] = [];
    let accounts: Cuenta[] = [];
    try {
      accounts = (await llamarGoogle<{ accounts?: Cuenta[] }>(
        "ficha",
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20"
      )).accounts ?? [];
    } catch (e) {
      errorCuentas = e instanceof Error ? e.message : "Error";
      throw e;
    }
    for (const cuenta of accounts) {
      const d: Diag = { nombre: cuenta.accountName ?? cuenta.name, tipo: cuenta.type ?? "", fichas: 0 };
      cuentasDiag.push(d);
      try {
        let pageToken = "";
        do {
          const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${cuenta.name}/locations`);
          url.searchParams.set("readMask", "name,title,storefrontAddress");
          url.searchParams.set("pageSize", "100");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const r = await llamarGoogle<{ locations?: Ubicacion[]; nextPageToken?: string }>("ficha", url.toString());
          for (const l of r.locations ?? []) {
            const ciudad = l.storefrontAddress?.locality;
            d.fichas++;
            lista.push({
              id: `${cuenta.name}/${l.name}`,
              nombre: `${l.title ?? l.name}${ciudad ? ` · ${ciudad}` : ""}`,
              cuenta: d.nombre,
            });
          }
          pageToken = r.nextPageToken ?? "";
        } while (pageToken);
      } catch (e) {
        d.error = e instanceof Error ? e.message : "Error";
      }
    }
    return lista;
  })();

  const sitios = llamarGoogle<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(
    "sc",
    "https://www.googleapis.com/webmasters/v3/sites"
  ).then((r) =>
    (r.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
      .map((s) => ({ id: s.siteUrl, nombre: s.siteUrl.replace(/^sc-domain:/, "Dominio: ") }))
  );

  const propiedades = llamarGoogle<{
    accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[];
  }>("ga", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200").then((r) =>
    (r.accountSummaries ?? []).flatMap((a) =>
      (a.propertySummaries ?? []).map((p) => ({ id: p.property, nombre: `${p.displayName} (${a.displayName})` }))
    )
  );

  const [f, s, p] = await Promise.allSettled([fichas, sitios, propiedades]);
  const res = <T,>(r: PromiseSettledResult<T>) =>
    r.status === "fulfilled" ? { lista: r.value } : { error: r.reason instanceof Error ? r.reason.message : "Error" };
  // El número del proyecto de Google Cloud va al principio del ID de cliente: sirve para comprobar que es el aprobado
  const proyecto = process.env.GOOGLE_CLIENT_ID?.match(/^(\d+)-/)?.[1] ?? null;
  return Response.json({
    fichas: { ...res(f), diagnostico: { proyecto, cuentas: cuentasDiag, errorCuentas: errorCuentas || undefined } },
    sitios: res(s),
    propiedades: res(p),
  });
}
