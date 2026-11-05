// Competidores del apartado «Comparar con la competencia». Cada uno se lee según su plataforma:
//   c24: no se lee aquí, se toma de la última revisión del comparador de Cosméticos24h (emparejado por EAN)
//   woo: WooCommerce (API pública de la tienda, por categoría)
//   presta: PrestaShop (listado de la marca en JSON)
//   rosi: Estética Rosi (web propia: listado HTML de la marca)
export type TipoCompetidor = "c24" | "woo" | "presta" | "rosi";
export type Competidor = { id: string; nombre: string; corto: string; web: string; tipo: TipoCompetidor };

export const COMPETIDORES: Competidor[] = [
  { id: "c24", nombre: "Cosméticos24h", corto: "Cosméticos24h", web: "https://cosmeticos24h.com", tipo: "c24" },
  { id: "anadeana", nombre: "Anadeana", corto: "Anadeana", web: "https://anadeana.es", tipo: "woo" },
  { id: "vip24", nombre: "Cosmética VIP24", corto: "VIP24", web: "https://cosmeticavip24.com", tipo: "woo" },
  { id: "rosi", nombre: "Estética Rosi", corto: "Estética Rosi", web: "https://www.esteticarosi.com", tipo: "rosi" },
  { id: "chancosa", nombre: "Mar Chancosa", corto: "Mar Chancosa", web: "https://marchancosa.com", tipo: "woo" },
  { id: "pilar", nombre: "Pilar Delgado", corto: "Pilar Delgado", web: "https://tienda.pilar-delgado.com", tipo: "presta" },
];

// Precio de un competidor para uno de nuestros productos
export type PrecioComp = {
  precio: number;   // precio de venta en su web
  pvp?: number;     // precio sin oferta (tachado), si lo publica
  url: string;
  titulo: string;   // cómo se llama en su web
  por: "ean" | "referencia" | "nombre"; // cómo se ha emparejado
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
};

export type ResultadoComp = {
  revisadoEn: string;
  filas: FilaComp[];
  competidores: Record<string, EstadoComp>;
  c24RevisadoEn?: string; // fecha de la revisión de Cosméticos24h de la que salen sus precios
};
