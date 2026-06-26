# Herramientas IA — La Tienda de Cosméticos

## Qué es esta app

Una suite de herramientas con IA para latiendadecosmeticos.com, construida con Next.js. Tiene **4 agentes**:

1. **Generador de fichas de producto** — Rellenas los datos y la IA redacta la ficha completa
2. **Vigilar precios en Cosméticos24h** — Detecta descuentos en tus marcas y avisa si cambian
3. **Post para Google Business Profile** — Convierte ideas/posts en texto listo para publicar (2 negocios)
4. **Vigilar competidores** — Detecta descuentos en las webs de competidores que tú elijas

**En producción:** https://suite-aquatherapia.vercel.app/
**Repositorio:** GitHub `Aquatherapia/suite-aquatherapia` conectado a Vercel (push a `main` = deploy automático).

---

## Límites de los servicios gratuitos (todo 100% gratis)

> Todo el proyecto funciona en planes gratuitos. Estos son los topes vigentes para que los tengas presentes sin tener que preguntar:

| Servicio | Plan | Límites | Nota |
|---|---|---|---|
| **Google Gemini 2.5 Flash** | Gratis (sin tarjeta) | **15 peticiones/min** · **1.500 peticiones/día** | En el plan gratuito Google puede usar tus datos para entrenar sus modelos |
| **Vercel** | Hobby | **100 GB tráfico/mes** · cada función serverless **corta a los 10 s** | El tope de 10 s importa si vigilas muchos competidores a la vez |
| **Upstash KV (Redis)** | Free | **500.000 comandos/mes** · **256 MB** · **1 sola base de datos** (región Frankfurt `fra1`) | Guarda la config de los dos vigiladores |

Con el uso actual no estás cerca de ningún límite. Si una mejora futura se acercara a alguno, se avisa antes de montarla.

---

## Cómo arrancar (en local)

```bash
cd ~/Documents/suite-aquatherapia
npm run dev
```

Luego abrir **http://localhost:3000** en el navegador.

---

## Agente 1 — Generador de fichas de producto

### URL: `/ficha-producto`

### Campos del formulario

| Campo | Ejemplo |
|---|---|
| Nombre del producto * | Sérum Rejuvenation |
| Línea / gama | The Botox |
| Marca | Fhos |
| Formato | 30ml, 50ml — Si tiene más de un formato, sepáralos con comas |
| Descripción | Texto descriptivo del fabricante |
| Ingredientes (INCI) | Lista de ingredientes |

### Estructura de la ficha generada

**Título** — Patrón: `Nombre | descripción + formato - Línea - Marca ®`
- 1 solo formato → va en el título
- Varios formatos → NO va en el título

**Cuerpo (para "Descripción corta" en PrestaShop):**
1. H2 — Tipo de producto + de + Marca
2. Párrafo de venta (2-4 frases con gancho emocional)
3. H2 BENEFICIOS Y PROPIEDADES — Lista 4-7 puntos
4. H2 PRINCIPIOS ACTIVOS — Activo + función *(fijo)*
5. H2 INGREDIENTES — Lista INCI *(fijo)*
6. H2 MODO DE UTILIZACIÓN — Pasos numerados
7. H2 [TIPO] IDEAL PARA — Tipos de piel *(fijo)*

**Meta SEO:** Meta title (50-60 chars) + Meta description (~150 chars)

### Botones por sección

| Sección | Regenerar | Más corto | Más largo | Editar |
|---|---|---|---|---|
| Título | ✓ | — | — | ✓ |
| Descripción corta | ✓ | ✓ | ✓ | ✓ |
| Beneficios | ✓ | ✓ | ✓ | ✓ |
| Modo de utilización | ✓ | ✓ | ✓ | ✓ |
| Meta title | ✓ | — | — | ✓ |
| Meta description | ✓ | — | — | ✓ |

### API routes
- `POST /api/generate` → genera la ficha completa
- `POST /api/regenerate` → regenera una sección (acepta `longitud`: "largo" | "corto")

---

## Agente 2 — Vigilar precios en Cosméticos24h

### URL: `/vigilar-precios`

Monitoriza la tienda **cosmeticos24h.com** (Shopify) en busca de descuentos en las marcas que configures. Usa la API pública de Shopify: `/collections/{slug}/products.json`.

