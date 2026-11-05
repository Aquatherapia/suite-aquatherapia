// Emparejar con IA lo que no se ha podido emparejar por EAN ni por nombre.
//
// Hay tiendas que ponen el nombre en español y nosotros en inglés, o al revés («Eye Contour Anti-Wrinkle |
// Contorno de ojos Anti-Arrugas» frente a «CONTORNO DE OJOS ANTIARRUGAS»), y por palabras no casan.
// Se le pasan a Gemini las dos listas y devuelve las parejas que son el mismo producto y formato.
// Después se aplican las mismas reglas de seguridad que al emparejar por nombre (mismo formato, los dos pack o
// ninguno, cada producto una sola vez) y una más: el precio no puede ser muy distinto (entre la mitad y el doble
// del nuestro), porque un producto distinto suele delatarse por el precio.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { llamarGemini } from "../gemini";
import { tamano, TAMANO } from "../comparar-precios/emparejar";

export type SuyoIa = { clave: string; titulo: string; precio: number; esPack: boolean };
export type MioIa = { clave: string; nombre: string; formato?: string; precio: number; esPack: boolean };

const tamanoDe = (t: string | undefined) => (t && TAMANO.test(t) ? tamano(t) : null);

export async function emparejarConIa(suyos: SuyoIa[], mios: MioIa[], marca: string, tienda: string): Promise<{ su: string; mio: string }[]> {
  if (!process.env.GEMINI_API_KEY || !suyos.length || !mios.length) return [];
  const S = suyos.slice(0, 200), M = mios.slice(0, 200);
  const prompt = `Eres experto en cosmética profesional. Te paso dos listas de productos de la marca ${marca}: la A es de nuestra tienda y la B de la tienda ${tienda}. ` +
    `Los nombres pueden estar en inglés en una y en español en la otra, o resumidos. Empareja cada producto de A con el de B que sea EXACTAMENTE el mismo producto ` +
    `(misma línea, mismo tipo de producto y mismo formato o tamaño; 5 ampollas no es lo mismo que 20, ni 50 ml que 150 ml). ` +
    `Si dudas, no lo emparejes: es mejor dejar uno sin pareja que poner una pareja equivocada. Cada producto puede salir como mucho en una pareja. ` +
    `Responde SOLO con un array JSON de parejas, por ejemplo [["A1","B7"],["A4","B2"]], sin texto ni explicaciones.`;
  const lista = [
    "A (nuestra tienda):",
    ...M.map((m, i) => `A${i + 1}: ${m.nombre}${m.formato && !m.nombre.includes(m.formato) ? ` [${m.formato}]` : ""} · ${m.precio.toFixed(2)} €`),
    "",
    `B (${tienda}):`,
    ...S.map((s, i) => `B${i + 1}: ${s.titulo} · ${s.precio.toFixed(2)} €`),
  ].join("\n");
  let raw: string;
  try { raw = await llamarGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY), prompt, lista); }
  catch { return []; }
  let parejas: unknown;
  try { parejas = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]"); } catch { return []; }
  if (!Array.isArray(parejas)) return [];

  const usadosS = new Set<number>(), usadosM = new Set<number>();
  const out: { su: string; mio: string }[] = [];
  for (const p of parejas) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const a = Number(String(p[0]).replace(/^A/i, "")) - 1, b = Number(String(p[1]).replace(/^B/i, "")) - 1;
    const m = M[a], s = S[b];
    if (!m || !s || usadosM.has(a) || usadosS.has(b)) continue;
    if (m.esPack !== s.esPack) continue;
    const tm = tamanoDe(m.formato) ?? tamanoDe(m.nombre), ts = tamanoDe(s.titulo);
    if (tm && ts && tm !== ts) continue;
    const ratio = s.precio / m.precio;
    if (!(ratio > 0.5 && ratio < 2)) continue;
    usadosM.add(a); usadosS.add(b);
    out.push({ su: s.clave, mio: m.clave });
  }
  return out;
}
