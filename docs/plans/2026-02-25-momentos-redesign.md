# Momentos Gallery Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the public moments gallery into a premium, emotional, mobile-first editorial cascade with dynamic event phrases from DB, infinite scroll, and real image performance for up to 120 items.

**Architecture:** Three projects touched in order — Backend (Go: new model + seed + endpoint + Redis cache), then Frontend (Astro/React: full MomentsGallery.tsx redesign). Backend must be deployed/running before frontend ships. No new dependencies needed on either side.

**Tech Stack:** Go + GORM + Echo + Redis (backend) · React + Framer Motion + Tailwind + IntersectionObserver (frontend)

---

## BACKEND — Tasks 1–5

### Task 1: EventPhrase model + register in GORM

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/models/EventPhrase.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/configuration/gorm.go`

**Step 1:** Create the model file:

```go
// models/EventPhrase.go
package models

import (
	"time"
	"github.com/gofrs/uuid"
)

// EventPhrase holds a curated emotional phrase for a specific event type.
// Used by the public moments gallery to inject memory cards between photos.
type EventPhrase struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	EventType string    `gorm:"type:varchar(50);not null;index" json:"event_type"` // WEDDING, BIRTHDAY, QUINCEANERA, GRADUATION, CORPORATE, DEFAULT
	Phrase    string    `gorm:"type:text;not null" json:"phrase"`
	CreatedAt time.Time `json:"created_at"`
}
```

**Step 2:** Register in `configuration/gorm.go`. Find `modelsWithoutSeed` slice (around line 23) and add:
```go
&models.EventPhrase{},
```
Add it after `&models.EventAnalytics{}`.

**Step 3:** Verify the build compiles:
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```
Expected: no output (success).

**Step 4:** Commit:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add models/EventPhrase.go configuration/gorm.go
git commit -m "feat(phrases): EventPhrase model + GORM registration"
```

---

### Task 2: Seed — 100 wedding phrases

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/seeds/SeedEventPhrases.go`
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/configuration/gorm.go`

**Step 1:** Create the seed file with 100 wedding phrases:

```go
// seeds/SeedEventPhrases.go
package seeds

import (
	"log/slog"
	"events-stocks/models"
	"gorm.io/gorm"
)