### Cómo funciona

- Cada marca tiene un **slug** (ej: `atache` → `/collections/atache/products.json`)
- Compara `compare_at_price > price` para detectar descuentos
- Guarda el % de descuento de cada producto; si cambia (sube o baja) en la siguiente revisión, lo marca como **Nuevo**
- Filtra productos multi-unidad (ver "Exclusión de packs")

### Interfaz

**Columna izquierda:** lista de marcas vigiladas con botón de borrar + formulario para añadir nuevas (el slug se genera automáticamente desde el nombre)

**Columna derecha:** resultados agrupados en:
- **Nuevos hoy** — productos con descuento que son nuevos o han cambiado de %
- **Ya conocidos** — descuentos ya detectados en revisiones anteriores
- **Sin descuentos** — marcas sin ningún descuento activo (✓ en verde)

Cada marca es un acordeón desplegable con todos sus productos con descuento, precio actual y precio tachado. Si hay más de 5 productos aparece el botón "Ver X más →".

**Botón PDF por marca** — Genera una "Constancia de precios" descargable con foto, precio y fecha/hora exacta de cada producto. No incluye datos internos de la app.

### Notificaciones

Si el usuario activa los permisos, el navegador lanza una notificación de escritorio automáticamente al terminar la revisión cuando hay productos nuevos o con cambio de %.

### Persistencia

Los datos se guardan en **Upstash KV (Redis)** bajo la clave `vigilar-config`:

```json
{
  "marcas": [{ "nombre": "Atache", "slug": "atache" }],
  "ultimaRevision": "2026-06-25T...",
  "resultados": [...],
  "urlsPrevias": { "atache": { "https://...": 20 } }
}
```

`urlsPrevias` guarda `{ slug → { url → % descuento } }` para detectar cambios de precio en la siguiente revisión.

> En local, si no hay variables de Upstash configuradas, cae a un fichero `data/vigilar-config.json`. En producción siempre usa Upstash.

### API route
- `GET /api/vigilar` → devuelve la config actual
- `POST /api/vigilar` con `action`:
  - `addMarca` — añade una marca
  - `deleteMarca` — borra una marca y sus datos
  - `revisar` — consulta la API de Shopify para todas las marcas y actualiza resultados

---

## Agente 3 — Post para Google Business Profile

### URL: `/google-business`

Genera el texto para la sección **Novedades** de Google Business Profile. Soporta **2 negocios**:

| Negocio | Web | Campos | CTA |
|---|---|---|---|
| **La Tienda de Cosméticos** | latiendadecosmeticos.com | Tema + Marca (productos opcionales) | siempre menciona latiendadecosmeticos.com |
| **Aquatherapia** | spasalamanca.com | Tema + Servicio (productos opcionales) | siempre menciona spasalamanca.com |

### Cómo funciona

1. El usuario elige el negocio y rellena Tema + Marca/Servicio
2. Gemini redacta el texto al estilo de GBP: con emojis, tono profesional y CTA con la URL correcta
3. GBP no tiene campo de título, así que se genera **solo el texto del post**

### Resultado
- **Texto** con contador de caracteres, botón Copiar y botón Regenerar para obtener otra versión

### Cómo publicar en GBP
1. Google Business Profile → Añadir actualización → Novedades
2. Subir la imagen
3. Pegar el Texto generado

### API route
- `POST /api/google-business`
  - Body `{ negocio, marca?/servicio?, productos? }` → genera el post
  - Body `{ accion: "regenerar", ... }` → regenera el texto

---

## Agente 4 — Vigilar competidores

### URL: `/vigilar-competidores`

Detecta descuentos en las webs de competidores que tú definas, organizado por marca.

### Estructura
- **Marca** (eje principal) → lista de **competidores**, cada uno con su URL concreta
- Ej: marca "Atache" → competidor "Web X" con `https://webx.com/atache-rebajas`

### Scraper genérico

Detecta automáticamente la plataforma de la web del competidor y extrae los descuentos:
- **WooCommerce** — busca precios en `ins`/`del`
- **PrestaShop** — parsea el HTML de listado
- **Shopify** — usa su API JSON pública

### PDF

Botón PDF **a nivel de marca**: todos los competidores de esa marca en un único documento.

