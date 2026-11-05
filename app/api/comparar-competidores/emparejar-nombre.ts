// Emparejar por nombre nuestros productos con los de un competidor que no publica el EAN.
//
// Nuestros nombres llevan más cosas que los suyos («Sérum Essential R-45 | Concentrado antiedad - Línea Firmezza - 30 ml»
// frente a «Sérum Essential R-45 30 ml Eberlin»), así que se mira sobre todo si sus palabras están en nuestro nombre
// y si nuestro nombre principal (lo que va antes de « | » o « - ») se parece al suyo.
// Reglas de seguridad, como en el comparador de Cosméticos24h: mismo formato (50 ml con 50 ml), los dos pack o ninguno,
// si los dos llevan número de referencia o EAN tiene que coincidir, y la pareja tiene que ser la mejor de los dos lados, sin empate.
import { palabras, referencias, tamano, TAMANO } from "../comparar-precios/emparejar";

type Marca = { nombre: string; slug: string; miToken: string };
type Suyo = { titulo: string; url: string; esPack: boolean; variantes: { titulo: string; ean: string | null }[] };
type Mio = { nombre: string; clave: string; esPack: boolean; formato?: string; ean: string | null };
export type ParejaNombre<S, M> = { s: S; i: number; mp: M; por: "referencia" | "nombre"; confianza: number };

const tamanoDe = (t: string | undefined) => (t && TAMANO.test(t) ? tamano(t) : null);
const principal = (n: string) => n.split(/\s+\|\s+|\s+-\s+/)[0];

export function emparejarPorNombre<S extends Suyo, M extends Mio>(suyos: S[], mios: M[], marca: Marca): ParejaNombre<S, M>[] {
  const candidatas: ParejaNombre<S, M>[] = [];
  for (const s of suyos) {
    const palS = palabras(s.titulo, marca);
    const refS = referencias(s.titulo).todas;
    if (palS.size === 0) continue;
    for (const m of mios) {
      if (s.esPack !== m.esPack) continue;
      // Variante suya con nuestro formato
      const tm = tamanoDe(m.formato) ?? tamanoDe(m.nombre);
      let i = 0;
      if (s.variantes.length > 1) {
        i = tm ? s.variantes.findIndex(v => tamanoDe(v.titulo) === tm) : -1;
        if (i < 0) continue;
      } else {
        const ts = tamanoDe(s.variantes[0]?.titulo) ?? tamanoDe(s.titulo);
        if (tm && ts && tm !== ts) continue;
      }
      // Los dos con EAN y distinto: son productos distintos
      const eanS = s.variantes[i]?.ean;
      if (eanS && m.ean && eanS !== m.ean) continue;
      const refM = referencias(m.nombre).todas;
      const refComun = [...refS].some(r => refM.has(r));
      if (refS.size && refM.size && !refComun) continue;
      const palM = palabras(m.nombre, marca);
      const palP = palabras(principal(m.nombre), marca);
      const comunes = [...palS].filter(w => palM.has(w)).length;
      if (comunes < 2) continue;
      const cubre = comunes / palS.size; // sus palabras que están en nuestro nombre
      const comP = [...palS].filter(w => palP.has(w)).length;
      const jaccardP = palP.size ? comP / (palS.size + palP.size - comP) : 0;
      const confianza = Math.round(Math.max(jaccardP, cubre * (comP / Math.max(palP.size, 1))) * 100) / 100;
      if (confianza >= 0.7) candidatas.push({ s, i, mp: m, por: refComun ? "referencia" : "nombre", confianza });
    }
  }
  const mejor = (clave: (p: ParejaNombre<S, M>) => string) => {
    const porClave = new Map<string, ParejaNombre<S, M>[]>();
    for (const p of candidatas) porClave.set(clave(p), [...(porClave.get(clave(p)) ?? []), p]);
    const out = new Map<string, ParejaNombre<S, M>>();
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
