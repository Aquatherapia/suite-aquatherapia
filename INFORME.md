# Herramientas IA — La Tienda de Cosméticos

## Qué es esta app

Una suite de herramientas con IA para latiendadecosmeticos.com, construida con Next.js. Actualmente tiene dos agentes:

1. **Generador de fichas de producto** — Rellenas los datos y la IA redacta la ficha completa
2. **Vigilar precios en Cosméticos24h** — Detecta descuentos en tus marcas y avisa si cambian

---

## Cómo arrancar

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
- Filtra productos multi-unidad: pack, set, kit, lote, duo, trío, estuche, bundle, caja, cofre, box, programa

### Interfaz

**Columna izquierda:** lista de marcas vigiladas con botón de borrar + formulario para añadir nuevas (el slug se genera automáticamente desde el nombre)

**Columna derecha:** resultados agrupados en:
- **Nuevos hoy** — productos con descuento que son nuevos o han cambiado de %
- **Ya conocidos** — descuentos ya detectados en revisiones anteriores
- **Sin descuentos** — marcas sin ningún descuento activo (✓ en verde)

Cada marca es un acordeón desplegable que muestra todos sus productos con descuento, precio actual y precio tachado. Si hay más de 5 productos aparece el botón "Ver X más →".

### Notificaciones

Si el usuario activa los permisos, el navegador lanza una notificación de escritorio automáticamente al terminar la revisión cuando hay productos nuevos o con cambio de %.

### Persistencia

Los datos se guardan en `data/vigilar-config.json`:

```json
{
  "marcas": [{ "nombre": "Atache", "slug": "atache" }],
  "ultimaRevision": "2026-06-25T...",
  "resultados": [...],
  "urlsPrevias": { "atache": { "https://...": 20 } }
}
```

`urlsPrevias` guarda `{ slug → { url → % descuento } }` para detectar cambios de precio en la siguiente revisión.

### API route
- `GET /api/vigilar` → devuelve la config actual
- `POST /api/vigilar` con `action`:
  - `addMarca` — añade una marca
  - `deleteMarca` — borra una marca y sus datos
  - `revisar` — consulta la API de Shopify para todas las marcas y actualiza resultados

---

## Stack técnico

- **Framework**: Next.js 15 (App Router, TypeScript)
- **IA**: Google Gemini 2.5 Flash (gratis, sin tarjeta)
- **Clave API Gemini**: `suite-aquatherapia/.env.local`
- **Persistencia vigilar**: `data/vigilar-config.json` (generado automáticamente)

---

## Estructura de archivos

```
suite-aquatherapia/
├── app/
│   ├── page.tsx                    ← Home — hub con tarjetas de acceso a cada agente
│   ├── globals.css                 ← Estilos globales
│   ├── layout.tsx
│   ├── ficha-producto/
│   │   └── page.tsx                ← Agente 1: generador de fichas
│   ├── vigilar-precios/
│   │   └── page.tsx                ← Agente 2: monitor de precios
│   └── api/
│       ├── gemini.ts               ← Lógica compartida Gemini
│       ├── generate/route.ts       ← Generación de ficha completa
│       ├── regenerate/route.ts     ← Regeneración por sección
│       └── vigilar/route.ts        ← API del monitor de precios
├── data/
│   └── vigilar-config.json         ← Config + resultados (auto-generado)
├── .env.local                      ← GEMINI_API_KEY (no subir a GitHub)
└── package.json
```

---

## Home — hub de herramientas

### URL: `/`

Muestra una tarjeta por cada agente. La tarjeta de "Vigilar precios" lleva un badge dinámico:
- Rojo con "X nuevos" si hay descuentos nuevos desde la última revisión
- Gris con "X descuentos" si hay descuentos pero ninguno nuevo

La home usa `export const dynamic = "force-dynamic"` para leer el JSON en cada visita y mostrar el badge actualizado.

---

## Nota sobre Google Gemini

- La clave API es **gratuita** (no necesita tarjeta)
- Modelo en uso: `gemini-2.5-flash`
- Si aparece "modelos saturados", esperar unos segundos y volver a intentar

---

---

## Agente 3 — Post para Google Business Profile

### URL: `/google-business`

Convierte un post de Instagram en un texto e imagen listos para publicar en la sección **Novedades** de Google Business Profile.

### Cómo funciona

1. El usuario pega la URL del post de Instagram
2. La app intenta extraer automáticamente el caption y la imagen (`og:image` del HTML)
3. Si la extracción falla (Instagram bloqueó el acceso), el usuario puede pegar el caption manualmente
4. Gemini reescribe el caption al formato de GBP: sin hashtags, tono profesional, 100-300 caracteres
5. Se genera un **Título** (20-58 chars) y un **Texto del post** con CTA al final

### Resultado

- **Imagen**: preview con botón "Abrir imagen →" para descargar desde Instagram
- **Título**: con contador de caracteres y botón Copiar
- **Texto**: con contador, botón Copiar y botón Regenerar para obtener una versión diferente
- Desplegable con el caption original de Instagram (para referencia)

### Cómo publicar en GBP

1. Google Business Profile → Añadir actualización → Novedades
2. Subir la imagen
3. Pegar el Título y el Texto generados

### API route
- `POST /api/google-business`
  - Body `{ url, captionManual? }` → genera el post
  - Body `{ accion: "regenerar", captionOriginal }` → regenera título y texto

---

## Ideas para más adelante

1. **Historial de fichas** — Guardar las últimas fichas generadas para recuperarlas
2. **Marcas guardadas** — Presets con Nombre/Línea/Marca precargados
3. **Alt text para imágenes** — Generar texto alternativo para fotos del producto
4. **Programar revisiones automáticas** — Lanzar la revisión de precios a una hora fija cada día
5. **Subir a Vercel** — Para acceder desde cualquier sitio sin necesidad del portátil
