import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

interface Archivo {
  name: string;
  content: string;
}

// ───────────────────────── Utilidades de formato ─────────────────────────
const fmtNum = (n: number) =>
  n.toLocaleString("es-ES", { maximumFractionDigits: 0 });
const fmtEur = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
  " €";
const fmtPctVal = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
  "%";
const fmtVar = (a: number, b: number) =>
  b > 0
    ? ((a - b) / b * 100).toLocaleString("es-ES", {
        maximumFractionDigits: 1,
        signDisplay: "always",
      }) + "%"
    : "";

// ─────────────────── CSV de canales de Analytics (exacto) ───────────────────
// Detecta y suma con código el export "Adquisición de tráfico: Grupo de canales".
// Columnas: 0 canal · 1 Sesiones · 7 Eventos clave · 9 Total de ingresos

interface FilaCanal {
  canal: string;
  sesiones: number;
  pedidos: number;
  ingresos: number;
}

function esCSVCanales(content: string): boolean {
  return /Grupo de canales[^\n]*Sesiones[^\n]*Total de ingresos/i.test(content);
}

// Devuelve los bloques de periodo encontrados (normalmente 2: actual y anterior).
function parseCanales(content: string): FilaCanal[][] {
  const lineas = content.replace(/\r/g, "").split("\n");
  const bloques: FilaCanal[][] = [];
  let actual: FilaCanal[] | null = null;

  for (const linea of lineas) {
    if (/^Grupo de canales/i.test(linea)) {
      actual = [];
      bloques.push(actual);
      continue;
    }
    if (!actual) continue;
    const t = linea.trim();
    if (!t || t.startsWith("#")) {
      actual = null;
      continue;
    }
    const cols = linea.split(",");
    if (cols.length < 10) continue;
    actual.push({
      canal: cols[0].trim(),
      sesiones: parseFloat(cols[1]) || 0,
      pedidos: parseFloat(cols[7]) || 0,
      ingresos: parseFloat(cols[9]) || 0,
    });
  }
  return bloques.filter((b) => b.length > 0);
}

const GRUPOS: { nombre: string; canales: string[] }[] = [
  {
    nombre: "PUBLICIDAD DE PAGO (GOOGLE ADS)",
    canales: ["Paid Search", "Paid Shopping", "Cross-network", "Display", "Paid Video", "Paid Other"],
  },
  { nombre: "SEO / ORGÁNICO", canales: ["Organic Search"] },
  { nombre: "REDES SOCIALES", canales: ["Organic Social", "Paid Social"] },
  { nombre: "EMAIL", canales: ["Email"] },
  { nombre: "DIRECTO", canales: ["Direct"] },
  { nombre: "REFERRAL", canales: ["Referral"] },
];

interface Agregado {
  sesiones: number;
  pedidos: number;
  ingresos: number;
}
const sumar = (filas: FilaCanal[]): Agregado =>
  filas.reduce(
    (a, f) => ({
      sesiones: a.sesiones + f.sesiones,
      pedidos: a.pedidos + f.pedidos,
      ingresos: a.ingresos + f.ingresos,
    }),
    { sesiones: 0, pedidos: 0, ingresos: 0 }
  );

function grupoDe(canal: string): string {
  for (const g of GRUPOS) if (g.canales.includes(canal)) return g.nombre;
  return "OTROS CANALES";
}

// Líneas de métricas con su variación interanual.
function lineasMetricas(act: Agregado, prev: Agregado | null): string[] {
  const ticketAct = act.pedidos > 0 ? act.ingresos / act.pedidos : 0;
  const convAct = act.sesiones > 0 ? (act.pedidos / act.sesiones) * 100 : 0;
  if (!prev) {
    return [
      `- Sesiones: ${fmtNum(act.sesiones)}`,
      `- Pedidos (eventos clave): ${fmtNum(act.pedidos)}`,
      `- Ingresos: ${fmtEur(act.ingresos)}`,
      `- Ticket medio: ${fmtEur(ticketAct)}`,
      `- Conversión (pedidos/sesiones): ${fmtPctVal(convAct)}`,
    ];
  }
  const ticketPrev = prev.pedidos > 0 ? prev.ingresos / prev.pedidos : 0;
  const convPrev = prev.sesiones > 0 ? (prev.pedidos / prev.sesiones) * 100 : 0;
  const v = (a: number, b: number) => {
    const s = fmtVar(a, b);
    return s ? ` → ${s}` : "";
  };
  return [
    `- Sesiones: ${fmtNum(act.sesiones)} vs ${fmtNum(prev.sesiones)}${v(act.sesiones, prev.sesiones)}`,
    `- Pedidos (eventos clave): ${fmtNum(act.pedidos)} vs ${fmtNum(prev.pedidos)}${v(act.pedidos, prev.pedidos)}`,
    `- Ingresos: ${fmtEur(act.ingresos)} vs ${fmtEur(prev.ingresos)}${v(act.ingresos, prev.ingresos)}`,
    `- Ticket medio: ${fmtEur(ticketAct)} vs ${fmtEur(ticketPrev)}${v(ticketAct, ticketPrev)}`,
    `- Conversión (pedidos/sesiones): ${fmtPctVal(convAct)} vs ${fmtPctVal(convPrev)}`,
  ];
}

