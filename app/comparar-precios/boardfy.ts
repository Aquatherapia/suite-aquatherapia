// Descuento autorizado por marca sacado de las reglas de Boardfy (29/10/2026), regla «Soy Más Caro» (solo las activas):
// «Limite 0.90 PVR» = el precio no baja del 90 % del PVP = 10 % de descuento autorizado.
// Los packs, outlet y descontinuados tienen reglas propias en Boardfy y no están aquí.
// Es el valor por defecto: en la app se puede cambiar marca a marca.
const LIMITES: Record<string, number> = {
  "advanced nutrition": 0.97, "alan coar": 0.90, "alissi": 0.99, "alqvimia": 0.85, "aroms nature": 0.90,
  "atache": 0.85, "bruno vassari": 0.99, "byoode": 0.90, "casmara": 0.99, "cellcosmet": 0.95,
  "comfort zone": 0.80, "conceptikal": 0.90, "davines": 0.80, "dermoder": 0.97, "dr grandel": 0.99,
  "eberling": 0.99, "ella bache": 0.90, "endor": 0.80, "fytofontana": 0.90, "germaine de capuccini": 0.95,
  "gernetic": 0.97, "glacee": 0.90, "guinot": 0.85, "iles formula": 0.90, "in nutricosmetica": 0.97,
  "isseimi": 0.90, "janssen": 0.90, "jorge de la garza": 0.80, "klapp": 0.85, "maria galland": 0.90,
  "maria nila": 0.85, "mary cohr": 0.75, "massada": 0.99, "matriskin": 0.95, "mccm": 0.85,
  "me me": 0.90, "medik8": 0.85, "mesoestetic": 0.90, "montibello": 0.99, "nirvana": 0.75,
  "o m": 0.90, "olaplex": 0.97, "perricone": 0.85, "scens": 0.90, "selvert": 0.85, "skeyndor": 0.80,
  "sothys": 0.90, "sublime oils": 0.97, "summecosmetics": 0.99, "thalgo": 0.80, "thalissi": 0.99,
  "tolure": 0.95, "tr10": 0.90, "utsukusy": 0.80,
};

// Marcas cuya regla «Soy Más Caro» está desactivada en Boardfy (comprobado el 29/10/2026):
// Boardfy no les cambia el precio, así que no hay descuento autorizado que aplicar.
const INACTIVAS = new Set([
  "advanced nutrition", "aroms nature", "atache", "bruno vassari", "byoode", "casmara", "conceptikal",
  "eberling", "endor", "germaine de capuccini", "gernetic", "massada", "medik8", "mesoestetic",
  "montibello", "perricone", "sothys",
]);

function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Descuento autorizado (en %) de Boardfy para una marca, o null si no tiene límite
export function descuentoBoardfy(marca: string): number | null {
  const n = normalizar(marca);
  if (reglaBoardfyInactiva(marca)) return null;
  for (const [k, limite] of Object.entries(LIMITES)) {
    if (n === k || n.startsWith(k + " ") || k.startsWith(n + " ")) return Math.round((1 - limite) * 1000) / 10;
  }
  return null;
}

// La regla de la marca existe pero está desactivada en Boardfy
export function reglaBoardfyInactiva(marca: string): boolean {
  const n = normalizar(marca);
  return [...INACTIVAS].some(k => n === k || n.startsWith(k + " ") || k.startsWith(n + " "));
}
