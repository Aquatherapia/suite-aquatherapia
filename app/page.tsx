import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

async function getVigilarStats() {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "vigilar-config.json"),
      "utf-8"
    );
    const config = JSON.parse(raw);
    const resultados: { descuentos?: { nuevo?: boolean }[] }[] =
      config.resultados ?? [];
    const total = resultados.reduce(
      (s, r) => s + (r.descuentos?.length ?? 0), 0
    );
    const nuevos = resultados.reduce(
      (s, r) => s + (r.descuentos?.filter((d) => d.nuevo)?.length ?? 0), 0
    );
    return { total, nuevos };
  } catch {
    return { total: 0, nuevos: 0 };
  }
}

export default async function Home() {
  const vigilar = await getVigilarStats();

  return (
    <div className="wrap">
      <header className="home-header">
        <div className="home-logo">La Tienda de Cosméticos</div>
        <h1>Herramientas IA</h1>
        <p>Selecciona una herramienta para empezar</p>
      </header>

      <div className="agentes-grid">
        <Link href="/ficha-producto" className="agente-card">
          <span className="agente-icono">✦</span>
          <div className="agente-info">
            <div className="agente-nombre">Generador de fichas de producto</div>
            <div className="agente-desc">
              Rellena los datos del producto y la IA redacta la ficha completa
              con el formato exacto de la tienda: título, descripción,
              beneficios, SEO y más.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/vigilar-precios" className="agente-card">
          <span className="agente-icono">◎</span>
          <div className="agente-info">
            <div className="agente-nombre-row">
              <span className="agente-nombre">
                Vigilar precios en Cosméticos24h
              </span>
              {vigilar.nuevos > 0 && (
                <span className="agente-badge agente-badge-nuevo">
                  {vigilar.nuevos} nuevo{vigilar.nuevos !== 1 ? "s" : ""}
                </span>
              )}
              {vigilar.nuevos === 0 && vigilar.total > 0 && (
                <span className="agente-badge">
                  {vigilar.total} descuento{vigilar.total !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="agente-desc">
              Comprueba si alguna de tus marcas tiene descuento activo. Añade
              marcas como Casmara o Atache y revisa con un clic.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/google-business" className="agente-card">
          <span className="agente-icono">◈</span>
          <div className="agente-info">
            <div className="agente-nombre">Post para Google Business</div>
            <div className="agente-desc">
              Indica el tema y la marca o servicio y la IA redacta el texto
              listo para publicar como actualización en tu ficha de Google
              Business Profile.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/vigilar-competidores" className="agente-card">
          <span className="agente-icono">⊛</span>
          <div className="agente-info">
            <div className="agente-nombre">Vigilar competidores</div>
            <div className="agente-desc">
              Añade la URL de cualquier marca en tiendas de la competencia
              (PrestaShop, WooCommerce o Shopify) y comprueba sus descuentos
              con un clic.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/informes" className="agente-card">
          <span className="agente-icono">▣</span>
          <div className="agente-info">
            <div className="agente-nombre">Informe de marketing mensual</div>
            <div className="agente-desc">
              Pega los datos de cada canal (Analytics, Google Ads, tu tienda…) y
              la IA te monta el informe mensual completo: canales, ventas, ROAS,
              embudo, comparativa interanual y conclusiones.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/responder-resenas" className="agente-card">
          <span className="agente-icono">✍</span>
          <div className="agente-info">
            <div className="agente-nombre">Responder reseñas de Google</div>
            <div className="agente-desc">
              Pega la reseña de un cliente, elige el negocio (La Tienda o
              Aquatherapia) y la IA redacta una respuesta profesional lista para
              publicar en tu Perfil de Empresa.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>

        <Link href="/vigilar-novedades" className="agente-card">
          <span className="agente-icono">✸</span>
          <div className="agente-info">
            <div className="agente-nombre">Vigilar novedades de marcas</div>
            <div className="agente-desc">
              Añade una marca con la URL de su tienda y detecta cuándo sube
              productos nuevos a su web, para ser de los primeros en venderlos.
            </div>
          </div>
          <span className="agente-arrow">→</span>
        </Link>
      </div>
    </div>
  );
}
