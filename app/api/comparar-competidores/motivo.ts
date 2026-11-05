// Por qué un producto de un competidor no se ha enlazado con ninguno nuestro.
// Se busca nuestro producto con el nombre más parecido y se dice qué lo impide: otro formato, pack, precio muy distinto,
// que ese nuestro ya esté enlazado con otro suyo o, si no se parece a ninguno, que no lo tenemos.
import { palabras, tamano, TAMANO } from "../comparar-precios/emparejar";

type Marca = { nombre: string; slug: string; miToken: string };
type Mio = { nombre: string; clave: string; esPack: boolean; formato?: string; precio: number };

const tamanoDe = (t: string | undefined) => (t && TAMANO.test(t) ? tamano(t) : null);
const corto = (n: string) => { const p = n.split(/\s+\|\s+|\s+-\s+/)[0]; return p.length > 60 ? p.slice(0, 57) + "…" : p; };

export function motivoSinPareja(titulo: string, precio: number, esPack: boolean, mios: Mio[], enlazados: Set<string>, marca: Marca): string {
  const palS = palabras(titulo, marca);
  if (!palS.size || !mios.length) return "No lo tenemos en nuestra web";
  let mejor: Mio | null = null, nota = 0;
  for (const m of mios) {
    const palM = palabras(m.nombre, marca);
    let comunes = 0;
    for (const w of palS) if (palM.has(w)) comunes++;
    const n = comunes / palS.size;
    if (n > nota) { nota = n; mejor = m; }
  }
  if (!mejor || nota < 0.5) return "No lo tenemos en nuestra web";
  const nombre = `«${corto(mejor.nombre)}»`;
  const ts = tamanoDe(titulo), tm = tamanoDe(mejor.formato) ?? tamanoDe(mejor.nombre);
  if (ts && tm && ts !== tm) return `Lo tenemos en otro formato: ${nombre} ${mejor.formato ?? tm}, el suyo es de ${ts.replace(/(\d)([a-z])/, "$1 $2")}`;
  if (esPack !== mejor.esPack) return esPack ? `Es un pack o estuche; el nuestro parecido (${nombre}) no` : `El nuestro parecido (${nombre}) es un pack o estuche y el suyo no`;
  if (enlazados.has(mejor.clave)) return `Se parece a ${nombre}, que ya está enlazado con otro producto suyo`;
  const ratio = mejor.precio > 0 ? precio / mejor.precio : 1;
  if (!(ratio > 0.5 && ratio < 2)) return `Se parece a ${nombre}, pero el precio es muy distinto (${precio.toFixed(2).replace(".", ",")} € frente a ${mejor.precio.toFixed(2).replace(".", ",")} €)`;
  return `Se parece a ${nombre}, pero no hay seguridad de que sea el mismo producto`;
}
