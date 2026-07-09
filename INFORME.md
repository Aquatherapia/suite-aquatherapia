# Herramientas IA — La Tienda de Cosméticos

## Qué es esta app

Una suite de herramientas con IA para latiendadecosmeticos.com, construida con Next.js. Tiene **9 agentes**:

1. **Generador de fichas de producto** — Rellenas los datos y la IA redacta la ficha completa
2. **Vigilar precios en Cosméticos24h** — Detecta descuentos en tus marcas y avisa si cambian
3. **Post para Google Business Profile** — Convierte ideas/posts en texto listo para publicar (2 negocios)
4. **Vigilar competidores** — Detecta descuentos en las webs de competidores que tú elijas
5. **Informe de marketing mensual** — Subes los CSV de tus herramientas y la IA monta el informe mensual completo (canales, ventas, ROAS, comparativa interanual) en PDF
6. **Vigilar novedades de marcas** — Detecta cuándo una marca sube productos nuevos a su web, para ser de los primeros en venderlos
7. **Responder reseñas de Google** — Pegas la reseña de un cliente y la IA redacta una respuesta profesional lista para publicar (2 negocios)
8. **Comparar mis precios con Cosméticos24h** — Cruza TUS precios (latiendadecosmeticos.com) con los de Cosméticos24h por marca: marca dónde vas más caro y qué productos tienen ellos que tú no
9. **Control de márgenes** — Subes el CSV de control de stocks y detecta los productos con menos del 30% de margen; diagnostica si es por descuento o por precio/coste, y exporta a Excel (con EAN) para el encargado de precios

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

La cabecera muestra **"Análisis actualizado el [fecha] a las [hora]"** además del tiempo relativo ("hace X").

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

Botón PDF **a nivel de marca**: todos los competidores de esa marca en un único documento. Cada tarjeta del PDF **enlaza al producto** del competidor. (El scraper convierte las URLs e imágenes relativas en absolutas para que los enlaces funcionen; si vigilabas marcas de antes de este arreglo, vuelve a pulsar "Revisar ahora" para reescribir las URLs viejas.)

### Fecha del análisis
La cabecera muestra **"Análisis actualizado el [fecha] a las [hora]"** además del tiempo relativo ("hace X").

### Persistencia
Upstash KV, clave `vigilar-comp-config`. Mismo formato de detección de cambios (`previos`).

### API route
- `GET /api/vigilar-comp` → devuelve la config actual
- `POST /api/vigilar-comp` con `action`: `addMarca`, `deleteMarca`, `addCompetidor`, `deleteCompetidor`, `revisar`

### ⚠️ Limitación importante
Las webs con **Cloudflare Bot Management** (Notino, Douglas, Sephora…) **NO se pueden scrapear** sin un navegador headless de pago. Por eso no están montadas. Si en el futuro quisieras vigilarlas, habría que asumir un coste — no es gratis.

---

## Agente 5 — Informe de marketing mensual

### URL: `/informes`

Genera un **informe de marketing mensual completo** (12 secciones) a partir de los CSV que el usuario exporta de sus herramientas (Google Analytics, Google Ads, su tienda…). **No se conecta a ninguna API externa**: el usuario **sube los archivos** y la IA los lee, los agrupa por fuente y redacta el informe.

> Por qué se hizo así: se valoró la conexión automática a Google Analytics (cuenta de servicio), pero el usuario la descartó por el lío de configuración. El modo "subir CSV" es 100% gratis, sin claves nuevas y sin trámites.

### Cómo funciona
1. El usuario indica el **mes** del informe y el periodo de **comparación** (mismo mes del año anterior).
2. **Sube uno o varios CSV** (arrastrar o clic). Típicos: canales de adquisición, top productos. Los vacíos no pasa nada.
3. Pulsa **Generar** y Gemini monta el informe con **12 secciones**: resumen ejecutivo, resumen global, rendimiento por canal (agrupado), ventas por marca/categoría, productos destacados, embudo, clientes, campañas, KPIs ecommerce, comparativa interanual y conclusiones/plan de acción.
4. El informe se ve **maquetado** (encabezados en negrita, viñetas, % en verde/rojo) con botones **Copiar** y **Descargar PDF** (vía impresión del navegador — gratis, sin librerías).

