---
name: Kanban
description: Tablero Kanban personal en español; superficies verde-grisáceas apiladas, un solo acento azul-petróleo donde hay una acción.
colors:
  teal-accent: "#168fa3"
  teal-text: "#0a6275"
  teal-solid: "#0d7388"
  on-accent: "#ffffff"
  teal-soft: "#dcf0f3"
  teal-soft-hover: "#cbe8ed"
  teal-border: "#b4dbe2"
  teal-toast: "#7fd3e1"
  brand-from: "#3fbfd0"
  desk-ink: "#17262b"
  ink-muted: "#4a5c61"
  ink-faint: "#566a6f"
  paper-card: "#e7edeb"
  column-mist: "#f6f9f8"
  surface-white: "#ffffff"
  page-mist: "#e6efec"
  page-mist-mid: "#e1ecef"
  page-mist-cool: "#dce8ef"
  coral-danger: "#d4574d"
  coral-danger-text: "#a52f27"
  coral-danger-solid: "#b3261e"
  amber-warning: "#d9922e"
  amber-warning-text: "#7f4b12"
  sage-success: "#3aa57f"
  sage-success-text: "#1b6a4b"
  toast-slate: "#16262b"
  night-page: "#0b1215"
  night-page-end: "#121e24"
  night-column: "#131d21"
  night-card: "#1f2d33"
  night-text: "#e6f0f1"
  night-accent: "#3fb8cc"
  night-accent-text: "#7fd3e1"
  label-blue: "#4a7fd0"
  label-green: "#43a07c"
  label-red: "#d4635a"
  label-orange: "#dc8f3a"
  label-yellow: "#d1ae3b"
  label-purple: "#8a70cc"
  label-pink: "#cb6590"
  label-gray: "#7a8894"
typography:
  title:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  subtitle:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  meta:
    fontFamily: "'Google Sans Variable', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.desk-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  column:
    backgroundColor: "{colors.column-mist}"
    textColor: "{colors.desk-ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  button-add:
    backgroundColor: "{colors.teal-soft}"
    textColor: "{colors.teal-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-add-hover:
    backgroundColor: "{colors.teal-soft-hover}"
  button-add-column:
    backgroundColor: "{colors.teal-soft}"
    textColor: "{colors.teal-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.teal-solid}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.coral-danger-solid}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "36px"
  input-field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.desk-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  dialog:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.desk-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  toast:
    backgroundColor: "{colors.toast-slate}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
---

# Design System: Kanban

## Overview

**Creative North Star: "El escritorio ordenado" (The Tidy Desk)**

Una mesa de trabajo serena: superficies verde-grisáceas apiladas como papeles. El fondo es un degradado de bruma, la columna es una hoja casi blanca y cada tarjeta es un papel un escalón por encima. El azul-petróleo aparece solo donde hay algo que hacer (agregar, guardar, deshacer, foco). Todo lo demás es neutro, tranquilo y rápido de escanear. La paleta se llama "Bruma y salvia" (Mist & Sage).

Es una herramienta de uso diario en modo Operate: escritorio primero, teléfono como apoyo. La voz es serena, profesional y callada: nada grita, los estados usan tonos apagados (coral, ámbar, salvia) en lugar de rojos y verdes saturados. La tipografía es Google Sans (variable), autoalojada, con la fuente del sistema como respaldo; da un acabado profesional y limpio sin depender de la red.

El modo oscuro está compuesto, no invertido: una pizarra verde-azulada donde cada superficie conserva su escalón (columna `#131d21`, tarjeta `#1f2d33`, diálogo `#172227`) y el acento se aclara (`#3fb8cc`) para mantener el contraste.

**Key Characteristics:**
- Tonal layering: fondo, columna, tarjeta; la profundidad viene del tono y de un borde de 1px, no de sombras pesadas.
- Un solo acento azul-petróleo, y siempre significa acción.
- Radios consistentes: 6 (detalles), 10 (controles), 14 (tarjetas), 22 (columnas y diálogos).
- Tipografía por rol, no por página; números tabulares en todo el producto.
- Un solo momento animado: tomar una tarjeta.
- Táctil de primera clase: objetivos de 44px y sin controles solo-hover en pantallas sin hover.

## Colors

Una paleta casi totalmente neutra (grises con un matiz verde-azulado muy bajo sobre un degradado de bruma) con un único acento azul-petróleo y tres estados apagados. Los valores del frontmatter son los del tema claro; `src/styles/tokens.css` es la fuente normativa.