### Persistencia
Upstash KV, clave `vigilar-comp-config`. Mismo formato de detección de cambios (`previos`).

### API route
- `GET /api/vigilar-comp` → devuelve la config actual
- `POST /api/vigilar-comp` con `action`: `addMarca`, `deleteMarca`, `addCompetidor`, `deleteCompetidor`, `revisar`

### ⚠️ Limitación importante
Las webs con **Cloudflare Bot Management** (Notino, Douglas, Sephora…) **NO se pueden scrapear** sin un navegador headless de pago. Por eso no están montadas. Si en el futuro quisieras vigilarlas, habría que asumir un coste — no es gratis.

---

## Exclusión de packs (Agentes 2 y 4)

Ambos vigiladores filtran títulos que contengan: `pack, set, kit, lote, duo, dúo, trio, trío, estuche, bundle, caja, cofre, box, programa, rutina`.

---

## Detección de cambios de precio

- **No hay revisión automática (cron).** La revisión es **manual** con el botón "Revisar ahora".
- "Nuevo" = compara los precios actuales contra el último estado guardado en Upstash KV.
- Vercel ofrece un cron gratuito, pero se dejó **sin montar a propósito** para mantener el proyecto simple y gratis (decisión de jun 2026). Se puede activar cuando quieras.

---

## Stack técnico

- **Framework**: Next.js 15.5 (App Router, TypeScript 5.8), React 19 — software libre, gratis siempre
- **IA**: Google Gemini 2.5 Flash (gratis, sin tarjeta)
- **Scraping**: node-html-parser 8.0 (software libre)
- **Persistencia**: Upstash KV (Redis) — claves `vigilar-config` y `vigilar-comp-config`
- **Hosting**: Vercel (Hobby, gratis), deploy automático desde GitHub
- **Claves API** (`.env.local` en local + Vercel → Settings → Environment Variables):
  - `GEMINI_API_KEY`
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN`

---

## Estructura de archivos

```
suite-aquatherapia/
├── app/
│   ├── page.tsx                       ← Home — hub con tarjetas de acceso a cada agente
│   ├── globals.css                    ← Estilos globales
│   ├── layout.tsx
│   ├── ficha-producto/page.tsx        ← Agente 1: generador de fichas
│   ├── vigilar-precios/page.tsx       ← Agente 2: monitor de precios
│   ├── google-business/page.tsx       ← Agente 3: posts Google Business
│   ├── vigilar-competidores/page.tsx  ← Agente 4: monitor de competidores
│   └── api/
│       ├── gemini.ts                  ← Lógica compartida Gemini
│       ├── generate/route.ts          ← Generación de ficha completa
│       ├── regenerate/route.ts        ← Regeneración por sección
│       ├── google-business/route.ts   ← API posts Google Business
│       ├── vigilar/route.ts           ← API del monitor de precios
│       └── vigilar-comp/route.ts      ← API del monitor de competidores
├── data/
│   └── vigilar-config.json            ← Solo fallback en local (en prod se usa Upstash)
├── .env.local                         ← Claves API (no subir a GitHub)
└── package.json
```

---

## Home — hub de herramientas

### URL: `/`

Muestra una tarjeta por cada agente. La tarjeta de "Vigilar precios" lleva un badge dinámico:
- Rojo con "X nuevos" si hay descuentos nuevos desde la última revisión
- Gris con "X descuentos" si hay descuentos pero ninguno nuevo

La home usa `export const dynamic = "force-dynamic"` para leer Upstash en cada visita y mostrar el badge actualizado.

---

## Nota sobre Google Gemini

- La clave API es **gratuita** (no necesita tarjeta)
- Modelo en uso: `gemini-2.5-flash`
- Límite gratuito: 15 peticiones/min · 1.500/día
- Si aparece "modelos saturados", esperar unos segundos y volver a intentar

---

## Ideas para más adelante (no implementadas)

1. **Historial de fichas** — Guardar las últimas fichas generadas para recuperarlas
2. **Marcas guardadas** — Presets con Nombre/Línea/Marca precargados
3. **Alt text para imágenes** — Generar texto alternativo SEO para fotos del producto
4. **Programar revisiones automáticas** — Vercel Cron gratuito (dejado sin montar a propósito)
