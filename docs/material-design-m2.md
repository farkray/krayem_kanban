# Material Design 2: investigación y plan para la app

Objetivo: llevar a la app el lenguaje de Material Design 2 (M2) en menús desplegables, campos, menús, chips y diálogos,
conservando la paleta turquesa propia. Referencia visual que gustó: el *exposed dropdown menu* (campo relleno con etiqueta
flotante, línea de acento al abrir y menú elevado con ítems de 48 px).

## Cómo se obtuvieron los datos

`m2.material.io` se renderiza con JavaScript y no se puede leer como texto. Las cifras salen del **código fuente publicado**
de Material Components Web 14.0.0 (el SCSS de M2), leído desde jsDelivr:
`https://cdn.jsdelivr.net/npm/@material/<paquete>@14.0.0/` (`menu-surface`, `menu`, `list`, `select`, `textfield`,
`floating-label`, `elevation`). Las cifras marcadas «(memoria)» no se pudieron confirmar y deben verificarse al implementar.

## Valores confirmados (M2, código fuente)

**Superficie del menú (`menu-surface`)**
- Elevación z = 8: sombras `0 5px 5px -3px rgba(0,0,0,.2)`, `0 8px 10px 1px rgba(0,0,0,.14)`, `0 3px 14px 2px rgba(0,0,0,.12)`.
- Sin padding propio; alto máximo `calc(100vh - 32px)`, ancho máximo `calc(100vw - 32px)`; `overflow: auto`.
- Apertura: de `scale(.8)` y opacidad 0 a `scale(1)` y opacidad 1. Opacidad 30 ms lineal; escala 120 ms; altura 250 ms, todo
  con curva de **desaceleración**. `transform-origin: top left`. Cierre: solo opacidad, 75 ms lineal.
- Ancho mínimo del menú: 112 px.

**Lista / ítems**
- Ítem de una línea: **48 px** de alto (denso 40 px); padding horizontal **16 px**; dos líneas 64 px; tres líneas 88 px.
- Tinta del texto: negro al 87 %.

**Campo con selector (`select`) y campo de texto (`textfield`)**
- Altura **56 px** (mínima 40 px). Filled: con etiqueta flotante 52 px de alto de contenido y línea base a 40 px.
- Padding izquierdo 16 px. Flecha: icono de **24 px**, margen 12 px, color negro al 54 %; el espacio para la flecha es 52 px.
- Etiqueta flotante: escala **0.75**, transición **150 ms**, origen arriba-izquierda; sube a la parte superior del campo.
- Filled: fondo = tinta al **4 %** sobre la superficie; línea inferior inactiva 42 %, al apuntar 87 %, enfocado color primario
  (la línea de acento crece con `scale(1, 2)` al enfocar).
- Outlined: contorno 38 % inactivo, 87 % al apuntar, primario enfocado con **2 px** de grosor.
- Texto de apoyo/etiqueta al 60 %, marcador de posición al 54 %.
- Transición de la flecha al abrir: 150 ms.

## No confirmado (verificar antes de fijarlo)

- Radio «medium» (en M2 el menú y los campos usan 4 px; es la cifra habitual, pero no se leyó el token).
- Curvas exactas: *standard* `cubic-bezier(.4, 0, .2, 1)` y *deceleration* `cubic-bezier(0, 0, .2, 1)` (memoria).
- Opacidades de estado (hover 4 %, foco 12 %, pulsado 12 %, seleccionado 8 %) (memoria).
- Grosor de la línea de acento del campo relleno (en M2 es 2 px al enfocar) (memoria).

## Accesibilidad (patrón WAI-ARIA «select-only combobox»)

- Disparador: elemento con `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, etiquetado con
  `aria-labelledby`. Mantiene el foco del DOM; la opción resaltada se indica con `aria-activedescendant`.
- Lista: `role="listbox"` con opciones `role="option"` y `aria-selected`; fuera del orden de tabulación.
- Teclado: Enter/Espacio/Flecha abajo abren; flechas mueven; Inicio/Fin saltan; escribir letras salta a la opción que
  empieza así; Esc cierra y devuelve el foco; Tab cierra y sigue.
- Móvil: el selector nativo es mejor en teléfono (lector de pantalla y rueda del sistema). Plan: usar el componente propio en
  escritorio y el `<select>` nativo cuando el puntero es táctil.

## Plan por fases

1. **Fundamentos M2:** tokens de elevación (z1, z2, z8), radios (4 px), curvas y duraciones de movimiento, capas de estado
   (hover/foco/pulsado). Sin cambiar aún ninguna pantalla.
2. **Selector «exposed dropdown» propio** (`Select`): campo relleno con etiqueta flotante, línea de acento, flecha que gira,
   menú elevado z8 con ítems de 48 px y el ítem seleccionado resaltado, apertura con escala 0.8 → 1. Teclado completo y
   `<select>` nativo en táctil. Se aplica a: rol de usuario, columna, asignado, workspace, mover tarjeta, compartir.
3. **Menús:** unificar «Más acciones», tipo de columna, filtros y notificaciones con la misma superficie y los mismos ítems.
4. **Campos de texto rellenos con etiqueta flotante** en formularios clave (inicio de sesión, nuevo usuario, alias, detalle de
   tarjeta), con línea de acento y texto de apoyo/errores.
5. **Botones, chips y casillas:** estados M2 (capas de hover/foco/pulsado), chips de filtro y de etiqueta, interruptores.
6. **Diálogos y avisos (snackbar):** elevación y movimiento de M2, acciones alineadas a la derecha.

Cada fase se verifica con axe/Lighthouse, la auditoría de espacios y capturas en escritorio, móvil y modo oscuro; en modo
oscuro las superficies elevadas se aclaran con una capa blanca en lugar de oscurecerse (patrón de M2).
