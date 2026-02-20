# QA Agent

Mantiene los tests Playwright E2E del dashboard. Un archivo por feature/sección. Los tests se corren con el MCP de Playwright o via CLI.

---

## Prerrequisitos

1. App corriendo en `http://localhost:3000` (`npm run dev`)
2. Backend corriendo en `http://localhost:8080`
3. `TEST_EMAIL` y `TEST_PASSWORD` definidos en `.env.local` (usuario en Cognito staging)
4. Sesión de auth generada: `npx playwright test tests/e2e/fixtures/auth.setup.ts`

---

## Comandos

```bash
npm run test:e2e                                      # suite completa
npm run test:e2e:file tests/e2e/clients.spec.ts       # archivo específico
npm run test:e2e:headed                               # browser visible (debug)
npm run test:e2e:ui                                   # Playwright UI mode
npx playwright show-report                            # ver reporte HTML
```

---

## Estructura de archivos

```
tests/
  e2e/
    .auth/
      session.json          ← generado por auth.setup.ts (NO commitear)
    fixtures/
      auth.setup.ts         ← login una vez → guarda storageState
    auth.spec.ts            ← login, logout, redirect sin sesión
    dashboard.spec.ts       ← KPIs, tabla de eventos, sidebar org
    clients.spec.ts         ← CRUD clientes, modal, validación, delete
    users.spec.ts           ← invitación, toggle activo, badges, modal
    events.spec.ts          ← lista, detalle, badge estado, navegación
    profile.spec.ts         ← editar nombre, avatar, toast éxito
```

---

## Cuándo crear un NUEVO archivo de spec

| Situación | Acción |
|---|---|
| Se agrega una nueva página (`/orders`, `/team`, `/analytics`) | Crear `tests/e2e/{feature}.spec.ts` |
| Se agrega un flujo completamente nuevo (ej. bulk import) | Crear spec propio |
| Se crea una sección de settings nueva | Crear `settings-{name}.spec.ts` |

**Regla:** 1 spec file = 1 ruta / área de feature. Si la page está en `src/app/(app)/foo/page.tsx`, el spec es `tests/e2e/foo.spec.ts`.

---

## Cuándo MODIFICAR un archivo existente

| Situación | Archivo a modificar |
|---|---|
| Cambio de texto en un botón o heading | El spec de esa página |
| Nuevo campo en un formulario | El spec que prueba ese form |
| Bug corregido | Agregar test de regresión en el spec afectado |
| Nuevo flujo dentro de una feature existente | Agregar `test()` al spec existente en un `describe` nuevo si aplica |
| Se elimina una funcionalidad | Eliminar el `test()` correspondiente |

---

## Árbol de decisión: ¿crear o modificar?

¿Existe un spec file para esta área/ruta?

**SÍ → SIEMPRE modificar el spec existente (nunca duplicar)**
- Nueva sección/flujo dentro de la feature → agregar `test()` o `test.describe()`
- Flujo existente cambiado → actualizar el test afectado
- Texto UI cambiado → actualizar selectores/matchers de texto
- Bug corregido → agregar regression test al final del spec
- Funcionalidad eliminada → eliminar el test correspondiente

**NO → Crear nuevo spec file**
- Nueva página `/foo` → `tests/e2e/foo.spec.ts`
- Feature mayor sin página → `tests/e2e/{feature}.spec.ts`
- Nueva sección de settings → `tests/e2e/settings-{nombre}.spec.ts`

**Regla de oro:** si el spec existe → MODIFICAR. Nunca crear un segundo archivo para la misma área.

---

## Reglas de escritura (no negociables)

1. **`storageState`** — todos los specs (excepto `auth.spec.ts`) deben incluir:
   ```typescript
   test.use({ storageState: 'tests/e2e/.auth/session.json' })
   ```
2. **Nunca re-login dentro de un test** — el storageState resuelve esto.
3. **Verificar toasts** después de mutaciones exitosas:
   ```typescript
   await expect(page.getByText('Cliente guardado')).toBeVisible({ timeout: 5000 })
   ```
4. **Verificar AMBOS lados** de operaciones CRUD: éxito y validación de error.
5. **Selectores en orden de preferencia:**
   - `getByRole('button', { name: '...' })` ← primero
   - `getByLabel('...')` ← para inputs
   - `getByText('...')` ← para contenido
   - `data-testid` ← para elementos sin semántica clara
   - CSS selectors ← último recurso
6. **No asumir datos** — usar `if (await element.isVisible())` cuando el dato depende del backend.
7. **`waitForLoadState('networkidle')`** en `beforeEach` para páginas con SWR.

---

## Agregar `data-testid` a elementos críticos

Cuando un selector es frágil (botón sin texto claro, icono-only), agregar `data-testid` en el componente:

```tsx
// Componente
<Button data-testid="delete-client-btn" plain onClick={...}>
  <TrashIcon />
</Button>

// Test
await page.getByTestId('delete-client-btn').click()
```

---

## Flujo del QA agent en cada tarea

```
1. Leer CLAUDE.md → qa-agent.md
2. Identificar qué feature/página cambió
3. Buscar si existe tests/e2e/{feature}.spec.ts
   → Existe: modificar el spec afectado
   → No existe: crear nuevo spec
4. Correr el spec: npm run test:e2e:file tests/e2e/{feature}.spec.ts
5. Si falla: debuggear con --headed, corregir selectores
6. Si pasa: correr suite completa para verificar regresiones
7. Confirmar que el reporte HTML no tiene errores
```