### Agrupación de canales (configurable en el código)
- **Publicidad de pago (Google Ads)**: Paid Search + Paid Shopping + Cross-network + Display + Paid Video
- **SEO / Orgánico**: Organic Search · **Redes sociales**: Organic Social + Paid Social
- **Email** · **Directo** · **Referral** · **Otros** (Unassigned, Organic Shopping, marketplaces…)

### Cifras exactas (clave)
Cuando detecta el **CSV de canales** de Analytics ("Adquisición de tráfico: Grupo de canales"), la app **parsea y suma los totales con código** (sesiones, pedidos = *eventos clave*, ingresos, ticket medio, conversión; global y por grupo, con su % interanual) y se los pasa a la IA **ya calculados** para que las cifras clave **no tengan errores de cálculo** de la IA. El total global es la **suma de los canales del CSV** (puede diferir un poco del "Total" que muestra la interfaz de Analytics; es una rareza de cómo Analytics agrega su fila Total).

### Decisiones de alcance
- **Sin margen ni beneficio**: el usuario no aporta costes. El informe trabaja solo con **facturación/ventas y ROAS** (ventas por euro invertido, no beneficio).
- Productos: top vendidos; el CSV se recorta a las **~200 primeras filas** por tamaño (las más relevantes).
- Las secciones sin datos salen como **"Sin datos disponibles este mes"** (no se inventa nada).

### Límites (gratis)
Solo usa **Gemini** (15 informes/min · 1.500/día; gasta 1 por informe) y **Vercel**. **No usa Upstash.** Aviso de privacidad: en el plan gratuito de Gemini, Google puede usar los datos subidos para entrenar → **no subir CSV con datos personales de clientes** (nombres, emails, teléfonos).

### API route
- `POST /api/informes` con `{ periodo, periodoComparacion, notas?, archivos: [{ name, content }] }` → devuelve `{ informe }`.

---

## Agente 6 — Vigilar novedades de marcas

### URL: `/vigilar-novedades`

Detecta cuándo una marca **sube productos nuevos** a su web, para ser de los primeros en tenerlos/venderlos.

### Cómo funciona
- Añades una marca con la **URL de su tienda** (o de una colección/listado).
- Al pulsar **Revisar ahora**, la app lee los productos de esa web (mismo scraper que competidores: detecta WooCommerce, PrestaShop y Shopify).
- Compara las URLs de producto contra las **ya vistas** en revisiones anteriores; las que no había antes se marcan como **nuevas**. En Shopify además usa la fecha de alta del producto.
- Muestra solo los productos nuevos de cada marca.

### Persistencia
Upstash KV, clave `vigilar-novedades-config`. `previos` guarda `{ marcaId → [URLs vistas alguna vez] }`.

### API route
- `GET /api/vigilar-novedades` → config actual
- `POST /api/vigilar-novedades` con `action`: `addMarca`, `deleteMarca`, `revisar`

### ⚠️ Misma limitación que competidores
Las webs con Cloudflare Bot Management (Notino, Douglas, Sephora…) no se pueden leer sin navegador headless de pago.

---

## Agente 7 — Responder reseñas de Google

### URL: `/responder-resenas`

Pegas la reseña de un cliente y la IA redacta la **respuesta pública** lista para publicar en tu Perfil de Empresa (Google Business).

### Entradas
- **Negocio**: La Tienda de Cosméticos o Aquatherapia (da el contexto correcto a la respuesta).
- **Nombre del cliente** (opcional) — para saludarlo por su nombre.
- **Valoración 1-5 estrellas** — ajusta el tono (positiva → agradecimiento; negativa → empatía y disculpa).
- **Texto de la reseña** (opcional) — si el cliente solo dejó estrellas, funciona igual.

### Estilo de la respuesta
Corta (1-2 frases), muy familiar y cálida, con 1-2 emojis. **No repite ni parafrasea** lo que dice la reseña y **varía** el saludo y la despedida en cada respuesta. No firma con "El equipo de…".

### Resultado
Texto con botones **Copiar** y **"Redactar otra versión"**, más una guía de cómo publicarlo en Google.

### Límites (gratis)
Solo usa **Gemini** (1 petición por respuesta). No usa Upstash.

### API route
- `POST /api/responder-resenas` con `{ negocio, autor?, estrellas, resena? }` → devuelve `{ texto }`.

