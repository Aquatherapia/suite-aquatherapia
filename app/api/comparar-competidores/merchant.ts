// Competidores que propone Google: el informe «Visibilidad frente a la competencia» de Merchant Center
// (Merchant API, tabla competitive_visibility_competitor_view). Google lo da por país y categoría de producto,
// no por marca: se piden las categorías de cosmética y se juntan las webs que salen.
import { ErrorGoogle, llamarGoogle } from "../../_google/cliente";

// Categorías de Google (taxonomía de productos) en las que vendemos
export const CATEGORIAS: { id: number; nombre: string }[] = [
  { id: 567, nombre: "Cuidado de la piel" },
  { id: 2975, nombre: "Cosmética" },
  { id: 486, nombre: "Cuidado del cabello" },
  { id: 2915, nombre: "Cuidado personal" },
  { id: 469, nombre: "Salud y belleza" },
];

export type Propuesta = {
  dominio: string;
  web: string;
  categorias: string[];
  // Lo mejor de cada dato entre las categorías en las que sale
  rank: number;              // puesto en visibilidad (1 = el que más se ve)
  coincidencia: number;      // de las búsquedas en las que salimos, en cuántas sale también él (0-1)
  porEncima: number;         // de esas, en cuántas sale por encima de nosotros (0-1)
  visibilidad: number;       // su visibilidad respecto a la nuestra (1 = igual)
};

type Fila = {
  domain?: string; isYourDomain?: boolean; rank?: string | number;
  pageOverlapRate?: number; higherPositionRate?: number; relativeVisibility?: number;
};

const dia = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function buscar(cuenta: string, query: string): Promise<Fila[]> {
  const out: Fila[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    let data: { results?: { competitiveVisibilityCompetitorView?: Fila }[]; nextPageToken?: string };
    try {
      data = await llamarGoogle("merchant", `https://merchantapi.googleapis.com/reports/v1beta/accounts/${cuenta}/reports:search`, { method: "POST", body: { query, pageSize: 1000, pageToken } });
    } catch (e) {
      // v1beta retirada: se prueba v1
      if (!/404|not found|JSON|Unexpected token/i.test(e instanceof Error ? e.message : "")) throw e;
      data = await llamarGoogle("merchant", `https://merchantapi.googleapis.com/reports/v1/accounts/${cuenta}/reports:search`, { method: "POST", body: { query, pageSize: 1000, pageToken } });
    }
    for (const r of data.results ?? []) if (r.competitiveVisibilityCompetitorView) out.push(r.competitiveVisibilityCompetitorView);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// Webs que compiten con nosotros en Google Shopping (España, últimos 30 días), de más a menos peligrosas
export async function competidoresDeGoogle(cuenta: string): Promise<{ propuestas: Propuesta[]; avisos: string[] }> {
  const id = cuenta.replace(/\D/g, "");
  if (!id) throw new ErrorGoogle("Falta el número de cuenta de Merchant Center.", 400);
  const porDominio = new Map<string, Propuesta>();
  const avisos: string[] = [];
  let algunaBien = false;
  for (const cat of CATEGORIAS) {
    for (const fuente of ["ORGANIC", "ADS"]) {
      const query = `SELECT domain, is_your_domain, rank, page_overlap_rate, higher_position_rate, relative_visibility
        FROM competitive_visibility_competitor_view
        WHERE date BETWEEN '${dia(33)}' AND '${dia(3)}'
        AND report_country_code = 'ES' AND report_category_id = ${cat.id} AND traffic_source = '${fuente}'`;
      let filas: Fila[];
      try { filas = await buscar(id, query); algunaBien = true; }
      catch (e) {
        // Sin conexión o sin permiso: no tiene sentido seguir con las demás categorías
        if (!(e instanceof ErrorGoogle) || e.status === 401 || /no está activada|no tiene permiso/.test(e.message)) throw e;
        avisos.push(`${cat.nombre} (${fuente === "ADS" ? "anuncios" : "gratuitos"}): ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      for (const f of filas) {
        if (!f.domain || f.isYourDomain) continue;
        const dominio = f.domain.toLowerCase().replace(/^www\./, "");
        const p = porDominio.get(dominio) ?? { dominio, web: `https://${f.domain.toLowerCase()}`, categorias: [], rank: 999, coincidencia: 0, porEncima: 0, visibilidad: 0 };
        if (!p.categorias.includes(cat.nombre)) p.categorias.push(cat.nombre);
        p.rank = Math.min(p.rank, Number(f.rank ?? 999));
        p.coincidencia = Math.max(p.coincidencia, f.pageOverlapRate ?? 0);
        p.porEncima = Math.max(p.porEncima, f.higherPositionRate ?? 0);
        p.visibilidad = Math.max(p.visibilidad, f.relativeVisibility ?? 0);
        porDominio.set(dominio, p);
      }
    }
  }
  if (!algunaBien && avisos.length) throw new ErrorGoogle(`Google no ha devuelto el informe: ${avisos[0]}`, 502);
  // Fuera los grandes que no son tiendas de cosmética con las que comparar (marketplaces)
  const GRANDES = /(^|\.)(amazon|ebay|aliexpress|miravia|temu|shein|carrefour|elcorteingles|google|facebook|instagram|youtube|wallapop)\./;
  const propuestas = [...porDominio.values()].filter(p => !GRANDES.test(`.${p.dominio}`))
    .sort((a, b) => b.coincidencia - a.coincidencia || a.rank - b.rank);
  return { propuestas, avisos };
}