func SeedEventPhrases(db *gorm.DB) {
	weddingPhrases := []string{
		// Short & poetic (5-8 words)
		"El amor no necesita explicaciones",
		"Hoy sus historias se vuelven una",
		"No se busca al amor, se reconoce",
		"El mejor día es el que se comparte",
		"Aquí empieza su historia juntos",
		"Amor que se ve, amor que se siente",
		"Dos almas, una misma dirección",
		"El amor es el único lujo necesario",
		"Hoy, mañana y siempre",
		"Que la vida los sorprenda juntos",
		// Warm & intimate
		"Lo más bonito no es el vestido ni las flores — es la mirada",
		"Que cada foto aquí sea un recuerdo que los haga sonreír en 30 años",
		"Bienvenidos al primer día del resto de su vida juntos",
		"El amor verdadero no se planea, simplemente aparece",
		"Gracias por dejarlos compartir este momento tan especial",
		"Hoy celebramos que dos personas decidieron elegirse para siempre",
		"No hay fotografía que capture todo lo que se siente aquí",
		"Este día lo recordarán para siempre — gracias por ser parte",
		"El amor se construye todos los días, hoy pusieron la primera piedra",
		"Juntos es el lugar más bonito del mundo",
		// Lyrical & literary
		"El amor no mira el tiempo, el tiempo mira al amor",
		"Donde hay amor, siempre hay un hogar",
		"Amar es encontrar en la felicidad de otro la propia felicidad",
		"El corazón que ama siempre es joven",
		"Dos medias naranjas que decidieron volverse una",
		"El amor es la poesía de los sentidos",
		"Quien ama con el alma, jamás se cansa",
		"El amor es la única riqueza que crece cuando se comparte",
		"Amar es dar sin esperar nada a cambio",
		"El amor es el arte más difícil y más bello",
		// Celebratory
		"¡Que vivan los novios!",
		"Un brindis por el amor que une y la vida que comienza",
		"Que sus días siempre tengan música, flores y risas",
		"Que el amor sea su compás y la alegría su destino",
		"Por el amor que los trajo hasta aquí",
		"Que cada amanecer los encuentre más enamorados",
		"Que su vida juntos sea tan bella como hoy",
		"Hoy el amor gana, y todos somos testigos",
		"Por los novios: que el amor los guíe siempre",
		"Que este día sea el más feliz de muchos más por venir",
		// Time & memory
		"Los momentos más bonitos no se compran, se viven",
		"Este instante existirá para siempre en algún lugar del tiempo",
		"Hoy es uno de esos días que recordarás toda la vida",
		"Los recuerdos son el único tesoro que nadie puede quitarte",
		"La memoria del corazón dura más que la del tiempo",
		"Guardar este momento es guardar un pedazo de felicidad",
		"El tiempo pasa, los recuerdos quedan",
		"Cada foto aquí es un capítulo de su historia",
		"Estos momentos son los que le dan sentido a todo",
		"Un día como este merece ser recordado para siempre",
		// Family & togetherness
		"El amor que une a dos familias es el amor más grande",
		"Hoy dos familias se convierten en una",
		"Rodeados de quienes más los quieren en el mundo",
		"El amor de familia es lo que hace grande a una boda",
		"Que los lazos de hoy sean inquebrantables mañana",
		"Toda la gente que más los quiere está aquí hoy",
		"Amor de familia: el más incondicional de todos",
		"Hoy todos somos parte de su historia",
		"Los amigos son la familia que uno elige",
		"Gracias a todos los que hicieron posible este día",
		// Nature & beauty
		"Como las flores al sol, el amor siempre busca la luz",
		"El amor florece donde hay tierra fértil y corazón abierto",
		"Como el río que no puede dejar de correr, el amor no puede detenerse",
		"El amor es la flor más bella del jardín de la vida",
		"Que su amor crezca como los árboles: con raíces profundas y ramas al cielo",
		"La luna llena de esta noche brilla para ustedes",
		"Que su amor sea como el mar: profundo, amplio e interminable",
		"Las estrellas se alinearon para este día",
		"La naturaleza entera celebra con ustedes",
		"Como las olas que siempre vuelven a la orilla, así es su amor",
		// Humor & lightness
		"Nota: los que lloran de emoción ya pueden soltar el pañuelo 🤍",
		"Hoy está permitido bailar hasta que los pies pidan permiso",
		"El amor es lo único que se multiplica cuando se divide",
		"El secreto de un buen matrimonio: reírse juntos todos los días",
		"La mejor decisión siempre fue la de ustedes dos",
		"Dicen que detrás de un gran hombre hay una gran mujer — o viceversa 😄",
		"Que nunca se les acaben los pretextos para celebrar",
		"La risa es el sonido del amor en voz alta",
		"Que el humor sea siempre su mejor aliado",
		"Hoy el amor y la alegría comparten el mismo escenario",
		// Deep & meaningful
		"El amor verdadero no es perfecto — es real",
		"Eligieron bien: eligieron lo que los hace mejores personas",
		"El amor no es mirarse el uno al otro, es mirar juntos en la misma dirección",
		"Hay personas que llegan a tu vida para quedarse — ellos se eligieron",
		"El amor es la respuesta, sin importar cuál sea la pregunta",
		"Que su amor sea siempre más grande que sus diferencias",
		"El matrimonio no es un destino, es un viaje que empieza hoy",
		"La vida es más bonita cuando se comparte con la persona correcta",
		"Que nunca dejen de ser el mejor lugar del mundo el uno para el otro",
		"Hoy prometieron — y eso lo cambia todo",
		// Classic & timeless
		"Para siempre empieza hoy",
		"El amor es el único bien que se multiplica al repartirse",
		"Donde el amor reina, las distancias no existen",
		"El amor no ve la edad, solo ve el corazón",
		"Que su historia de amor sea digna de contarse",
		"Unidos en el amor, fuertes en la vida",
		"El amor es la música del alma",
		"Hoy nace una nueva familia",
		"Por amor todo, sin amor nada",
		"El amor es la luz que nunca se apaga",
	}

	for _, phrase := range weddingPhrases {
		var existing models.EventPhrase
		if err := db.Where("event_type = ? AND phrase = ?", "WEDDING", phrase).First(&existing).Error; err == gorm.ErrRecordNotFound {
			entry := models.EventPhrase{
				EventType: "WEDDING",
				Phrase:    phrase,
			}
			if err := db.Create(&entry).Error; err != nil {
				slog.Error("error seeding event phrase", "phrase", phrase[:20], "error", err)
			}
		}
	}
	slog.Info("event phrases seeded", "type", "WEDDING", "count", len(weddingPhrases))
}
```

**Step 2:** Register the seed in `configuration/gorm.go`. Find `modelSeedList` (around line 47) and add:
```go
{Model: &models.EventPhrase{}, SeedFunc: seeds.SeedEventPhrases},
```
Add it as the last item in the slice.

**Step 3:** Build check:
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```
Expected: no output.