// Construye el bloque de cifras EXACTAS a partir del CSV de canales.
function bloqueExacto(content: string): string | null {
  const bloques = parseCanales(content);
  if (bloques.length === 0) return null;
  const actualFilas = bloques[0];
  const prevFilas = bloques[1] || null;

  const out: string[] = [
    "DATOS EXACTOS YA CALCULADOS A PARTIR DEL CSV DE CANALES (úsalos TAL CUAL, no los recalcules):",
    "",
    "GLOBAL (todos los canales):",
    ...lineasMetricas(sumar(actualFilas), prevFilas ? sumar(prevFilas) : null),
    "",
    "POR GRUPO DE CANAL:",
  ];

  const nombresGrupo = [...GRUPOS.map((g) => g.nombre), "OTROS CANALES"];
  for (const nombre of nombresGrupo) {
    const act = sumar(actualFilas.filter((f) => grupoDe(f.canal) === nombre));
    if (act.sesiones === 0 && act.ingresos === 0) continue;
    const prev = prevFilas
      ? sumar(prevFilas.filter((f) => grupoDe(f.canal) === nombre))
      : null;
    out.push("", `${nombre}:`, ...lineasMetricas(act, prev));
  }
  return out.join("\n");
}

// ────────────────────── Recorte de CSV grandes (productos) ──────────────────
function recortarCSV(content: string, maxLineas = 200, maxChars = 40000): string {
  let lineas = content.split(/\r?\n/);
  let omitidas = 0;
  if (lineas.length > maxLineas) {
    omitidas = lineas.length - maxLineas;
    lineas = lineas.slice(0, maxLineas);
  }
  let txt = lineas.join("\n");
  if (txt.length > maxChars) txt = txt.slice(0, maxChars) + "\n…(texto recortado)";
  if (omitidas > 0) txt += `\n…(+${omitidas} filas más, omitidas por tamaño)`;
  return txt;
}