### Primary
- **Petróleo de acción** (`teal-accent`, `#168fa3`): rellenos de acento, anillo de foco, borde de campo activo y destino de arrastre. No se usa para texto.
- **Petróleo de texto / sólido** (`teal-text` `#0a6275` y `teal-solid` `#0d7388`): texto del acento sobre claro y fondo del botón primario con texto blanco; ambos oscurecidos para cumplir AA.
- **Petróleo suave** (`teal-soft` `#dcf0f3`, hover `#cbe8ed`, borde `#b4dbe2`): botones "Agregar tarjeta" y "Agregar columna", resultado activo del buscador. Wash translúcido para tarjetas "nuevas".
- **Petróleo del aviso** (`teal-toast`, `#7fd3e1`): acción "Deshacer" sobre el aviso oscuro.
- **Marca** (`#3fbfd0` a `#0d7388`): degradado del icono de tablero y `theme_color` del manifiesto (`#0d7388`).

### Neutral
- **Tinta de escritorio** (`desk-ink`, `#17262b`): texto principal. Oscuro: `#e6f0f1`.
- **Tinta atenuada** (`ink-muted`, `#4a5c61`): texto secundario; AA también sobre la tarjeta. Oscuro: `#9fb2b7`.
- **Tinta tenue** (`ink-faint`, `#566a6f`): metadatos y fechas; aún 4.5:1 sobre la tarjeta. Oscuro: `#8ea2a7`.
- **Papel de tarjeta** (`paper-card`, `#e7edeb`): la tarjeta, con borde 1px de tinta al 18%. Oscuro: `#1f2d33`.
- **Columna de bruma** (`column-mist`, `#f6f9f8`): la columna. Oscuro: `#131d21`.
- **Superficie blanca** (`surface-white`, `#ffffff`): diálogos, campos y panel lateral en móvil. Oscuro: `#172227` (campos: tinta al 6%).
- **Vidrio**: barra superior `rgba(250,253,252,.74)` y barra lateral `rgba(255,255,255,.5)`, con `backdrop-filter: blur(20px)`. Oscuro: `rgba(17,27,31,.74)` / `.5`.
- **Rellenos de tinta**: `rgb(ink / .05 | .08 | .12)` para comentarios, hover y pistas; `.14` para seleccionado. La tinta es `23 38 43` en claro y `222 238 240` en oscuro.
- **Fondo de app**: degradado 135deg `#e6efec` a `#e1ecef` a `#dce8ef` (oscuro: `#0b1215` a `#0f181c` a `#121e24`).

### Estado
- **Peligro** (coral): `#d4574d`, texto `#a52f27`, sólido `#b3261e` (botón destructivo con texto blanco).
- **Advertencia** (ámbar): `#d9922e`, texto `#7f4b12`; chip "próxima a vencer".
- **Éxito** (salvia): `#3aa57f`, texto `#1b6a4b`; chip "completa" y punto de la columna final.
- **Aviso** (`toast-slate`, `rgba(22,38,43,.94)`): siempre una superficie oscura flotante de pizarra verde-azulada, también en tema claro (en oscuro `rgba(46,64,71,.96)`).

### Etiquetas
Ocho colores calmados, cada uno con sólido (punto), fondo suave y texto oscurecido (claro) o aclarado (oscuro) para AA sobre la tarjeta: azul `#4a7fd0`, verde `#43a07c`, rojo `#d4635a`, naranja `#dc8f3a`, amarillo `#d1ae3b`, morado `#8a70cc`, rosa `#cb6590`, gris `#7a8894`. Los textos claros: `#274f98`, `#1d5f43`, `#9a3029`, `#774510`, `#5c4b09`, `#55409a`, `#8e3459`, `#3f4c56`. En oscuro el sólido y el texto se reasignan (p. ej. azul `#5f93e6`, texto `#a4c1f7`).

### Named Rules
**The Action-Only Teal Rule.** El petróleo aparece únicamente donde hay una acción posible o un foco. Si un elemento no se puede pulsar, no es petróleo.

**The Solid-Accent Pair Rule.** Texto sobre un relleno de acento sólido usa `--color-accent-solid` con `--color-on-accent`, nunca `--color-accent` (`#168fa3`), que no alcanza AA con blanco.

**The Semantic Tokens Only Rule.** Los componentes usan solo roles semánticos; no hay colores literales fuera de `tokens.css`.

## Typography

