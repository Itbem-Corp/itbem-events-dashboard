# Design QA — sistema global light/dark

## Alcance

- Fuente visual seleccionada: `C:\Users\AndBe\.codex\generated_images\019f583c-53bc-70f1-bb62-6da38b19763e\exec-8fcdc11d-f384-472c-a2f8-2d00965bce7c.png`.
- Superficies auditadas: autenticación, recuperación, shell de aplicación, navegación, primitives y componentes de producto.
- Viewports visuales: 1440 × 1024, 768 × 1024 y 390 × 844.
- Evidencia aceptada: `.codex-audit/platform-theme/01-login-dark-desktop.jpg` a `06-login-dark-mobile.jpg`.

## Iteración aplicada

- **P1 — neutrales heredados:** más de mil usos visuales dependían de escalas `zinc` fijas. Fondos, tipografía, bordes, gradientes, placeholders, iconos y estados neutrales ahora consumen tokens semánticos compartidos.
- **P1 — cobertura incompleta:** la migración se aplicó a más de cien archivos de `src/app` y `src/components`, incluyendo clientes, usuarios, eventos, Studio, momentos, seating, métricas, perfil, tablas, overlays, dropdowns y modales.
- **P1 — contraste de contenido sobre color:** el bridge conserva blanco en controles y descendientes sobre fondos de estado o marca, evitando texto oscuro accidental en light theme.
- **P2 — controles nativos forzados:** dos selectores de fecha mantenían `color-scheme: dark`; ahora siguen el tema del documento.
- **P2 — regresión futura:** se añadió `theme-contract.test.ts`, que rechaza neutrales estructurales hardcodeados y esquemas nativos forzados.

## Revisión visual

- Dark desktop: jerarquía clara, canvas índigo profundo, inputs integrados, CTA de marca y contraste consistente.
- Light desktop: superficies cálidas, campos elevados y profundidad sin invertir literalmente el dark theme.
- Tablet: formulario centrado, ritmo vertical estable y controles táctiles amplios.
- Mobile: sin overflow horizontal; labels, enlace de recuperación, CTA y pie se mantienen legibles en 390 px.
- Recuperación: conserva el mismo sistema de superficies, foco y CTA.

## Accesibilidad

- Persistencia de preferencia y sincronización entre pestañas.
- Fallback a `prefers-color-scheme` cuando no existe elección guardada.
- `color-scheme` y `theme-color` actualizados por tema.
- Foco visible, labels, nombres accesibles, targets táctiles y `prefers-reduced-motion` preservados.
- Los colores de estado mantienen semántica propia y texto blanco cuando corresponde.

## Verificación

- TypeScript: passed.
- Build de producción: passed para las 26 rutas publicadas.
- Unit tests: 182 archivos y 1020 pruebas passed.
- Contrato global de tema: passed.
- Browser: cambio de tema, persistencia, recuperación y responsive revisados; 0 errores de aplicación observados en las capturas aceptadas.
- `git diff --check`: passed.

## Límite de evidencia

- Las rutas autenticadas no pudieron capturarse con datos reales porque el entorno local no tiene una cuenta de prueba configurada. Su cobertura en esta iteración es estructural y automatizada: todas las vistas/componentes fueron migrados al contrato semántico, compilaron y pasaron la suite completa. Una sesión real permitiría únicamente una última calibración P3 de densidad con datos poblados.

## Correccion de encuadre y acceso local (2026-07-16)

- Referencia reportada: `C:\Users\AndBe\AppData\Local\Temp\codex-clipboard-5b5288df-cc5a-47bf-86b5-799c4a548714.png` (1916 x 947).
- **P1 - shell recortado:** se retiro el ancho maximo de 1600 px y el padding exterior que dejaban margenes laterales y generaban scroll vertical. El login ahora ocupa el viewport completo.
- Evidencia aceptada: `.codex-audit/login-auth-fix/desktop-1916x947.png`, `tablet-768x1024.png` y `mobile-390x844.png`.
- Desktop 1916 x 947: full bleed, sin margenes externos ni recorte.
- Tablet 768 x 1024: `scrollWidth = 768`, `scrollHeight = 1024`.
- Mobile 390 x 844: `scrollWidth = 390`, `scrollHeight = 844`; sin overflow horizontal o vertical.
- **P1 - falso error de credenciales:** Cognito aceptaba la cuenta, pero el backend local ejecutaba una imagen antigua sin `GET /api/session`. Se reconstruyo el servicio conservando Postgres y Valkey; `/api/session` ahora existe y responde 401 sin bearer, como corresponde.
- La cuenta local fue comprobada como activa y administradora primaria; EventiApp esta activa y permite acceso de plataforma.
- TypeScript: passed. Pruebas focalizadas de login/token: 7 passed. Servicio de sesion Go: passed.

final result: passed

## Pulido integral de vistas autenticadas y carga (2026-07-17)

