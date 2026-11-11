# Conexión con Google (fichas, Search Console y Analytics)

La Suite usa una sola cuenta de Google (la que gestiona las fichas y tiene acceso a Search Console y GA4), conectada por OAuth desde **Conexión con Google** (`/conexion-google`). El permiso permanente (refresh token) y qué ficha/propiedad corresponde a cada negocio se guardan en Upstash KV (`google-conexion`, `google-ajustes`).

## Qué hace
- **Datos de Google** (`/datos-google`): ficha (Business Profile Performance API), Search Console (Search Analytics) y GA4 (Data API). Por defecto 28 días comparados con los 28 anteriores. La posición media no se muestra con menos de 100 impresiones.
- **Responder reseñas de Google**: lista las reseñas reales de la ficha (My Business API v4), la IA redacta la respuesta, se edita y se publica (o se cambia/borra) en Google.
- **Post para Google Business**: el texto se puede editar y publicar como novedad en la ficha (localPosts, sin foto).

## Configuración (una vez)
1. **Google Cloud** (console.cloud.google.com), con la cuenta de la empresa: crear un proyecto «Suite Aquatherapia».
2. **APIs y servicios → Biblioteca**, activar:
   - Google Search Console API
   - Google Analytics Data API y Google Analytics Admin API
   - My Business Account Management API, My Business Business Information API, Business Profile Performance API y Google My Business API
3. **Pedir acceso a la API de Perfil de Empresa**: formulario «Business Profile API access» (https://support.google.com/business/contact/api_default), con el número del proyecto. Sin aprobación, las APIs de fichas tienen cuota 0. Search Console y Analytics funcionan sin esperar.
4. **Pantalla de consentimiento de OAuth**: tipo **Interno** si la cuenta es de Google Workspace (no caduca y no hay que verificar). Si es una cuenta @gmail.com, tipo Externo y **publicar la app** («En producción»): en modo Prueba Google corta el permiso a los 7 días.
5. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. URI de redirección autorizado: `https://suite-aquatherapia.vercel.app/api/google/callback` (y `http://localhost:3000/api/google/callback` para local).
6. **Vercel → Settings → Environment Variables**: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Volver a desplegar.
7. En la Suite, **Conexión con Google → Conectar con Google**, aceptar los permisos y elegir la ficha, la propiedad de Search Console y la de GA4 de cada negocio.

## Cuotas
Search Console: 1.200 consultas/min. GA4 Data API: 200.000 tokens/día por propiedad. Business Profile: 300 consultas/min una vez aprobado. Cada vista de «Datos de Google» hace entre 1 y 5 consultas: no hay riesgo con el uso normal.