---

## Agente 8 — Comparar mis precios con Cosméticos24h

### URL: `/comparar-precios`

Cruza **tus precios** (latiendadecosmeticos.com) con los de **Cosméticos24h**, marca a marca. Dos salidas por marca:
1. **Comparación de precios** — producto | tu precio | su precio | diferencia. En **rojo** dónde tú vas más caro; en verde dónde vas más barato.
2. **Tienen ellos y tú no** — productos de esa marca que Cosméticos24h vende y tú aún no tienes (posibles novedades / huecos de catálogo).
3. **Packs/estuches que tienen ellos y tú no** — los packs suyos que no tienes, listados aparte (por si alguno interesa añadirlo).

### Cómo funciona (dos fuentes, sin API de pago)
- **Tu web**: lee tu `sitemap.xml`, filtra los productos cuyo slug contiene el nombre de la marca, y de cada ficha extrae el precio del **JSON-LD (schema.org)**. Tu web es a medida (nginx+PHP, sin Cloudflare) y expone JSON-LD en cada producto → scraping fiable.
- **Cosméticos24h**: API pública de Shopify `/collections/{slug}/products.json` (igual que el Agente 2).

### Emparejamiento por NOMBRE (limitación clave)
Cosméticos24h **no publica el EAN** en su API (`barcode: null`) y su SKU es interno suyo → **no hay código común**. Se empareja por **marca + nombre + ml** (similitud de tokens, Jaccard, umbral 0.34). Consecuencias:
- No es 100% perfecto: algún producto puede quedar sin emparejar o con match de baja confianza (se marca con `≈` para que lo revises).
- **Packs**: se emparejan solo **pack con pack** (nunca un pack suyo contra un producto suelto tuyo). Los que tenéis ambos se comparan (con etiqueta "pack"); los que solo tienen ellos se listan en su propia sección "Packs/estuches que tienen ellos y tú no". Aun así, sus packs-combo (dos productos juntos) pueden cruzarse con un pack tuyo más simple → si pasa, se oculta con la ×.
- En la prueba con Atache: 95 productos tuyos, 120 suyos → ~79 comparados (incl. algún pack) + 17 novedades sueltas + 23 packs solo suyos.

### Ojo con las ofertas del competidor
El precio que se compara es el **precio de venta actual de cada uno**. Si Cosméticos24h tiene una marca en oferta (p. ej. Atache con −20%), muchos productos saldrán como "tú más caro" simplemente porque ellos están rebajados en ese momento. Es correcto, pero tenlo en cuenta al leerlo.

### Enlazar productos a mano (corrige los fallos de emparejamiento)
Como el cruce es por nombre, a veces enlaza mal o no encuentra el equivalente. Se puede **forzar el enlace correcto** y queda guardado (tiene prioridad sobre el automático y sobrevive a las revisiones):
- **Fila mal emparejada** → botón **✎** en la fila: pegas la **URL de Cosméticos24h** correcta y se re-enlaza. La fila queda con etiqueta verde **"✓ manual"**. Desde el mismo editor se puede **"Quitar enlace manual"** (vuelve al automático).
- **Producto tuyo que no encuentra** → sección desplegable **"Tus productos sin emparejar (N)"**: lista tus productos de esa marca que no cruzaron con ninguno suyo; en cada uno pegas su **URL de C24h** para enlazarlos.
- **En "Tienen ellos y tú no" y en "Packs que tienen ellos y tú no"** → cada fila tiene botón **✎** ("Ya lo tengo"): como aquí el ancla es el producto SUYO, pegas la **URL de TU web** (latiendadecosmeticos.com) y se enlazan. Útil porque muchos de esos "no los tienes" en realidad sí los tienes con otro nombre. Valida que la URL sea de latiendadecosmeticos.com.
- Al enlazar, la app lee ese producto de la API de C24h y crea la comparación **al instante** (sin re-escanear toda tu web). Se guarda en Upstash (`mapeos`, por marca). Si pegas una URL que no es de C24h o de otra marca, avisa con un error claro.

