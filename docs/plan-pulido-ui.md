# Plan de pulido de la interfaz

Objetivo: una app que se sienta cuidada en cada detalle. Operar primero (uso diario), con la personalidad en los
detalles: espacios, alineaciones, estados y foco.

## Lo que dicen las referencias

- **Espacio antes que líneas:** el espacio agrupa y jerarquiza; los separadores y bordes son el último recurso.
  La distancia *entre* grupos debe superar la distancia *dentro* de un grupo.
- **Rejilla de 4/8 px:** todo espacio sale de una escala corta (aquí `--space-1…6` = 4, 8, 12, 16, 24, 32).
- **Objetivos táctiles:** ≥ 44 px en táctil (≥ 24 px en puntero fino, WCAG 2.5.8) y ≥ 8 px entre controles.
- **Tableros tipo Linear/Trello:** tarjetas con solo lo esencial, acciones al apuntar, densidad suficiente para ver
  muchas tarjetas; encabezados de columna compactos.
- **Pantallas de ajustes:** agrupar por tarea con encabezados claros, una acción principal por grupo, la acción
  de guardar al final, y siempre una vía de regreso.

## Fases

1. **Espaciado y alineación (hecha):** un solo borde izquierdo en la barra lateral (título, iconos, pie), pie con
   enlaces de 32 px y aire para el foco, portada con más aire arriba e iconos de tablero alineados, casillas y
   radios de 18 px, título de columna con objetivo ≥ 24 px.
2. **Cabecera del tablero y de columna (hecha):** ordenar los controles de la columna (agarre, tipo, eliminar) en un grupo
   fijo, separar el botón de eliminar tablero del título, y que las acciones del tablero tengan el mismo ritmo.
3. **Tarjetas y detalle (hecha):** jerarquía título → metadatos → chips, ritmo vertical constante, foco visible en todo.
4. **Estados (hecha):** vacíos con indicación de qué hacer, cargas con esqueleto, errores con recuperación.
5. **Movimiento (hecha):** una sola transición de autor (entrada de tarjeta/panel) con ease-out; respetar movimiento reducido.
6. **Móvil y oscuro (hecha):** repasar cada pantalla a 390 px y en modo oscuro (contraste, objetivos de 44 px).

Cada fase se verifica con auditoría automática de espacios (distancias entre controles, tamaños de objetivo), axe y
Lighthouse, además de capturas en escritorio y móvil.
