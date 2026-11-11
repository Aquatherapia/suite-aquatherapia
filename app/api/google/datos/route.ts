import { NextRequest } from "next/server";
import {
  AjustesNegocio,
  leerAjustes,
  llamarGoogle,
  negocioDe,
  NOMBRE_NEGOCIO,
  periodos,
  respuestaError,
} from "../../../_google/cliente";

export const dynamic = "force-dynamic";

type Formato = "num" | "pct" | "eur" | "pos" | "dec";
type Kpi = { nombre: string; actual: number | null; anterior: number | null; formato: Formato; mejorSiBaja?: boolean; nota?: string };
type Celda = string | number | null;
type Tabla = { titulo: string; columnas: { nombre: string; formato?: Formato }[]; filas: Celda[][]; nota?: string };
type Datos = {
  periodo: { actual: { inicio: string; fin: string }; anterior: { inicio: string; fin: string } };
  kpis: Kpi[];
  serie?: { nombre: string; formato: Formato; puntos: { fecha: string; valor: number }[] };
  tablas: Tabla[];
  avisos: string[];
};

// ───────────── Ficha de Google (Business Profile Performance) ─────────────
const METRICAS_FICHA = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
] as const;

function fechaParams(url: URL, prefijo: string, iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  url.searchParams.set(`${prefijo}.year`, String(y));
  url.searchParams.set(`${prefijo}.month`, String(m));
  url.searchParams.set(`${prefijo}.day`, String(d));
}

