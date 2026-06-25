import { GoogleGenerativeAI } from "@google/generative-ai";

export function parseSecciones(raw: string) {
  function extraer(tag: string) {
    return (
      raw
        .match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`))
        ?.[1]
        ?.trim()
        .replace(/^```(?:html)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim() ?? ""
    );
  }
  return {
    titulo: extraer("TITULO"),
    descripcion: extraer("DESCRIPCION"),
    beneficios: extraer("BENEFICIOS"),
    activos: extraer("ACTIVOS"),
    ingredientes: extraer("INGREDIENTES"),
    modo: extraer("MODO"),
    ideal: extraer("IDEAL"),
    metaTitle: extraer("META_TITLE"),
    metaDesc: extraer("META_DESC"),
  };
}

export async function llamarGemini(
  genAI: GoogleGenerativeAI,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const MODELOS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
  ];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let rawOutput = "";
  let ultimoError = "";

  for (const nombreModelo of MODELOS) {
    const model = genAI.getGenerativeModel({
      model: nombreModelo,
      systemInstruction: systemPrompt,
    });
    for (let intento = 0; intento < 2; intento++) {
      try {
        const result = await model.generateContent(userContent);
        rawOutput = result.response.text().trim();
        break;
      } catch (e: unknown) {
        ultimoError = e instanceof Error ? e.message : String(e);
        const saturado = /503|overload|UNAVAILABLE|high demand/i.test(ultimoError);
        if (saturado && intento === 0) {
          await sleep(1500);
          continue;
        }
        break;
      }
    }
    if (rawOutput) break;
  }

  if (!rawOutput) throw new Error("Modelos saturados. " + ultimoError);
  return rawOutput;
}