**Step 4:** Commit:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add seeds/SeedEventPhrases.go configuration/gorm.go
git commit -m "feat(phrases): seed 100 wedding phrases"
```

---

### Task 3: Phrases controller + Redis cache

**Files:**
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/phrases/phrases.go`

**Step 1:** Create the controller:

```go
// controllers/phrases/phrases.go
package phrases

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"events-stocks/models"
	redisrepository "events-stocks/repositories/redisrepository"
	"events-stocks/utils"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	gormrepo "events-stocks/repositories/gormrepository"
)

const (
	phraseCacheTTL = 1 * time.Hour
	defaultCount   = 15
	maxCount       = 30
)

// GetPhrases godoc
// GET /api/events/phrases?type=WEDDING&count=15
// Public. Returns N random phrases for the given event type.
// Cached in Redis for 1 hour per (type, count) pair.
func GetPhrases(c echo.Context) error {
	ctx := context.Background()

	eventType := strings.ToUpper(strings.TrimSpace(c.QueryParam("type")))
	if eventType == "" {
		eventType = "DEFAULT"
	}

	countStr := c.QueryParam("count")
	count, err := strconv.Atoi(countStr)
	if err != nil || count <= 0 {
		count = defaultCount
	}
	if count > maxCount {
		count = maxCount
	}

	cacheKey := fmt.Sprintf("phrases:%s:%d", eventType, count)

	// Try cache first
	if cached, err := redisrepository.GetKey(ctx, cacheKey); err == nil {
		var phrases []string
		if json.Unmarshal([]byte(cached), &phrases) == nil {
			return utils.Success(c, http.StatusOK, "Phrases retrieved", map[string]interface{}{
				"phrases": phrases,
				"source":  "cache",
			})
		}
	}

	// Fetch all phrases for type from DB (fallback to DEFAULT if none found)
	var rows []models.EventPhrase
	opts := gormrepo.QueryOptions{
		Filters: map[string]interface{}{"event_type": eventType},
	}
	if err := gormrepo.GetMany(&rows, opts); err != nil || len(rows) == 0 {
		// Try DEFAULT fallback
		opts.Filters = map[string]interface{}{"event_type": "DEFAULT"}
		if err2 := gormrepo.GetMany(&rows, opts); err2 != nil || len(rows) == 0 {
			return utils.Success(c, http.StatusOK, "No phrases found", map[string]interface{}{
				"phrases": []string{},
			})
		}
	}

	// Shuffle and pick N
	rand.New(rand.NewSource(time.Now().UnixNano())).Shuffle(len(rows), func(i, j int) {
		rows[i], rows[j] = rows[j], rows[i]
	})
	if count > len(rows) {
		count = len(rows)
	}
	selected := make([]string, count)
	for i := 0; i < count; i++ {
		selected[i] = rows[i].Phrase
	}

	// Cache result
	if data, err := json.Marshal(selected); err == nil {
		_ = redisrepository.SaveKey(ctx, cacheKey, string(data), phraseCacheTTL)
	}

	return utils.Success(c, http.StatusOK, "Phrases retrieved", map[string]interface{}{
		"phrases": selected,
		"source":  "db",
	})
}
```

**Step 2:** Check that `gormrepo.GetMany` accepts `QueryOptions` with a `Filters` field. Read `repositories/gormrepository/GormRepository.go` and verify the `QueryOptions` struct has a `Filters` map. If the field is named differently (e.g., `Where`), adjust the code above to match.

