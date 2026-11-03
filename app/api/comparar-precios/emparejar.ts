// Emparejar productos entre nuestra web y Cosméticos24h cuando no comparten EAN.
//
// Primero se empareja siempre por EAN (en route.ts). Lo que queda sin pareja porque a una de las dos
// fichas le falta el EAN (o el suyo es un código interno) se empareja aquí, solo, sin tener que
// enlazarlo a mano:
//   1. Por número de referencia del fabricante (Maria Galland «824», «65A», «5L»…), si es el mismo
//      en las dos webs y va al principio de los dos nombres o tiene 3 cifras o más.
//   2. Por nombre, si ninguno de los dos lleva referencia y los nombres se parecen mucho.
// Reglas de seguridad: mismo formato (50 ml con 50 ml), los dos pack o ninguno, la pareja tiene que
// ser única en las dos webs (sin empates) y, si las dos fichas tienen EAN y no coinciden, nunca se
// emparejan: son productos distintos.

export function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export const TAMANO = /(\d+(?:[.,]\d+)?)\s*(ml|gr|g|uds?|unidades|l)\b/i;

// Tamaño de un formato para comparar entre webs: «Tarro 30 ml» y «30 ml» → "30ml"
export function tamano(t: string): string {
  const m = t.toLowerCase().replace(",", ".").match(TAMANO);
  return m ? m[1] + m[2].replace(/^gr$/, "g").replace(/^(uds?|unidades)$/, "ud") : normalizar(t);
}

type MarcaE = { nombre: string; slug: string; miToken: string };
type VarianteE = { titulo: string };
type SuyoE = { titulo: string; url: string; esPack: boolean; variantes: VarianteE[] };
type MioE = { nombre: string; clave: string; esPack: boolean; ean: string | null; formato?: string; tono?: string };

export type Pareja<S, M> = { s: S; i: number; mp: M; por: "referencia" | "nombre"; confianza: number };

const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "con", "para", "en", "a", "al", "the", "and", "for", "with",
  "d", "l", "le", "les", "des", "et", "du", "ml", "gr", "g", "ud", "uds", "unidades", "tarro", "tubo", "frasco", "envase",
]);

// Texto sin tamaños («50 ml»), sin factores de protección («SPF 50+») y con «65 a» junto («65a»)
function limpiar(t: string): string {
  return normalizar(t)
    .replace(new RegExp(TAMANO.source, "gi"), " ")
    .replace(/\b(?:spf|fps|pa|ph)\s*\d+\+*/g, " ")
    .replace(/\b(\d{1,6})[\s-]([a-df-xz])(?=[\s-]|$)/g, "$1$2"); // sin «y»/«e»: «970 y 971»
}

// Números de referencia del nombre: 1 a 6 cifras con una letra opcional («824», «439a», «5l»)
export function referencias(t: string): { todas: Set<string>; primera: string | null } {
  const tokens = limpiar(t).split(/[^a-z0-9]+/).filter(Boolean);
  const esRef = (w: string) => /^\d{1,6}[a-z]?$/.test(w);
  return { todas: new Set(tokens.filter(esRef)), primera: tokens[0] && esRef(tokens[0]) ? tokens[0] : null };
}

export function palabras(t: string, marca: MarcaE): Set<string> {
  const deMarca = new Set(normalizar(`${marca.nombre} ${marca.slug} ${marca.miToken}`).split(/[^a-z0-9]+/));
  return new Set(limpiar(t).split(/[^a-z0-9]+/)
    .filter(w => w.length > 1 && !VACIAS.has(w) && !deMarca.has(w) && !/^\d/.test(w)));
}

function parecido(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  return comunes / (a.size + b.size - comunes);
}

export function emparejarSinEan<S extends SuyoE, M extends MioE>(
  suyos: S[], mios: M[], susEans: (url: string) => (string | null)[], marca: MarcaE,
): Pareja<S, M>[] {
  const tamanoDe = (t: string | undefined) => (t && TAMANO.test(t) ? tamano(t) : null);
  const tamanoSuyo = (s: S, i: number) => tamanoDe(s.variantes[i]?.titulo) ?? tamanoDe(s.titulo);
  const tamanoMio = (m: M) => tamanoDe(m.formato) ?? tamanoDe(m.nombre);

  // Variante suya que corresponde a mi ficha (por tamaño o tono); -1 si los formatos no casan
  const variante = (s: S, m: M): number => {
    const tm = tamanoMio(m);
    if (s.variantes.length <= 1) {
      const ts = tamanoSuyo(s, 0);
      return tm && ts && tm !== ts ? -1 : 0;
    }
    if (m.tono) return s.variantes.findIndex(v => normalizar(v.titulo) === normalizar(m.tono!));
    if (!tm) return -1; // varios formatos suyos y no sabemos cuál es el nuestro
    return s.variantes.findIndex((_, k) => tamanoSuyo(s, k) === tm);
  };
  const eanCompatible = (s: S, i: number, m: M) => {
    const suyo = susEans(s.url)[i] ?? null;
    return !suyo || !m.ean || suyo === m.ean;
  };

  const candidatas: Pareja<S, M>[] = [];
  for (const s of suyos) {
    const refS = referencias(s.titulo);
    const palS = palabras(s.titulo, marca);
    for (const m of mios) {
      if (s.esPack !== m.esPack) continue;
      const i = variante(s, m);
      if (i < 0 || !eanCompatible(s, i, m)) continue;
      const refM = referencias(m.nombre);
      const pal = parecido(palS, palabras(m.nombre, marca));
      const comunes = [...refS.todas].filter(r => refM.todas.has(r));
      if (comunes.length) {
        // La referencia basta si va al principio de los dos nombres o tiene 3 cifras o más
        // (el nombre suele estar en otro idioma); si no, el nombre también tiene que parecerse
        const fuerte = (refS.primera != null && refS.primera === refM.primera) || comunes.some(r => /^\d{3,}/.test(r));
        if (fuerte || pal >= 0.4) candidatas.push({ s, i, mp: m, por: "referencia", confianza: Math.min(1, 0.85 + pal * 0.15) });
      } else if (refS.todas.size === 0 || refM.todas.size === 0) {
        if (pal >= 0.75) candidatas.push({ s, i, mp: m, por: "nombre", confianza: Math.round(pal * 100) / 100 });
      }
    }
  }

  // Solo parejas sin competencia: cada uno tiene que ser la mejor opción del otro, sin empate
  const mejor = (clave: (p: Pareja<S, M>) => string) => {
    const porClave = new Map<string, Pareja<S, M>[]>();
    for (const p of candidatas) porClave.set(clave(p), [...(porClave.get(clave(p)) ?? []), p]);
    const out = new Map<string, Pareja<S, M>>();
    for (const [k, ps] of porClave) {
      ps.sort((a, b) => b.confianza - a.confianza);
      if (ps.length === 1 || ps[0].confianza - ps[1].confianza > 0.1) out.set(k, ps[0]);
    }
    return out;
  };
  const deSuyo = mejor(p => `${p.s.url}#${p.i}`);
  const deMio = mejor(p => p.mp.clave);
  return [...deSuyo.values()].filter(p => deMio.get(p.mp.clave) === p);
}