### Excluir productos a mano
Cada fila (tanto en la comparación como en "tienen ellos y tú no") tiene un botón **×** para **ocultarla**. Sirve para quitar los matches erróneos (cuando por nombre cruza dos productos distintos). Lo ocultado:
- Desaparece al instante y **se mantiene oculto aunque vuelvas a revisar**.
- Se guarda en Upstash (`excluidos`, por marca), con **precios y tipo**: si venía de la comparación guarda tu precio, el de C24h y la diferencia; si venía de "tienen ellos y tú no" lo marca como tal.
- En la lista "Ocultos (N)" cada producto muestra esos precios (o la etiqueta "Tienen ellos y tú no") y un **desplegable "Oculto por:"** para elegir el motivo (Compara productos diferentes · Ya lo tengo, no lo detecta · No me interesa · Otro motivo · Sin especificar). El motivo se guarda.
- Se puede **restaurar** desde esa misma lista (reaparece en la siguiente revisión).
- Los ocultos guardados **antes** de esta función no tenían precios; al **revisar** la marca, la app los rellena automáticamente (busca el producto en Cosméticos24h y lo reempareja con tu web).

### PDF por marca
Cada marca tiene un botón **PDF** (en su cabecera) que genera un documento descargable (vía impresión del navegador, gratis) con: resumen (nº comparados y en cuántos vas más caro), la **tabla de comparación** (tú vs. C24h, diferencia en rojo/verde, con etiquetas "manual"/"pack"), y las listas de "tienen ellos y tú no" y de packs. Ordenado por diferencia (lo más caro primero). **Enlaces clicables** (jul 2026): en la tabla de comparación, el precio de la columna "Tú" enlaza a tu ficha y el de "Cosméticos24h" a la suya; en las listas "tienen ellos y tú no" y packs, el nombre del producto enlaza a su ficha en Cosméticos24h.

### Solo PVP (sin margen)
Compara precio de venta contra precio de venta. El **coste de compra no es público** (vive en tu panel de admin), así que no hay margen/beneficio.

### Rendimiento y límite de Vercel
Leer tu web es 1 petición por producto (en paralelo, de 10 en 10). La función usa `maxDuration = 60` (Vercel Hobby lo permite **gratis**; el defecto son 10s). La revisión es **siempre marca a marca** (una sola): cada marca tiene su botón "Revisar" en la columna izquierda. No hay "Revisar todas" a propósito, para evitar esperas largas y no saturar la web propia; la API rechaza cualquier revisión sin marca (HTTP 400). Nota: este agente **no usa Gemini/IA**, así que revisar no consume tokens de ningún tipo — el motivo del límite es solo tiempo/carga.

### Persistencia
Upstash KV, clave `comparar-precios-config`. En local cae a `data/comparar-precios-config.json`. Guarda `{ marcas: [{nombre, slug, miToken}], ultimaRevision, resultados, excluidos, mapeos }`. Al revisar una marca concreta, solo se reemplaza esa (las demás se conservan). `mapeos` (enlaces manuales) y `excluidos` (ocultos) se conservan siempre.

### Límites (gratis)
Solo usa **scraping propio + API pública de Cosméticos24h + Upstash + Vercel**. **No usa Gemini.** Solo cubre marcas que Cosméticos24h también venda.

### API route
- `GET /api/comparar-precios` → config actual
- `POST /api/comparar-precios` con `action`: `addMarca` (nombre, slug, miToken?), `deleteMarca` (slug), `revisar` (requiere slug; sin slug → HTTP 400), `excluir` (slug, item{suUrl,titulo,tipo,miPrecio?,suPrecio?,miUrl?} → oculta un producto guardando sus precios), `motivo` (slug, suUrl, motivo → fija el motivo de ocultación), `incluir` (slug, suUrl → lo restaura), `mapear` (slug, miUrl, suUrl → enlaza a mano tu producto con el suyo; actualiza al instante), `desmapear` (slug, miUrl → deshace el enlace manual)

---

## Agente 9 — Control de márgenes

### URL: `/margenes`

Subes el **CSV de control de stocks** (export de PrestaShop) y te marca los productos cuyo **margen** es inferior a un umbral (30% por defecto). Para cada uno **diagnostica la causa** (descuento o precio/coste) y permite **exportar a Excel** para el encargado de precios.

### Cómo calcula el margen (clave: IVA)
El **PRECIO (columna I)** lleva **IVA (21% por defecto)**; el **P.COSTE REAL (columna L)** **NO** lleva IVA. Por eso primero se quita el IVA al precio:

```
Precio sin IVA = PRECIO / 1,21
Margen % = (Precio sin IVA − Coste) / Precio sin IVA × 100
```

Es **margen sobre el precio de venta** (estándar de retail), no markup sobre coste. Se marca todo lo que quede por debajo del umbral.

### Diagnóstico de la causa
Para cada producto marcado compara el margen actual (con el descuento ya aplicado, columna I) contra el margen a **precio de tarifa** (columna J, P. ANT):
- **Descuento** — a precio de tarifa sí llegaría al umbral, pero la promoción lo hunde → bajar el descuento.
- **Precio/Coste** — aun sin descuento no llega al umbral → subir el precio de tarifa o revisar el coste.

### Productos omitidos
Los productos con **coste 0,00** (precio de venta pero sin coste cargado) no se pueden calcular y se **listan aparte** (desplegable "N productos omitidos"), con EAN, producto y PVP, para que se les cargue el coste en PrestaShop. Los regalos/minitallas a 0,00 € (sin precio de venta) no se listan.

### Exportar a Excel
Botón **"Exportar a Excel"** que descarga un archivo abrible directo en Excel (separador `;`, decimales con coma, BOM UTF-8 para acentos, y el `sep=;` como primera línea). Incluye:
- **Productos con margen bajo**: EAN, producto, propiedad, margen %, PVP con IVA, PVP sin IVA, coste sin IVA, problema (Descuento/Precio-Coste) y detalle.
- **Productos sin coste**: al final, con EAN y PVP, marcados como "Sin coste cargado" y la casilla de coste **vacía** para que el encargado la rellene.

El **EAN se fuerza a texto** (`="..."`) para que Excel no lo convierta a notación científica ni pierda dígitos. Archivo: `margenes-bajos_{marca}_{fecha}.csv`.

### Umbral e IVA configurables
En la propia página se pueden cambiar el **margen mínimo** (30) y el **IVA** (21). Al cambiarlos hay que **volver a subir el CSV** para recalcular.

### Formato del CSV esperado
Separador `;`. Columnas por índice (0-based): 0=ID, 4=MARCA, 5=PRODUCTO, 6=PROPIEDAD, **7=EAN**, **8=PRECIO** (con IVA, con descuento aplicado), 9=P.ANT (tarifa), 10=DESC %, **11=P.COSTE REAL** (sin IVA).

### Límites (gratis)
**No usa Gemini, ni Upstash, ni ninguna API**: todo el cálculo se hace **en el navegador** al subir el CSV. No hay persistencia (cada CSV se procesa en el momento). Sin coste de servidor ni límites de uso. También existe una skill equivalente de Claude Code (`/margen-precios`, `analizar_margen.py`) por si se quiere usar desde el chat en vez de la web.

---

## Exclusión de packs (Agentes 2, 4 y 6)

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
- **Persistencia**: Upstash KV (Redis) — claves `vigilar-config`, `vigilar-comp-config` y `vigilar-novedades-config`
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
│   ├── informes/page.tsx              ← Agente 5: informe de marketing mensual
│   ├── vigilar-novedades/page.tsx     ← Agente 6: novedades de marcas
│   ├── responder-resenas/page.tsx     ← Agente 7: respuestas a reseñas
│   ├── comparar-precios/page.tsx      ← Agente 8: comparar mis precios vs Cosméticos24h
│   ├── margenes/page.tsx              ← Agente 9: control de márgenes (cálculo en cliente, sin API)
│   └── api/
│       ├── gemini.ts                  ← Lógica compartida Gemini
│       ├── generate/route.ts          ← Generación de ficha completa
│       ├── regenerate/route.ts        ← Regeneración por sección
│       ├── google-business/route.ts   ← API posts Google Business
│       ├── vigilar/route.ts           ← API del monitor de precios
│       ├── vigilar-comp/route.ts      ← API del monitor de competidores
│       ├── informes/route.ts          ← API del informe mensual (parsea CSV de canales + Gemini)
│       ├── vigilar-novedades/route.ts ← API de novedades de marcas
│       ├── responder-resenas/route.ts ← API de respuestas a reseñas
│       └── comparar-precios/route.ts  ← API comparar mis precios vs Cosméticos24h
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