- Se compararon estados antes/después en el mismo viewport para Eventos, detalle de evento y control plane. Evidencia: `.codex-audit/full-platform-polish-2026-07-17/comparison-*.png`.
- **Detalle de evento:** la cabecera sin portada dejó de producir un bloque oscuro en light theme; ahora usa superficies semánticas y mantiene legibles estado, alcance y acciones.
- **Eventos:** filtros, buscador, fila histórica y affordance de apertura ya no dependen de blancos/grises fijos y conservan jerarquía en ambos temas.
- **Control plane:** las tarjetas se derivan del manifiesto del producto. EventiApp ya no muestra accesos a organizaciones/equipo que terminaban redirigiendo al inicio; conserva Métricas y Auditoría.
- **Auditoría móvil:** la grilla dejó de recortar Resultado en 390 px y usa bordes, loading states y selector semánticos.
- **Perfil:** el avatar mantiene contraste real en light y dark; el modal vacío de miembros redujo altura y espacio muerto.
- **Responsive verificado:** desktop 1440 x 900, tablet 768 x 1024 y móvil 390 x 844 para home, eventos, detalle, perfil, equipo, control plane y auditoría.
- **Cambio de organización:** el selector móvil se mantiene claro y utilizable; el cambio de plataforma a EventiApp completó en 292 ms con el contexto ya hidratado.
- **Carga inicial:** Inicio bajó de 216 kB a 177 kB de First Load JS (-18.1%) y Métricas de 212 kB a 172 kB (-18.9%) al reemplazar el runtime de motion de primera vista por animación CSS respetuosa de `prefers-reduced-motion`.
- TypeScript: passed.
- Build de producción: passed para todas las rutas publicadas.
- Unit tests: 183 archivos y 1025 pruebas passed.
- Contratos añadidos: rutas de primera visita sin runtime de motion y grilla móvil de Auditoría sin columnas mínimas que provoquen clipping.

final result: passed

## Rendimiento inicial y acabado enterprise (2026-07-17)

- **P0 - doble bootstrap de sesion:** el login ya no descarta la sesion verificada por Cognito/backend ni fuerza un reload completo. La sesion se hidrata una sola vez y la entrada al dashboard usa navegacion cliente.
- **P1 - cambio de organizacion:** cuando el usuario ya esta en `/`, el selector actualiza el contexto sin repetir una navegacion RSC a la misma ruta. Medicion local: de aproximadamente 3641 ms a 286 ms.
- **P1 - primer clic frio:** Inicio, Eventos, Metricas, Usuarios, Auditoria, Equipo y Clientes precargan ruta al detectar intencion. Metricas y Auditoria tambien calientan su primer request de datos. Medicion fria a Metricas en desarrollo: 845 ms desde click hasta heading listo.
- **P1 - lenguaje visual:** se retiraron los halos ambientales, blur estructural y sombras expansivas del shell. Las superficies ahora son solidas, los bordes tienen contraste sobrio y el gradiente de marca queda reservado para acciones primarias.
- **P1 - continuidad de tema:** canvas, sidebar, navegacion, tarjetas, modales, selector de organizacion, metricas y home operativo usan los mismos tokens semanticos en light y dark.
- **Responsive:** se revisaron 1280 x 720, 768 x 1024 y 390 x 844; header, hero, tarjetas y navegacion inferior conservan jerarquia y contraste.
- Evidencia aceptada: `.codex-audit/performance-enterprise-pass/02-dashboard-enterprise-dark.png`, `03-dashboard-enterprise-light.png`, `04-switcher-enterprise-light.png` y `15-before-vs-enterprise-dark.png`.
- TypeScript: passed.
- Pruebas focalizadas: 3 archivos y 14 pruebas passed.
- Build de produccion: passed para las 26 rutas publicadas.
- `git diff --check`: passed.

final result: passed

## Alineacion visual del dashboard autenticado (2026-07-16)

- Fuentes visuales: `.codex-audit/platform-theme/01-login-dark-desktop.jpg` y `02-login-light-desktop.jpg`.
- Problema P1 confirmado: el cambio de tema funcionaba, pero el shell, los estados seleccionados, las tarjetas y los CTA principales conservaban estilos heredados; el resultado no compartia la profundidad ni el gradiente del login.
- Se centralizo la continuidad visual en primitives compartidos: `--app-brand-gradient`, `app-brand-cta`, `app-hero-surface`, `app-shell-panel` y `premium-surface`.
- El sidebar y el contenido principal ahora usan superficies semanticas consistentes en light y dark; la navegacion activa usa el acento del tenant en ambos temas.
- Los CTA `indigo` se traducen al gradiente magenta-violeta-azul de EventiApp. ITBEM y Cafetton mantienen gradientes propios mediante `data-product` sin duplicar componentes.
- La portada del home operativo reutiliza los assets editoriales reales del login y conserva contraste semantico de texto e iconos.
- Vistas autenticadas revisadas: home de organizacion, eventos, metricas, equipo y control plane.
- Viewports revisados: 1440 x 900, 768 x 1024 y 390 x 844; `overflowX = 0` en mobile.
- Evidencia aceptada: `.codex-audit/platform-theme-alignment/07-events-home-light-after.png` a `17-platform-dark-after.png`.
- Comparacion conjunta fuente/implementacion: `.codex-audit/platform-theme-alignment/18-source-vs-dashboard-dark.png` (misma escala de 1440 x 900 por vista).
- Regresion automatizada: el contrato de tema ahora exige los primitives visuales del shell autenticado.
- TypeScript: passed.
- Build de produccion: passed para las 26 rutas publicadas.
- Unit tests en ejecucion determinista: 182 archivos y 1021 pruebas passed.
- La ejecucion paralela inicial mostro timeouts por contencion; los 8 archivos afectados pasaron 142/142 de forma focalizada y la suite completa paso con un worker.
- `git diff --check`: passed.

final result: passed
