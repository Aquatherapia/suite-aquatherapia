// Competidores del apartado «Comparar con la competencia». Cada uno se lee según su plataforma:
//   c24: no se lee aquí, se toma de la última revisión del comparador de Cosméticos24h (emparejado por EAN)
//   woo: WooCommerce (API pública de la tienda, por categoría)
//   presta: PrestaShop (listado de la marca en JSON)
//   rosi: Estética Rosi (web propia: listado HTML de la marca)
export type TipoCompetidor = "c24" | "woo" | "presta" | "rosi";
export type Competidor = { id: string; nombre: string; corto: string; web: string; tipo: TipoCompetidor; color: string; fondo: string };

export const COMPETIDORES: Competidor[] = [
  { id: "c24", nombre: "Cosméticos24h", corto: "Cosméticos24h", web: "https://cosmeticos24h.com", tipo: "c24", color: "#c2367e", fondo: "#fbe9f3" },
  { id: "anadeana", nombre: "Anadeana", corto: "Anadeana", web: "https://anadeana.es", tipo: "woo", color: "#0f766e", fondo: "#e2f3f1" },
  { id: "vip24", nombre: "Cosmética VIP24", corto: "VIP24", web: "https://cosmeticavip24.com", tipo: "woo", color: "#f97316", fondo: "#fff1e3" },
  { id: "rosi", nombre: "Estética Rosi", corto: "Estética Rosi", web: "https://www.esteticarosi.com", tipo: "rosi", color: "#7c3aed", fondo: "#f1ebfd" },
  { id: "chancosa", nombre: "Mar Chancosa", corto: "Mar Chancosa", web: "https://marchancosa.com", tipo: "woo", color: "#92400e", fondo: "#f6eee6" },
  { id: "pilar", nombre: "Pilar Delgado", corto: "Pilar Delgado", web: "https://tienda.pilar-delgado.com", tipo: "presta", color: "#475569", fondo: "#eceff3" },
];

// Precio de un competidor para uno de nuestros productos
export type PrecioComp = {
  precio: number;   // precio de venta (en Cosméticos24h, con su cupón de carrito si lo hay)
  precioWeb?: number; // Cosméticos24h: precio de su web antes del cupón
  pvp?: number;     // precio sin oferta (tachado), si lo publica
  url: string;
  titulo: string;   // cómo se llama en su web
  por: "ean" | "referencia" | "nombre" | "ia"; // cómo se ha emparejado (ia: nombre en otro idioma, emparejado con IA)
};

// Una fila de la tabla: uno de nuestros productos (un formato) y lo que cuesta en cada competidor
export type FilaComp = {
  nombre: string; url: string; ean?: string; formato?: string;
  precio: number; pvp: number;
  precios: Record<string, PrecioComp>; // por id de competidor
};

export type EstadoComp = {
  url?: string;       // listado de la marca en su web ("" = no la vende)
  auto?: boolean;     // el enlace se encontró solo
  leidos?: number;    // productos de la marca leídos en su web
  emparejados?: number;
  error?: string;
  sinPareja?: { titulo: string; url?: string; precio?: number; motivo: string }[]; // sus productos que no se han enlazado y por qué
};

export type ResultadoComp = {
  revisadoEn: string;
  filas: FilaComp[];
  competidores: Record<string, EstadoComp>;
  c24RevisadoEn?: string; // fecha de la revisión de Cosméticos24h de la que salen sus precios
  cambios?: { desde: string; nuevosCaros: string[]; yaNoCaros: string[] }; // respecto a la revisión anterior
};

// Errores técnicos de conexión explicados para que se entiendan (los ya guardados también se muestran así)
export function explicarError(t: string): string {
  if (/ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|socket hang up|other side closed/i.test(t)) return "Su web no deja que nuestro servidor lea sus precios (corta la conexión)";
  if (/HTTP 40[13]|HTTP 429|forbidden|cloudflare|captcha/i.test(t)) return "Su web bloquea las consultas automáticas: no se pueden leer sus precios";
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|timeout|aborted/i.test(t)) return "Su web tarda demasiado en responder; prueba a revisar más tarde";
  if (/ENOTFOUND|EAI_AGAIN/i.test(t)) return "No se encuentra su web (¿ha cambiado de dirección?)";
  if (/CERT|SSL|TLS/i.test(t)) return "Su web tiene un problema con su certificado de seguridad";
  if (/HTTP 5\d\d/i.test(t)) return "Su web está dando errores ahora mismo; prueba a revisar más tarde";
  if (/fetch failed/i.test(t)) return "No se ha podido conectar con su web";
  return t;
}