const SYSTEM_PROMPT = `Eres un analista de marketing digital senior que prepara el INFORME DE MARKETING MENSUAL para el dueño de una tienda online de cosmética (latiendadecosmeticos.com). El dueño NO es técnico: escribe claro, directo y profesional, sin jerga innecesaria.

El usuario te sube uno o varios archivos CSV exportados de sus herramientas (Google Analytics, Google Ads, su tienda, email, etc.). Tu trabajo es:
1. IDENTIFICAR qué contiene cada archivo (por su nombre y columnas): ¿canales? ¿productos? ¿campañas? etc.
2. EXTRAER las cifras clave (sumas, totales, top elementos) — interpreta y agrega, no copies filas.
3. REDACTAR un informe profesional con esta estructura de 12 secciones, con estos encabezados EXACTOS en MAYÚSCULAS:

1. RESUMEN EJECUTIVO  (principales resultados del mes, conclusiones y próximos pasos — sintetiza el resto)
2. RESUMEN GLOBAL  (usuarios, sesiones, nuevos usuarios, pedidos, ingresos, ticket medio, conversión; comparativa interanual si hay datos)
3. RENDIMIENTO POR CANAL DE ADQUISICIÓN. Agrupa los canales de Google Analytics en estos apartados (uno por cada uno del que haya datos) y, dentro de cada uno, muestra la comparativa interanual:
   - PUBLICIDAD DE PAGO (GOOGLE ADS): Paid Search, Paid Shopping, Cross-network, Display, Paid Video.
   - SEO / ORGÁNICO: Organic Search.
   - REDES SOCIALES: Organic Social y Paid Social (indica qué parte es de pago).
   - EMAIL: Email.
   - DIRECTO: Direct.
   - REFERRAL: Referral.
   - OTROS CANALES: el resto (Unassigned, Organic Shopping, marketplaces, etc.).
4. VENTAS POR MARCA
5. VENTAS POR CATEGORÍA
6. PRODUCTOS DESTACADOS  (top vendidos, mayor crecimiento, descensos)
7. EMBUDO DE CONVERSIÓN
8. CLIENTES  (nuevos, recurrentes, repetición, frecuencia)
9. CAMPAÑAS Y PROMOCIONES
10. KPIs DE ECOMMERCE  (facturación, pedidos, ticket medio, conversión, ROAS, CAC si hay datos)
11. COMPARATIVA MENSUAL E INTERANUAL
12. CONCLUSIONES Y PLAN DE ACCIÓN  (qué ha funcionado, qué ha empeorado, oportunidades, acciones prioritarias, objetivos del próximo mes)

REGLAS IMPORTANTES:
- MUY IMPORTANTE: si recibes un bloque titulado "DATOS EXACTOS YA CALCULADOS", esas cifras (sesiones, pedidos, ingresos, ticket medio, conversión y sus %) son DEFINITIVAS y EXACTAS. Úsalas LITERALMENTE en las secciones 2 (RESUMEN GLOBAL), 3 (CANALES) y 10 (KPIs). NO las recalcules, no las redondees distinto ni las cambies.
- NO incluyas margen, beneficio neto ni LTV en euros de beneficio: el usuario NO aporta costes. Trabaja solo con FACTURACIÓN/VENTAS y ROAS. Cuando menciones ROAS, recuerda que son ventas, no beneficio.
- Haz comparativa interanual SOLO donde haya datos de ambos periodos.
- Si para una sección NO hay datos, escribe debajo del encabezado exactamente: "Sin datos disponibles este mes." y no inventes nada.
- No inventes cifras: usa solo lo que haya en los datos. Si algo falta, dilo.
- NO uses sintaxis Markdown: nada de almohadillas (#), asteriscos (*) ni tablas con barras (|). Encabezados en MAYÚSCULAS y viñetas con "- ".
- La numeración "1." a "12." es EXCLUSIVA de los 12 títulos de sección. NO uses listas numeradas dentro de las secciones: para enumerar usa siempre viñetas con "- ".
- Los sub-apartados dentro de una sección (cada canal, o etiquetas como "Top productos por ingresos:") ponlos en su propia línea, en MAYÚSCULAS o terminados en dos puntos, y SIN viñeta.
- Para comparativas, una línea por métrica empezando por viñeta: "- Usuarios: 42.860 (2026) vs 38.000 (2025) → +12,8%".
- En español. Devuelve SOLO el informe, sin saludos ni despedidas.`;

function buildUserContent(
  periodo: string,
  comparacion: string,
  notas: string,
  archivos: Archivo[]
): string {
  const partes: string[] = [
    `PERIODO DEL INFORME: ${periodo || "(no indicado)"}`,
    comparacion
      ? `PERIODO DE COMPARACIÓN (año anterior): ${comparacion}`
      : `PERIODO DE COMPARACIÓN: no indicado (omite comparativas donde no haya datos de ambos periodos).`,
  ];
  if (notas.trim()) partes.push("", `NOTAS / OBJETIVOS DEL USUARIO:`, notas.trim());

  // Procesar canales (cifras exactas) y el resto (CSV en bruto) por separado.
  const otros: Archivo[] = [];
  const bloquesExactos: string[] = [];
  for (const a of archivos) {
    if (esCSVCanales(a.content)) {
      const bloque = bloqueExacto(a.content);
      if (bloque) {
        bloquesExactos.push(bloque);
        continue;
      }
    }
    otros.push(a);
  }

  if (bloquesExactos.length > 0) {
    partes.push("", "==================================================");
    partes.push(...bloquesExactos);
    partes.push("==================================================");
  }

  if (otros.length > 0) {
    partes.push("", `OTROS ARCHIVOS SUBIDOS (${otros.length}):`);
    otros.forEach((a, i) => {
      partes.push(``, `===== ARCHIVO ${i + 1}: ${a.name} =====`, recortarCSV(a.content));
    });
  }

  return partes.join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    periodo?: string;
    periodoComparacion?: string;
    notas?: string;
    archivos?: Archivo[];
  };

  const archivos = (body.archivos || []).filter(
    (a) => a && a.content && a.content.trim()
  );
  if (archivos.length === 0) {
    return NextResponse.json(
      { error: "Sube al menos un archivo CSV con datos para generar el informe." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Falta la clave de Gemini." }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const informe = await llamarGemini(
      genAI,
      SYSTEM_PROMPT,
      buildUserContent(
        String(body.periodo || ""),
        String(body.periodoComparacion || ""),
        String(body.notas || ""),
        archivos
      )
    );
    return NextResponse.json({ informe });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar el informe" },
      { status: 500 }
    );
  }
}
