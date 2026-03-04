# OG Image Dinámico + Fix Cover Image — Design

**Date:** 2026-03-04
**Feature:** WhatsApp/social link preview con foto de portada del evento + logo eventiapp; fix imagen de portada rota en dashboard

---

## Goal

Cuando se comparte el link de momentos (`/e/:identifier/momentos`) en WhatsApp, el preview muestra la foto de portada del evento a full con el logo de eventiapp pequeño en la esquina inferior derecha. De paso se corrige que la imagen de portada aparezca rota en el dashboard admin.

---

## Root Cause del Bug (Cover Image Rota)

El controller `POST /events/:id/cover` guarda en DB el S3 path crudo (`events/uuid.webp`), no una URL. El dashboard muestra `event.cover_image_url` directamente — el browser intenta cargar `events/uuid.webp` como URL y falla.

```go
event.CoverImageURL = s3Path  // ← "events/uuid.webp", no es URL
```

**Fix:** Al serializar el evento en los endpoints GET, si `cover_image_url` no empieza con `http`, generar presigned URL de 12h on-the-fly (mismo patrón que los momentos).

---

## Architecture

```
[WhatsApp scrapes Astro page]
         ↓
[Astro SSR: momentos.astro]
  → GET /api/events/:identifier/meta  (Backend Go, nuevo)
  → buildOgImageUrl({ cover, title }) → "dashboard.eventiapp.com/api/og?cover=...&title=..."
  → <meta og:image="dashboard.eventiapp.com/api/og?...">
         ↓
[WhatsApp fetches og:image URL]
         ↓
[Dashboard Next.js: GET /api/og?cover=URL&title=...]
  → @vercel/og ImageResponse 1200×630
  → foto de portada full + logo PNG esquina inferior derecha
  → devuelve PNG
```

**Projects touched:**
| Project | Changes |
|---------|---------|
| Backend Go | Fix event serializer (cover URL resolution) + nuevo `/meta` endpoint |
| Dashboard Next.js | Nuevo `/api/og` route handler |
| Astro | Ya cableado — solo verificar env var `PUBLIC_DASHBOARD_URL` |

---

## Backend Changes

### 1. Fix cover_image_url serialization

**File:** `controllers/events/events_controller.go` (o donde se serializa el evento para GET)

Cuando `event.CoverImageURL` no empieza con `http`, resolver a presigned URL antes de responder:

```go
func resolveCoverURL(rawPath string) string {
    if rawPath == "" || strings.HasPrefix(rawPath, "http") {
        return rawPath
    }
    parts := strings.Split(rawPath, "/")
    filename := parts[len(parts)-1]
    folder := strings.Join(parts[:len(parts)-1], "/")
    url, _ := bucketrepository.GetPresignedFileURL(filename, folder, bucket, "aws", 720)
    return url
}
```

Aplicar en: `GetEventByID`, `GetEventByIdentifier`, `ListEvents` (cualquier endpoint que devuelva eventos al dashboard).

### 2. Nuevo endpoint `/api/events/:identifier/meta`

**File:** `controllers/events/meta_controller.go` (nuevo archivo)

- Público (sin auth middleware)
- Busca evento por `identifier` (slug)
- Devuelve solo campos para OG:

```json
{
  "data": {
    "name": "Boda Andrés & Ivanna",
    "cover_image_url": "https://bucket.s3.amazonaws.com/events/uuid.webp?X-Amz-...",
    "event_type": "WEDDING",
    "event_date_time": "2026-04-15T18:00:00Z"
  }
}
```

- La `cover_image_url` ya resuelta (presigned, 12h)
- Si no hay portada, devuelve `cover_image_url: ""`
- Cache-Control: `public, max-age=3600` (1h — WhatsApp re-scrapes poco)

**Route registration:** `e.GET("/api/events/:identifier/meta", events.GetEventMeta)` — sin auth middleware.

---

## Dashboard Changes

### `GET /api/og` Route Handler

**File:** `src/app/api/og/route.tsx` (nuevo)

**Dependency:** `@vercel/og` (ya incluido en Next.js 13+, no requiere instalación separada)

**Query params:**
- `cover` — URL de la foto de portada (puede ser presigned S3 URL)
- `title` — nombre del evento (usado como alt text)

**Visual layout (1200×630):**
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                 [foto de portada — full]                     │
│                                                              │
│                                                              │
│                                                              │
│                                          [logo eventiapp]    │
└──────────────────────────────────────────────────────────────┘
```

- Foto de portada: `object-fit: cover`, 100% width/height
- Logo: PNG blanco o de marca, ~120px ancho, esquina inferior derecha, padding 24px
- Fallback si no hay cover: fondo degradado de marca (#1a1a2e → #16213e) + logo centrado grande

**Response headers:**
```
Content-Type: image/png
Cache-Control: public, max-age=86400, s-maxage=86400
```

**Logo:** Embebido como base64 en el route handler para evitar fetch adicional.

---

## Astro Changes

Mínimas — el cableado ya existe en `og.ts` y `momentos.astro`.

**Verificar en `.env`:**
```
PUBLIC_DASHBOARD_URL=https://dashboard.eventiapp.com
```

Si no está, `buildOgImageUrl` devuelve `cover_image_url` directamente (fallback ya implementado).

---

## Error Handling

| Escenario | Comportamiento |
|-----------|---------------|
| Evento sin foto de portada | `/api/og` muestra fondo degradado + logo centrado |
| Cover URL inaccesible (presigned expiró) | `@vercel/og` falla el fetch → fallback a fondo degradado |
| Backend `/meta` devuelve 404 | `og.ts` intenta fallback a `/page-spec`, luego null |
| `/api/og` sin `cover` param | Fallback a fondo degradado + logo |
| Dashboard URL no configurada | `buildOgImageUrl` devuelve cover URL directa (no branded) |

---

## Out of Scope

- CloudFront para covers (mejora futura — agregar `CLOUDFRONT_DOMAIN` env var)
- OG image para otras páginas (`/upload`, `/rsvp`, home del evento)
- Texto del nombre del evento sobre la imagen (decisión: solo logo)
- Invalidación de caché al cambiar la portada (WhatsApp cachea agresivamente de todos modos)