**Display Font:** Google Sans Variable (400-700, SIL OFL, autoalojada desde `@fontsource-variable/google-sans`, subconjuntos latin y latin-ext) con respaldo `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
**Body Font:** la misma familia
**Label/Mono Font:** `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` (solo código en línea)

**Character:** Una sola familia geométrica y limpia, con la jerarquía hecha por tamaño y peso. Se sirve desde el propio origen (sin peticiones a terceros, disponible sin conexión) y `font-display: swap` evita bloquear el texto.

### Hierarchy
- **Title** (700, 28px, 1.25): título del tablero. En teléfono baja a 24px.
- **Headline** (700, 20px, 1.25): título de la tarjeta en el detalle.
- **Subtitle** (600, 17px, 1.25): títulos de columna, del panel lateral y de diálogos.
- **Body** (400 a 500, 15px, 1.45): cuerpo y títulos de tarjeta (500). En táctil sube a 16px para evitar el zoom de iOS al enfocar campos.
- **Label** (600, 13px): botones, encabezados de sección del detalle, texto de apoyo. En táctil sube a 14px.
- **Meta** (500, 12px): contadores, chips, fechas, metadatos.

### Named Rules
**The Role Scale Rule.** La escala es por rol (xs 12 / sm 13 / md 15 / lg 17 / xl 20 / title 28): se elige el rol, no un tamaño suelto.

**The Tabular Numbers Rule.** `font-variant-numeric: tabular-nums` global; contadores y fechas no deben "bailar".

## Layout

Un tablero a pantalla completa: barra superior de 52px (más el área segura), barra lateral de 257px y, en el contenido, el encabezado del tablero sobre una fila de columnas de 320px (máximo 86vw en teléfono) con desplazamiento horizontal. Máximo 5 columnas por tablero. "Agregar columna" es una píldora en el encabezado del tablero, alineada a la derecha. El contenedor de columnas reserva 8px de relleno para que el anillo del destino de arrastre nunca se recorte.

Espaciado base 4: 4 / 8 / 12 / 16 / 24 / 32. Las tarjetas se separan 12px dentro de la columna; las columnas 16px entre sí. En teléfono el paso de 24px baja a 16px.

Responsivo:
- Debajo de 900px la barra lateral pasa a un panel deslizable (ancho `min(86vw, 320px)`, fondo sólido) y las columnas encajan al desplazar (scroll-snap proximity, desactivado al arrastrar).
- Debajo de 640px los diálogos son una hoja inferior (esquinas superiores de 22px, a pantalla completa), el buscador ocupa la barra y los botones sin función se ocultan.
- En punteros gruesos (`pointer: coarse`) los objetivos táctiles miden al menos 44px.
- Los controles de columna (agarre, borrar) que en mouse solo aparecen al pasar el cursor se muestran siempre cuando no hay hover (`@media (hover: none)`).

## Elevation & Depth

Híbrido: la profundidad se construye primero con capas tonales (fondo, columna, tarjeta, diálogo) y un borde de 1px, y solo después con sombras suaves tintadas con la tinta. Las superficies son casi planas en reposo; la sombra crece como respuesta a un estado. El vidrio translúcido con desenfoque de 20px queda reservado a las barras de navegación; el velo de los diálogos usa blur de 4px.

### Shadow Vocabulary
- **Reposo** (`box-shadow: 0 1px 2px rgba(16,40,48,.05), 0 2px 8px rgba(16,40,48,.06)`): tarjetas y columnas.
- **Hover** (`0 1px 2px rgba(16,40,48,.07), 0 4px 12px rgba(16,40,48,.1)`): tarjeta bajo el cursor, con borde más fuerte (`ink / .34`).
- **Levantado** (`0 8px 24px rgba(16,40,48,.18)`): tarjeta o columna tomada, diálogos, panel lateral, buscador, avisos.
- Oscuro: reposo `0 1px 2px rgba(0,0,0,.3), 0 2px 8px rgba(0,0,0,.25)`, levantado `0 10px 30px rgba(0,0,0,.55)`.
- **Destino de arrastre** (`0 0 0 2px accent, 0 0 0 6px accent-glow` más sombra de reposo): anillo de 2px con un halo suave de 6px alrededor de la columna.

### Named Rules
**The Flat-Until-Touched Rule.** Una superficie en reposo solo lleva la sombra suave de reposo; la sombra "levantada" se reserva a lo que flota o está en la mano.

**The Authored Moment Rule.** Hay un solo momento de movimiento diseñado: tomar una tarjeta (`200ms` con `cubic-bezier(.16,1,.3,1)`). Los demás cambios son transiciones de 120ms. Con `prefers-reduced-motion` desaparecen el giro y el desplazamiento; queda un fundido corto.

## Shapes

Esquinas generosas y consistentes. Detalles internos (código en línea, agarres) 6px; controles y campos 10px; tarjetas 14px; columnas, diálogos y hoja inferior 22px; chips, buscador, "Agregar columna", avisos y botones circulares son píldora (999px / 50%). Bordes de 1px en tinta translúcida; nunca franjas laterales de color. La imagen de portada de una tarjeta llena el ancho, recortada con las esquinas superiores de la tarjeta (máximo 160px). El estado de una columna se muestra con un punto de 7px junto al contador: neutro, acento (en curso) o éxito (listo). El icono de tablero es un cuadrado de 34px con radio 9 y degradado petróleo.

## Components

### Buttons
- **Shape:** 10px de radio (40px de alto en columna, 36px en diálogos); "Agregar columna" es una píldora de 36px.
- **Agregar (suave):** fondo petróleo suave, texto `teal-text`, borde `teal-border`, 13px peso 600. Hover: `teal-soft-hover`. "Agregar columna" incluye un contador "3 de 5"; deshabilitado pasa a gris con `cursor: not-allowed`.
- **Primario sólido:** `teal-solid` con `on-accent`, 40px, 600; solo en pantallas de acceso. Deshabilitado: opacidad .5.
- **Destructivo:** `coral-danger-solid` con texto blanco en el diálogo de confirmación; variante contorno (`danger-text`) en el detalle de la tarjeta.
- **Circular / icono:** 38px (44px táctil), borde 1px, fondo translúcido; hover a blanco.
- **Enlace:** texto `teal-text`, 600, sin fondo.

### Cards / Containers
- **Tarjeta:** papel `#e7edeb`, borde 1px, 14px de radio, relleno 12px 16px, mínimo 72px de alto, título 15px peso 500, chips de 12px, fecha abajo a la derecha. Chips de estado: próxima (ámbar), vencida (coral), completa (salvia). Hover: borde y sombra más fuertes.
- **Columna:** hoja `#f6f9f8`, 22px de radio, encabezado con borde inferior de 1px, título 17px peso 600, contador 12px con punto de estado, cuerpo con scroll y botón "Agregar" al pie.
- **Diálogo:** superficie blanca, 22px, relleno 24px, anchos 420 (sm) y 720 (lg). El detalle de tarjeta tiene cabecera y pie fijos y solo el cuerpo se desplaza (máximo `min(90dvh, 860px)`).