**Step 3:** Build check:
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```
Expected: no output.

**Step 4:** Commit:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add controllers/phrases/phrases.go
git commit -m "feat(phrases): GET /api/events/phrases controller with Redis cache"
```

---

### Task 4: Register route + integration test

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`
- Create: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/integration/phrases_test.go`

**Step 1:** In `routes/routes.go`, find the `public` group block where other public GET endpoints are registered. Add:

```go
import phrasesCtrl "events-stocks/controllers/phrases"

// in the public group:
public.GET("/events/phrases", phrasesCtrl.GetPhrases)
```

Place it near the existing `public.GET("/events/...")` lines.

**Step 2:** Create the integration test:

```go
// integration/phrases_test.go
package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	phrasesCtrl "events-stocks/controllers/phrases"
)

func phrasesEcho() *echo.Echo {
	e := echo.New()
	e.GET("/api/events/phrases", phrasesCtrl.GetPhrases)
	return e
}

func TestGetPhrases_DefaultCount(t *testing.T) {
	e := phrasesEcho()
	req := httptest.NewRequest(http.MethodGet, "/api/events/phrases?type=WEDDING", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal("response is not valid JSON")
	}
	data, ok := body["data"].(map[string]interface{})
	if !ok {
		t.Fatal("missing data field")
	}
	phrases, ok := data["phrases"].([]interface{})
	if !ok || len(phrases) == 0 {
		t.Fatal("expected non-empty phrases array")
	}
}

func TestGetPhrases_CustomCount(t *testing.T) {
	e := phrasesEcho()
	req := httptest.NewRequest(http.MethodGet, "/api/events/phrases?type=WEDDING&count=5", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetPhrases_UnknownTypeFallback(t *testing.T) {
	e := phrasesEcho()
	req := httptest.NewRequest(http.MethodGet, "/api/events/phrases?type=UNKNOWN_TYPE", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// Should not 500 — returns empty array or default fallback
	if rec.Code == http.StatusInternalServerError {
		t.Fatal("should not 500 for unknown event type")
	}
}
```

**Step 3:** Build check:
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```

**Step 4:** Commit:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add routes/routes.go integration/phrases_test.go
git commit -m "feat(phrases): register public route + integration tests"
```

**Step 5:** Restart the backend to apply the migration (AutoMigrate creates the table + seed runs):
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go run . &"
```
Verify in logs that `event_phrases` table is created and phrases are seeded.

**Step 6:** Smoke test the endpoint:
```bash
curl "http://localhost:8080/api/events/phrases?type=WEDDING&count=5"
```
Expected: JSON with `phrases` array of 5 strings.

---

## FRONTEND — Tasks 5–11

> All changes in `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\moments\MomentsGallery.tsx`
> unless noted otherwise.

---

### Task 5: Remove stats bar + comments marquee + update themes

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`
- Modify: `cafetton-casero/src/components/moments/themes/index.ts`

**Step 1:** Read both files to understand current structure.

**Step 2:** In `MomentsGallery.tsx`, find and **delete** the `StatsBar` component (the one with photo/video/comment counts) and all its usages. Search for `StatsBar` and remove:
- The component definition
- The `<StatsBar ... />` render call in the gallery JSX

**Step 3:** Find and **delete** the `CommentsMarquee` component and all its usages:
- The component definition
- The `<CommentsMarquee ... />` render call
- The `const comments = moments.filter(...)` line (no longer needed)
- The `doubled` variable if it exists

**Step 4:** Find and **delete** the `StatItem` and `AnimatedCounter` components (they were only used by StatsBar).

**Step 5:** In `themes/index.ts`, add a `microIcon` and `cardGradient` field to each theme. Read the current theme structure first, then add:

```typescript
// Add to each theme object in the themes/index.ts config:

// WEDDING theme:
microIcon: '🌿',
cardGradient: 'from-amber-50 to-orange-50',
cardBorder: 'border-amber-200/40',
cardTextColor: 'text-amber-900',

// GRADUATION theme:
microIcon: '🎓',
cardGradient: 'from-blue-50 to-indigo-50',
cardBorder: 'border-blue-200/40',
cardTextColor: 'text-blue-900',

// BIRTHDAY theme:
microIcon: '🎉',
cardGradient: 'from-fuchsia-50 to-orange-50',
cardBorder: 'border-fuchsia-200/40',
cardTextColor: 'text-fuchsia-900',

// QUINCEANERA theme:
microIcon: '✦',
cardGradient: 'from-rose-50 to-pink-50',
cardBorder: 'border-rose-200/40',
cardTextColor: 'text-rose-900',

// CORPORATE theme:
microIcon: '◆',
cardGradient: 'from-slate-50 to-gray-50',
cardBorder: 'border-slate-200/40',
cardTextColor: 'text-slate-800',

// DEFAULT theme:
microIcon: '✦',
cardGradient: 'from-violet-50 to-sky-50',
cardBorder: 'border-violet-200/40',
cardTextColor: 'text-violet-900',
```

Also update the TypeScript type for the theme to include these fields.

**Step 6:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep "MomentsGallery\|themes"
```
Expected: no errors.

**Step 7:** Commit:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero
git add src/components/moments/MomentsGallery.tsx src/components/moments/themes/index.ts
git commit -m "feat(gallery): remove stats bar + comments marquee, add theme card config"
```

---

