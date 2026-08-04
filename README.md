# EventiApp Dashboard

Dashboard autenticado para operación de eventos, organizaciones, invitados,
check-in, Studio y analítica. Es una aplicación Next.js 16 multi-producto:
la UI, la experiencia de sesión y las proyecciones del contrato viven aquí;
las reglas de dominio y autorización permanecen en `itbem-events-backend`.

## Inicio rápido

El repositorio usa Node 22 y npm 10. Desde el workspace coordinado, primero
valida el entorno:

```powershell
.\eventiapp.ps1 doctor
.\eventiapp.ps1 check -Target dashboard -Fast
```

Para trabajar únicamente en este repositorio:

```bash
npm ci
npm run dev
```

Abre `http://localhost:3000`. Copia `.env.example` a `.env.local` y configura
el backend y Cognito para iniciar sesión contra un entorno real.

## Comandos de calidad

```bash
npm run check:fast  # contrato de producto + TypeScript
npm run check       # lint + TypeScript + pruebas unitarias + build
npm run test:unit:serial # suite unitaria determinista, igual que CI
npm run build:budget
npm run test:e2e    # E2E autenticado: requiere configuración de entorno
```

La suite unitaria serial usa `npm run test:unit:serial` en CI porque los
globals de DOM y fake timers compartidos requieren ejecución determinista.

## Límites de arquitectura

- `src/products/core` contiene contratos y abstracciones independientes de
  productos; nunca importa EventiApp, ITBEM ni Cafetton House.
- Cada producto declara marca, rutas y capacidades en `src/products/<producto>`.
- `src/features` encapsula transporte, cache y estado remoto por dominio; las
  rutas de `src/app` solo componen la experiencia.
- `src/contracts` proyecta la revisión fijada de `itbem-product-contract`.
  No redefinas aquí encabezados de contexto ni capacidades compartidas.
- El BFF same-origin `POST /api/auth/token` valida la cookie y entrega el
  token y la sesión normalizada antes de que la UI llame al backend.
- `src/proxy.ts` aplica el límite de sesión y CSP antes de las rutas privadas.

Las pruebas de arquitectura en `tests/unit/architecture` protegen estos
límites. Consulta [docs/architecture.md](docs/architecture.md) para el flujo
detallado y el checklist al agregar un producto.
