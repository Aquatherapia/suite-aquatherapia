import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";

interface Archivo {
  name: string;
  content: string;
}

// Recorta un CSV largo: nos quedamos con la cabecera y las primeras filas
// (las más relevantes: top productos/marcas/campañas) para no pasarnos del
// límite de tokens de la IA.
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
1. IDENTIFICAR qué contiene cada archivo (por su nombre y sus columnas): ¿son canales de adquisición? ¿productos? ¿campañas de Google Ads? ¿usuarios por mes? etc.
2. EXTRAER las cifras clave (sumas, totales, top elementos) — NO te limites a copiar filas, interpreta y agrega.
3. REDACTAR un informe profesional con esta estructura de 12 secciones, con estos encabezados EXACTOS en MAYÚSCULAS:

1. RESUMEN EJECUTIVO  (principales resultados del mes, conclusiones y próximos pasos — sintetiza el resto)
2. RESUMEN GLOBAL  (usuarios, sesiones, nuevos usuarios, pedidos, ingresos, ticket medio, conversión; comparativa interanual si hay datos)
3. RENDIMIENTO POR CANAL DE ADQUISICIÓN. Agrupa los canales de Google Analytics en estos apartados (incluye un apartado por cada uno del que haya datos) y, dentro de cada uno, muestra la comparativa interanual:
   - PUBLICIDAD DE PAGO (GOOGLE ADS): agrupa aquí Paid Search, Paid Shopping, Cross-network, Display y Paid Video.
   - SEO / ORGÁNICO: Organic Search.
   - REDES SOCIALES: Organic Social y Paid Social (indica qué parte es de pago).
   - EMAIL: Email.
   - DIRECTO: Direct.
   - REFERRAL: Referral.
   - OTROS CANALES: el resto (Affiliates, marketplaces, Audio, SMS, Unassigned, etc.).
   Para cada apartado da las métricas disponibles (sesiones, usuarios, pedidos/conversiones, facturación, conversión) y su variación % interanual. Cuando sumes varios canales en un apartado (p. ej. Paid Search + Paid Shopping), suma también sus cifras.
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
- NO incluyas margen, beneficio neto ni LTV en euros de beneficio: el usuario NO aporta costes. Trabaja solo con FACTURACIÓN/VENTAS y ROAS (ventas por cada euro invertido). Cuando menciones ROAS, recuerda que son ventas, no beneficio.
- Haz comparativa interanual SOLO donde haya datos de ambos periodos. Calcula la variación en %.
- Si para una sección NO hay datos en los archivos, escribe debajo del encabezado exactamente: "Sin datos disponibles este mes." y no inventes nada.
- No inventes cifras: usa solo lo que haya en los archivos. Si algo no cuadra o falta, dilo con naturalidad.
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
  if (notas.trim()) {
    partes.push("", `NOTAS / OBJETIVOS DEL USUARIO:`, notas.trim());
  }
  partes.push("", `ARCHIVOS SUBIDOS (${archivos.length}):`);
  archivos.forEach((a, i) => {
    partes.push(
      ``,
      `===== ARCHIVO ${i + 1}: ${a.name} =====`,
      recortarCSV(a.content)
    );
  });
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