### Task 6: Hero redesign

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx` (HeroHeader component)

**Step 1:** Find the `HeroHeader` component. Read its current JSX.

**Step 2:** Replace the entire `HeroHeader` component with this redesigned version:

```tsx
function HeroHeader({ eventName, eventDate, theme }: {
  eventName: string
  eventDate: string
  theme: ReturnType<typeof getTheme>
}) {
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : ''

  return (
    <div className="relative text-center py-16 sm:py-24 px-6 overflow-hidden">
      {/* Subtle theme decoration — left side */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 0.35, x: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl pointer-events-none select-none"
        aria-hidden="true"
      >
        {theme.microIcon}
      </motion.div>
      {/* Subtle theme decoration — right side */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 0.35, x: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl pointer-events-none select-none"
        aria-hidden="true"
      >
        {theme.microIcon}
      </motion.div>

      {/* Event name */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 ${theme.font}`}
      >
        {eventName || 'Momentos'}
      </motion.h1>

      {/* Event date */}
      {formattedDate && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-2 text-sm text-gray-400 tracking-wide"
        >
          {formattedDate}
        </motion.p>
      )}

      {/* Decorative line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`mt-5 mx-auto h-px w-16 bg-gradient-to-r ${theme.gradient} opacity-60`}
        style={{ transformOrigin: 'center' }}
      />

      {/* "sus momentos" subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mt-3 text-xs tracking-[0.25em] uppercase text-gray-400"
      >
        sus momentos
      </motion.p>
    </div>
  )
}
```

**Step 3:** Make sure `theme.microIcon` and `theme.gradient` are available (from Task 5). Also update the call site `<HeroHeader ... />` to pass `theme={theme}`.

**Step 4:** TypeScript check + commit:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit 2>&1 | grep "MomentsGallery"
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): hero redesign — serif title, decorative line, themed decorations"
```

---

### Task 7: Image lazy loading — IntersectionObserver + shimmer placeholder

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

**Step 1:** Add a `useLazyImage` hook near the top of the file (after imports):

```tsx
// ── Lazy image hook — only fires HTTP request when card is 200px from viewport ──
function useLazyImage(src: string, eager = false): {
  ref: React.RefObject<HTMLDivElement | null>
  loaded: boolean
  imgSrc: string | null
} {
  const ref = React.useRef<HTMLDivElement>(null)
  const [imgSrc, setImgSrc] = React.useState<string | null>(eager ? src : null)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    if (eager) {
      setImgSrc(src)
      return
    }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImgSrc(src)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [src, eager])

  return { ref, loaded, imgSrc }
}
```

**Step 2:** Replace the `MomentCard` component with a new version that uses `useLazyImage` and shows a shimmer placeholder:

```tsx
const CARD_ROTATIONS = [-2, 1, -1, 2, 0] // for memory cards, not used here

function MomentCard({
  moment,
  index,
  onClick,
  theme,
}: {
  moment: Moment
  index: number
  onClick: () => void
  theme: ReturnType<typeof getTheme>
}) {
  const EVENTS_URL = (window as any).__EVENTS_URL__ ?? ''
  const fullUrl = resolveFullUrl(moment, EVENTS_URL)
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL)
  const video = isVideo(fullUrl)
  const eager = index < 4

  const { ref, loaded, imgSrc } = useLazyImage(thumbUrl, eager)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index < 4 ? 0 : Math.min(index * 0.03, 0.24),
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      className="moment-card break-inside-avoid mb-3 sm:mb-4 cursor-pointer group"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' } as React.CSSProperties}
      onClick={onClick}
    >
      <div ref={ref} className="relative rounded-2xl overflow-hidden bg-gray-100">
        {/* Shimmer placeholder */}
        {!loaded && (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${theme.cardGradient} animate-shimmer`}
            aria-hidden="true"
          />
        )}

        {/* Actual image / video thumbnail */}
        {imgSrc && (
          <img
            src={imgSrc}
            alt={moment.description || 'Momento del evento'}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => {
              // small hack to make loaded state update
              setTimeout(() => {}, 0)
            }}
            className={`w-full h-auto block transition-all duration-500 group-hover:scale-105 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoadCapture={() => {
              // Use onLoad for the fade-in
            }}
            ref={(img) => {
              if (img) {
                if (img.complete) {
                  // already loaded from cache
                }
                img.onload = () => {
                  img.style.opacity = '1'
                  const placeholder = img.previousElementSibling as HTMLElement
                  if (placeholder) placeholder.style.opacity = '0'
                }
              }
            }}
          />
        )}

        {/* Video play overlay */}
        {video && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <PlayIcon />
            </div>
          </div>
        )}

        {/* Description overlay on hover */}
        {moment.description && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
            <p className="text-white text-xs line-clamp-2">{moment.description}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
```

**Note on the image fade-in:** The ref callback approach above is a bit verbose. Simplify to this clean pattern instead — replace the `<img>` element with:

```tsx
<img
  src={imgSrc}
  alt={moment.description || 'Momento del evento'}
  loading={eager ? 'eager' : 'lazy'}
  fetchPriority={eager ? 'high' : 'auto'}
  decoding="async"
  className="w-full h-auto block transition-opacity duration-500 opacity-0 group-hover:scale-105 transition-transform"
  onLoad={(e) => {
    const img = e.currentTarget
    img.classList.remove('opacity-0')
    img.classList.add('opacity-100')
    const shimmer = img.previousElementSibling as HTMLElement
    if (shimmer) shimmer.style.display = 'none'
  }}
/>
```

**Step 3:** Add the `animate-shimmer` keyframe to `tailwind.config.cjs`. Find the `theme.extend` section and add:

```js
keyframes: {
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
},
animation: {
  shimmer: 'shimmer 1.5s ease-in-out infinite',
},
```

Also add to the shimmer div's Tailwind class: `bg-[length:200%_100%]` — this makes the gradient sweep work:
```tsx
className={`absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 bg-[length:200%_100%] animate-shimmer`}
```

**Step 4:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep "MomentsGallery"
```

**Step 5:** Commit:
```bash
git add src/components/moments/MomentsGallery.tsx tailwind.config.cjs
git commit -m "feat(gallery): IntersectionObserver lazy loading + shimmer placeholder + image fade-in"
```

---

### Task 8: Memory card component + typewriter animation

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

**Step 1:** Add a `useTypewriter` hook:

```tsx
// ── Typewriter hook — reveals text char by char when card enters viewport ──
function useTypewriter(text: string, charDelayMs = 18): {
  ref: React.RefObject<HTMLDivElement | null>
  displayed: string
} {
  const ref = React.useRef<HTMLDivElement>(null)
  const [displayed, setDisplayed] = React.useState('')
  const started = React.useRef(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          observer.disconnect()
          let i = 0
          const interval = setInterval(() => {
            i++
            setDisplayed(text.slice(0, i))
            if (i >= text.length) clearInterval(interval)
          }, charDelayMs)
        }
      },
      { rootMargin: '50px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, charDelayMs])

  return { ref, displayed }
}
```

**Step 2:** Add the `MemoryCard` component:

```tsx
function MemoryCard({
  phrase,
  index,
  theme,
}: {
  phrase: string
  index: number
  theme: ReturnType<typeof getTheme>
}) {
  const rotations = [-2, 1, -1, 2, 0]
  const rotation = rotations[index % rotations.length]
  const { ref, displayed } = useTypewriter(phrase, 18)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -50px 0px' }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className={`break-inside-avoid mb-3 sm:mb-4 col-span-2 sm:col-span-3`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div
        className={`bg-gradient-to-br ${theme.cardGradient} border ${theme.cardBorder} rounded-[20px] px-6 py-7 relative overflow-hidden`}
      >
        {/* Micro icon — animated */}
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-xl mb-4 block text-center"
          aria-hidden="true"
        >
          {theme.microIcon}
        </motion.div>

        {/* Phrase text */}
        <p
          className={`text-center text-lg sm:text-xl font-semibold leading-snug ${theme.cardTextColor} font-serif`}
          style={{ fontFamily: theme.fontFamily ?? 'Georgia, serif', minHeight: '2.5rem' }}
        >
          {displayed}
          {displayed.length < phrase.length && (
            <span className="animate-pulse opacity-60">|</span>
          )}
        </p>
      </div>
    </motion.div>
  )
}
```

**Step 3:** The `MemoryCard` uses `col-span-2 sm:col-span-3` but the grid uses CSS columns (masonry), not CSS grid. In a `columns-2` masonry layout, `col-span` doesn't work. Instead, use a wrapper trick to break out of masonry:

The cleanest approach: render memory cards as **full-width items outside the masonry columns**, using a separator pattern. Change the gallery render to use a mix of grouped column items and full-width separators:

```tsx
// In the gallery render, split moments into groups of 9, render group + card between
{renderItems.map((item, i) => {
  if (item.type === 'phrase') {
    return (
      <div key={`phrase-${i}`} className="w-full px-1">
        <MemoryCard phrase={item.text} index={item.phraseIndex} theme={theme} />
      </div>
    )
  }
  return (
    <MomentCard key={item.id} moment={item} index={item.renderIndex} onClick={() => setLightboxIndex(item.galleryIndex)} theme={theme} />
  )
})}
```

But this requires the parent container to use CSS `columns` only for photo items and break for phrase items. The correct way: wrap photos in `columns` groups and place phrase cards between groups using a flat structure:

```tsx
// Render: array of groups + cards
// renderItems = computed array where item is either a Moment or { type: 'phrase', text, phraseIndex }
// Parent layout uses flex-col, each group of moments uses columns-2/3, phrase cards are full-width

<div className="flex flex-col gap-0">
  {groupedItems.map((group, groupIdx) => (
    <React.Fragment key={groupIdx}>
      {/* Photo grid group */}
      <div className="columns-2 sm:columns-3 gap-3 sm:gap-4">
        {group.moments.map((moment, i) => (
          <MomentCard ... />
        ))}
      </div>
      {/* Memory card after this group */}
      {group.phrase && (
        <div className="px-3 sm:px-4 py-2">
          <MemoryCard phrase={group.phrase} index={groupIdx} theme={theme} />
        </div>
      )}
    </React.Fragment>
  ))}
</div>
```

Implement `groupedItems` computation:
```tsx
const MOMENTS_PER_GROUP = 9

const groupedItems = React.useMemo(() => {
  const groups: Array<{ moments: Moment[]; phrase: string | null }> = []
  for (let i = 0; i < moments.length; i += MOMENTS_PER_GROUP) {
    const slice = moments.slice(i, i + MOMENTS_PER_GROUP)
    const phraseIdx = Math.floor(i / MOMENTS_PER_GROUP)
    const phrase = phrases[phraseIdx % phrases.length] ?? null
    groups.push({ moments: slice, phrase: i + MOMENTS_PER_GROUP < moments.length ? phrase : null })
  }
  return groups
}, [moments, phrases])
```

Where `phrases` is a new state variable (`const [phrases, setPhrases] = useState<string[]>([])`).

**Step 4:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep "MomentsGallery"
```

**Step 5:** Commit:
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): MemoryCard component + typewriter animation + grouped masonry layout"
```

---

### Task 9: Fetch phrases from backend + wire into gallery

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

**Step 1:** Add `phrases` state and fetch logic. In `MomentsGallery` (the main component), add:

```tsx
const [phrases, setPhrases] = useState<string[]>([])

// Fetch phrases when eventType is known
useEffect(() => {
  if (!eventType || !EVENTS_URL) return
  const type = eventType.toUpperCase()
  fetch(`${EVENTS_URL}api/events/phrases?type=${type}&count=15`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.data?.phrases?.length) {
        setPhrases(data.data.phrases)
      }
    })
    .catch(() => {/* silently fail — gallery still works without phrases */})
}, [eventType, EVENTS_URL])
```

**Step 2:** Pass `phrases` into the gallery render. Ensure `groupedItems` useMemo uses `phrases` (from Task 8 — already wired).

**Step 3:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep "MomentsGallery"
```

**Step 4:** Commit:
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): fetch event phrases from backend, inject into memory cards"
```

---

### Task 10: Infinite scroll — auto-load + page cap + end card

**Files:**
- Modify: `cafetton-casero/src/components/moments/MomentsGallery.tsx`

**Step 1:** Increase the page size from 30 to 30 (keep backend at 30/page), but change the cap from unlimited to max 4 pages (120 items). Add a `MAX_PAGES = 4` constant.

**Step 2:** Replace the manual `loadMore` button with an IntersectionObserver sentinel. Find where `{hasMore && <button onClick={loadMore}>...}` is rendered and replace entirely with:

```tsx
{/* Infinite scroll sentinel */}
{hasMore && page < MAX_PAGES && (
  <div ref={sentinelRef} className="h-16 flex items-center justify-center">
    {loadingMore && (
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            className={`w-2 h-2 rounded-full ${theme.accent.replace('text-', 'bg-')}`}
          />
        ))}
      </div>
    )}
  </div>
)}

{/* End card — shown when all moments loaded */}
{(!hasMore || page >= MAX_PAGES) && moments.length > 0 && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.3 }}
    className="py-12 text-center"
  >
    <motion.div
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      className="text-2xl mb-3"
      aria-hidden="true"
    >
      {theme.microIcon}
    </motion.div>
    <p className="text-sm text-gray-400 tracking-wide">
      Estos son todos los momentos compartidos
    </p>
  </motion.div>
)}
```

**Step 3:** Add the sentinel ref and IntersectionObserver effect. At the top of `MomentsGallery` add:

```tsx
const sentinelRef = React.useRef<HTMLDivElement>(null)
const MAX_PAGES = 4
```

Add this effect:
```tsx
useEffect(() => {
  const el = sentinelRef.current
  if (!el) return
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingMore && page < MAX_PAGES) {
        loadMore()
      }
    },
    { rootMargin: '300px' }
  )
  observer.observe(el)
  return () => observer.disconnect()
}, [hasMore, loadingMore, page, loadMore])
```

**Step 4:** TypeScript check:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep "MomentsGallery"
```

**Step 5:** Commit:
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): infinite scroll with IntersectionObserver + page cap 120 + end card"
```

---

### Task 11: Final verification + push

**Step 1:** Full TypeScript check (both projects):
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -v "astro.config"
```
Expected: zero errors.

**Step 2:** Visual scan — check for any removed components still referenced:
```bash
grep -n "StatsBar\|CommentsMarquee\|AnimatedCounter\|StatItem" C:/Users/AndBe/Desktop/Projects/cafetton-casero/src/components/moments/MomentsGallery.tsx
```
Expected: no matches.

**Step 3:** Check `content-visibility` is applied on cards:
```bash
grep -n "contentVisibility\|content-visibility" C:/Users/AndBe/Desktop/Projects/cafetton-casero/src/components/moments/MomentsGallery.tsx
```
Expected: present in MomentCard.

**Step 4:** Backend build check:
```bash
wsl -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
```
Expected: no output.

**Step 5:** Push frontend:
```bash
cd C:/Users/AndBe/Desktop/Projects/cafetton-casero && git push origin main
```

**Step 6:** Push backend:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && git push origin main
```

**Step 7:** Update docs:
```bash
cd C:/Users/AndBe/Desktop/Projects/dashboard-ts
git add docs/
git commit -m "docs: momentos gallery redesign — plan completed"
git push origin main
```