async function datosFicha(a: AjustesNegocio, dias: number): Promise<Datos> {
  if (!a.ficha) throw new Error("Falta elegir la ficha en «Conexión con Google».");
  const p = periodos(dias, 3); // Google tarda unos días en dar las cifras de la ficha
  const ubicacion = a.ficha.split("/").slice(2).join("/"); // locations/123
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/${ubicacion}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of METRICAS_FICHA) url.searchParams.append("dailyMetrics", m);
  fechaParams(url, "dailyRange.startDate", p.anterior.inicio);
  fechaParams(url, "dailyRange.endDate", p.actual.fin);

  type Serie = {
    dailyMetric: string;
    timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] };
  };
  const r = await llamarGoogle<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: Serie[] }[] }>("ficha", url.toString());

  // metrica -> fecha -> valor
  const porMetrica: Record<string, Record<string, number>> = {};
  for (const bloque of r.multiDailyMetricTimeSeries ?? [])
    for (const s of bloque.dailyMetricTimeSeries ?? []) {
      const mapa = (porMetrica[s.dailyMetric] ??= {});
      for (const v of s.timeSeries?.datedValues ?? []) {
        const f = `${v.date.year}-${String(v.date.month).padStart(2, "0")}-${String(v.date.day).padStart(2, "0")}`;
        mapa[f] = (mapa[f] ?? 0) + Number(v.value ?? 0);
      }
    }
  const suma = (metricas: readonly string[], ini: string, fin: string) => {
    let t = 0;
    for (const m of metricas) for (const [f, v] of Object.entries(porMetrica[m] ?? {})) if (f >= ini && f <= fin) t += v;
    return t;
  };
  const IMPRESIONES = METRICAS_FICHA.filter((m) => m.startsWith("BUSINESS_IMPRESSIONS"));
  const kpi = (nombre: string, metricas: readonly string[], nota?: string): Kpi => ({
    nombre,
    actual: suma(metricas, p.actual.inicio, p.actual.fin),
    anterior: suma(metricas, p.anterior.inicio, p.anterior.fin),
    formato: "num",
    nota,
  });

  const puntos: { fecha: string; valor: number }[] = [];
  for (let d = new Date(p.actual.inicio + "T00:00:00Z"); d <= new Date(p.actual.fin + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const f = d.toISOString().slice(0, 10);
    puntos.push({ fecha: f, valor: suma(IMPRESIONES, f, f) });
  }

  const desglose: Tabla = {
    titulo: "Dónde te ven",
    columnas: [{ nombre: "Sitio" }, { nombre: "Visualizaciones", formato: "num" }, { nombre: "Periodo anterior", formato: "num" }],
    filas: [
      ["Búsqueda de Google · móvil", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"],
      ["Búsqueda de Google · ordenador", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"],
      ["Google Maps · móvil", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"],
      ["Google Maps · ordenador", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"],
    ].map(([nombre, m]) => [nombre, suma([m], p.actual.inicio, p.actual.fin), suma([m], p.anterior.inicio, p.anterior.fin)]),
  };

  const datos: Datos = {
    periodo: p,
    kpis: [
      kpi("Visualizaciones de la ficha", IMPRESIONES, "Veces que se ha mostrado en Búsqueda y Maps (personas únicas por día)"),
      kpi("Clics a la web", ["WEBSITE_CLICKS"]),
      kpi("Llamadas", ["CALL_CLICKS"]),
      kpi("Cómo llegar", ["BUSINESS_DIRECTION_REQUESTS"]),
      kpi("Mensajes", ["BUSINESS_CONVERSATIONS"]),
      kpi("Reservas", ["BUSINESS_BOOKINGS"]),
    ].filter((k, i) => i < 4 || (k.actual ?? 0) + (k.anterior ?? 0) > 0),
    serie: { nombre: "Visualizaciones por día", formato: "num", puntos },
    tablas: [desglose],
    avisos: ["Google publica las cifras de la ficha con unos días de retraso: el periodo termina hace 3 días."],
  };

  // Búsquedas que muestran la ficha: el último mes completo
  try {
    const hoy = new Date();
    const mes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
    const kw = new URL(`https://businessprofileperformance.googleapis.com/v1/${ubicacion}/searchkeywords/impressions/monthly`);
    for (const pre of ["monthlyRange.startMonth", "monthlyRange.endMonth"]) {
      kw.searchParams.set(`${pre}.year`, String(mes.getUTCFullYear()));
      kw.searchParams.set(`${pre}.month`, String(mes.getUTCMonth() + 1));
    }
    const rk = await llamarGoogle<{
      searchKeywordsCounts?: { searchKeyword: string; insightsValue?: { value?: string; threshold?: string } }[];
    }>("ficha", kw.toString());
    const nombreMes = mes.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    datos.tablas.unshift({
      titulo: `Búsquedas con las que aparece la ficha (${nombreMes})`,
      columnas: [{ nombre: "Búsqueda" }, { nombre: "Visualizaciones" }],
      filas: (rk.searchKeywordsCounts ?? [])
        .slice(0, 25)
        .map((k) => [k.searchKeyword, k.insightsValue?.value ? Number(k.insightsValue.value) : `< ${k.insightsValue?.threshold ?? 15}`]),
      nota: "Google no da la cifra exacta de las búsquedas con pocas visualizaciones.",
    });
  } catch {
    /* sin palabras clave: no es grave */
  }
  return datos;
}

// ───────────── Search Console ─────────────
type FilaSC = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function consultaSC(sitio: string, cuerpo: Record<string, unknown>) {
  const r = await llamarGoogle<{ rows?: FilaSC[] }>(
    "sc",
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(sitio)}/searchAnalytics/query`,
    { method: "POST", body: { dataState: "final", ...cuerpo } }
  );
  return r.rows ?? [];
}

async function datosSearchConsole(a: AjustesNegocio, dias: number): Promise<Datos> {
  if (!a.sitio) throw new Error("Falta elegir la propiedad de Search Console en «Conexión con Google».");
  const p = periodos(dias, 3);
  const rango = (x: { inicio: string; fin: string }) => ({ startDate: x.inicio, endDate: x.fin });
  const [tot, totAnt, porDia, consultas, paginas] = await Promise.all([
    consultaSC(a.sitio, rango(p.actual)),
    consultaSC(a.sitio, rango(p.anterior)),
    consultaSC(a.sitio, { ...rango(p.actual), dimensions: ["date"] }),
    consultaSC(a.sitio, { ...rango(p.actual), dimensions: ["query"], rowLimit: 25 }),
    consultaSC(a.sitio, { ...rango(p.actual), dimensions: ["page"], rowLimit: 15 }),
  ]);
  const t = tot[0];
  const ta = totAnt[0];
  // Con menos de ~100 impresiones, la posición media no es una señal (regla de marketing)
  const pos = (f: FilaSC) => (f.impressions >= 100 ? Math.round(f.position * 10) / 10 : null);

  return {
    periodo: p,
    kpis: [
      { nombre: "Clics", actual: t?.clicks ?? 0, anterior: ta?.clicks ?? 0, formato: "num" },
      { nombre: "Impresiones", actual: t?.impressions ?? 0, anterior: ta?.impressions ?? 0, formato: "num" },
      { nombre: "CTR medio", actual: t ? t.ctr : null, anterior: ta ? ta.ctr : null, formato: "pct" },
      {
        nombre: "Posición media",
        actual: t ? pos(t) : null,
        anterior: ta ? pos(ta) : null,
        formato: "pos",
        mejorSiBaja: true,
        nota: "Con menos de 100 impresiones no se muestra: no es una señal fiable.",
      },
    ],
    serie: { nombre: "Clics por día", formato: "num", puntos: porDia.map((f) => ({ fecha: f.keys![0], valor: f.clicks })) },
    tablas: [
      {
        titulo: "Búsquedas que traen clics",
        columnas: [
          { nombre: "Búsqueda" },
          { nombre: "Clics", formato: "num" },
          { nombre: "Impresiones", formato: "num" },
          { nombre: "CTR", formato: "pct" },
          { nombre: "Posición", formato: "pos" },
        ],
        filas: consultas.map((f) => [f.keys![0], f.clicks, f.impressions, f.ctr, pos(f)]),
        nota: "La posición solo se muestra con 100 impresiones o más.",
      },
      {
        titulo: "Páginas con más clics",
        columnas: [
          { nombre: "Página" },
          { nombre: "Clics", formato: "num" },
          { nombre: "Impresiones", formato: "num" },
          { nombre: "CTR", formato: "pct" },
          { nombre: "Posición", formato: "pos" },
        ],
        filas: paginas.map((f) => [f.keys![0].replace(/^https?:\/\/(www\.)?/, ""), f.clicks, f.impressions, f.ctr, pos(f)]),
      },
    ],
    avisos: ["Search Console tarda 2 o 3 días en cerrar los datos: el periodo termina hace 3 días."],
  };
}

// ───────────── Google Analytics 4 ─────────────
type InformeGA = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
};

function filasGA(r: InformeGA) {
  const dims = (r.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (r.metricHeaders ?? []).map((h) => h.name);
  return (r.rows ?? []).map((row) => {
    const o: Record<string, string | number> = {};
    dims.forEach((d, i) => (o[d] = row.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((m, i) => (o[m] = Number(row.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}

async function datosAnalytics(a: AjustesNegocio, dias: number, negocio: string): Promise<Datos> {
  if (!a.propiedad) throw new Error("Falta elegir la propiedad de Analytics en «Conexión con Google».");
  const p = periodos(dias, 1);
  const url = `https://analyticsdata.googleapis.com/v1beta/${a.propiedad}:runReport`;
  const rangos = [
    { startDate: p.actual.inicio, endDate: p.actual.fin, name: "actual" },
    { startDate: p.anterior.inicio, endDate: p.anterior.fin, name: "anterior" },
  ];
  const tienda = negocio === "tienda";
  const metricas = ["activeUsers", "sessions", "engagementRate", "keyEvents", ...(tienda ? ["ecommercePurchases", "purchaseRevenue"] : [])];

  const [tot, porDia, canales, entradas] = await Promise.all([
    llamarGoogle<InformeGA>("ga", url, { method: "POST", body: { dateRanges: rangos, metrics: metricas.map((name) => ({ name })) } }),
    llamarGoogle<InformeGA>("ga", url, {
      method: "POST",
      body: {
        dateRanges: [rangos[0]],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    }),
    llamarGoogle<InformeGA>("ga", url, {
      method: "POST",
      body: {
        dateRanges: rangos,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }, ...(tienda ? [{ name: "purchaseRevenue" }] : [])],
      },
    }),
    llamarGoogle<InformeGA>("ga", url, {
      method: "POST",
      body: {
        dateRanges: [rangos[0]],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "engagementRate" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 15,
      },
    }),
  ]);

  const ft = filasGA(tot);
  const act = ft.find((f) => f.dateRange === "actual") ?? (ft.length === 1 && !("dateRange" in ft[0]) ? ft[0] : undefined);
  const ant = ft.find((f) => f.dateRange === "anterior");
  const v = (o: Record<string, string | number> | undefined, m: string) => (o ? Number(o[m] ?? 0) : 0);
  const kpi = (nombre: string, m: string, formato: Formato, nota?: string): Kpi => ({ nombre, actual: v(act, m), anterior: v(ant, m), formato, nota });

  // Canales: pivotar actual / anterior
  const mapa: Record<string, { s: number; sa: number; k: number; e: number }> = {};
  for (const f of filasGA(canales)) {
    const c = String(f.sessionDefaultChannelGroup || "(sin clasificar)");
    const x = (mapa[c] ??= { s: 0, sa: 0, k: 0, e: 0 });
    if (f.dateRange === "anterior") x.sa += Number(f.sessions);
    else {
      x.s += Number(f.sessions);
      x.k += Number(f.keyEvents);
      x.e += Number(f.purchaseRevenue ?? 0);
    }
  }
  const canalesFilas = Object.entries(mapa)
    .sort((a, b) => b[1].s - a[1].s)
    .map(([c, x]) => (tienda ? [c, x.s, x.sa, x.k, x.e] : [c, x.s, x.sa, x.k]));

  const fecha = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

  return {
    periodo: p,
    kpis: [
      kpi("Usuarios", "activeUsers", "num"),
      kpi("Sesiones", "sessions", "num"),
      kpi("Tasa de interacción", "engagementRate", "pct", "Sesiones de más de 10 s, con 2 páginas o con un evento clave"),
      kpi("Eventos clave", "keyEvents", "num", "Lo que esté marcado como evento clave en GA4 (compras, reservas, formularios…)"),
      ...(tienda ? [kpi("Compras", "ecommercePurchases", "num"), kpi("Ingresos", "purchaseRevenue", "eur")] : []),
    ],
    serie: {
      nombre: "Sesiones por día",
      formato: "num",
      puntos: filasGA(porDia).map((f) => ({ fecha: fecha(String(f.date)), valor: Number(f.sessions) })),
    },
    tablas: [
      {
        titulo: "Canales",
        columnas: [
          { nombre: "Canal" },
          { nombre: "Sesiones", formato: "num" },
          { nombre: "Periodo anterior", formato: "num" },
          { nombre: "Eventos clave", formato: "num" },
          ...(tienda ? [{ nombre: "Ingresos", formato: "eur" as Formato }] : []),
        ],
        filas: canalesFilas,
      },
      {
        titulo: "Páginas de entrada",
        columnas: [
          { nombre: "Página" },
          { nombre: "Sesiones", formato: "num" },
          { nombre: "Interacción", formato: "pct" },
          { nombre: "Eventos clave", formato: "num" },
        ],
        filas: filasGA(entradas).map((f) => [String(f.landingPage || "/"), Number(f.sessions), Number(f.engagementRate), Number(f.keyEvents)]),
      },
    ],
    avisos: [],
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const negocio = negocioDe(q.get("negocio"));
  const fuente = q.get("fuente");
  const dias = [7, 28, 90].includes(Number(q.get("dias"))) ? Number(q.get("dias")) : 28;
  try {
    const a = (await leerAjustes())[negocio] ?? {};
    const datos =
      fuente === "search-console"
        ? await datosSearchConsole(a, dias)
        : fuente === "analytics"
        ? await datosAnalytics(a, dias, negocio)
        : await datosFicha(a, dias);
    return Response.json({ negocio: NOMBRE_NEGOCIO[negocio], ...datos });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Falta elegir")) return Response.json({ error: e.message, falta: true }, { status: 400 });
    return respuestaError(e);
  }
}