### Inputs / Fields
- **Style:** fondo `color-field`, borde 1px `color-border`, 10px de radio, 36px de alto (44px táctil), 13px.
- **Focus:** anillo global `outline: 2px solid var(--color-focus)` con offset 2px; el campo en línea usa borde de acento más un halo `0 0 0 3px accent-glow`.
- **Error:** texto `danger-text`, 13px.

### Navigation
- **Barra superior:** vidrio de 52px con borde inferior; botones circulares y buscador en píldora (320px, 38px) cuyo panel de resultados es una superficie blanca de 14px con sombra levantada; el resultado activo usa petróleo suave.
- **Barra lateral:** vidrio, elementos de 10px de radio; el actual (`aria-current`) con relleno "seleccionado". Cerrar sesión como enlace petróleo al pie.

### Avisos y banners
Píldora oscura de pizarra flotante centrada abajo (los banners de PWA son tarjetas de 14px abajo a la derecha). Entrada de 200ms; con movimiento reducido, un fundido. El aviso de un borrado siempre ofrece "Deshacer".

### Etiquetas (labels)
- **Chip:** píldora con punto de color + nombre (12px, semibold), fondo suave del color y texto oscurecido para AA sobre la tarjeta; en oscuro, texto claro sobre fondo translúcido. Paleta de 8 (`--label-<color>`, `-soft`, `-text`).
- **Regla:** el nombre siempre se escribe; el color nunca es la única señal. Las muestras elegidas llevan aro, no solo color.
- **Selector:** panel con casillas (asignar), "Editar" por fila y formulario de nombre + 8 muestras (`role=radio`). Filtro: botón con contador en el borde superior.

## Do's and Don'ts

### Do:
- **Do** usar solo tokens semánticos (`--color-*`, `--space-*`, `--radius-*`, `--text-*`); ningún color literal en los componentes.
- **Do** poner el texto sobre un relleno de acento sólido con `--color-accent-solid` y `--color-on-accent`.
- **Do** mantener AA en ambos temas, incluidos los textos de los 8 colores de etiqueta sobre la tarjeta y el texto atenuado sobre la tarjeta y el gris de seleccionado.
- **Do** reservar el petróleo para acciones y foco.
- **Do** dar a cada control táctil al menos 44px en `pointer: coarse` y mostrar siempre los controles que en mouse aparecen al pasar el cursor.
- **Do** escribir la interfaz en español (es-MX).
- **Do** ofrecer "Deshacer" en toda acción destructiva.
- **Do** pensar el modo oscuro como remapeo de roles semánticos, con cada superficie en su escalón.
- **Do** dar una alternativa con `prefers-reduced-motion` a cualquier movimiento nuevo.

### Don't:
- **Don't** usar bordes laterales de color de más de 1px como acento.
- **Don't** hacer que una acción exista solo con hover.
- **Don't** usar `--color-accent` (`#168fa3`) como texto ni como fondo con texto blanco.
- **Don't** usar rojos o verdes saturados para estados; los estados son coral, ámbar y salvia apagados.
- **Don't** servir la fuente desde terceros: Google Sans se autoaloja para mantener la promesa offline.
- **Don't** añadir más momentos de movimiento diseñado; el único es tomar una tarjeta.
- **Don't** colocar sombras levantadas en superficies en reposo.
