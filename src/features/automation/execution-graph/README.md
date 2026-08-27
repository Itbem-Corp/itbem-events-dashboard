# Execution Graph

Base reutilizable para visualizar procesos automáticos y ejecuciones de agentes.

## Contrato

Cada integrador adapta su información a `ExecutionGraphEvent`:

- `trackId`: mantiene los eventos de una misma operación en un carril horizontal.
- `occurredAt`: determina la secuencia y las conexiones entre carriles.
- `status`: comunica si el agente está activo, terminó, requiere atención o espera una decisión humana.
- `attempts`: comprime reintentos consecutivos sin ocultar que ocurrieron.

Estados disponibles: `queued`, `active`, `retrying`, `complete`, `attention`, `human`, `cancelling`, `cancelled`, `blocked`, `waiting` y `degraded`. Sólo `active` y `retrying` animan el flujo; los demás estados comunican condición sin sugerir que el agente sigue avanzando. Un estado de backend todavía no reconocido se muestra como `degraded`, no como una incidencia humana.

## Integración

Use `ExecutionGraph` para configurar etiquetas, inspector y acciones contextuales. Los adaptadores de dominio, como `live-execution-map.tsx`, deben limitarse a traducir datos y declarar acciones autorizadas.

El grafo no ejecuta cambios por sí mismo: cada acción contextual delega explícitamente al integrador. Las acciones pueden usar `isVisible` e `isDisabled` para reflejar permisos, estado y reglas de negocio del dominio correspondiente.

`maxEvents` tiene un valor predeterminado de 60 para mantener la interacción fluida con historiales largos. El integrador puede ajustarlo si su dominio necesita otra densidad; el total de movimientos sigue visible aunque el canvas muestre sólo la ventana reciente.

## Densidad y lectura

`density="compact"` es el predeterminado para los paneles de operación: conserva la cronología en un recorrido horizontal que se pliega al llegar al borde. Las primeras nueve acciones ocupan como máximo tres columnas y tres filas para preservar nodos legibles y accionables incluso en tarjetas estrechas. Las aristas siguen saliendo únicamente de las relaciones que el integrador proporcionó. Usa `density="comfortable"` cuando el grafo tenga espacio propio y quieras ver un carril estable por cada `trackId`.
