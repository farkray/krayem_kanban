# Kanban App — Funcionalidades

Define qué hace la herramienta. Cada funcionalidad tiene ID, comportamiento y criterios de aceptación.
Prioridad: **MVP** (primera versión usable) · **V1** (siguiente) · **Futuro**.
Referencia de arquitectura y fases: [project.md](project.md).

---

## 1. Tableros

| ID | Funcionalidad | Prioridad |
|---|---|---|
| TB-01 | Crear tablero | MVP |
| TB-02 | Listar tableros en la barra lateral | MVP |
| TB-03 | Abrir tablero | MVP |
| TB-04 | Renombrar tablero | MVP |
| TB-05 | Eliminar tablero | MVP |
| TB-06 | Reordenar tableros (drag & drop en sidebar) | V1 |
| TB-07 | Duplicar tablero | Futuro |
| TB-08 | Archivar tablero | Futuro |

**TB-01 Crear tablero**
- Botón `+` junto a "Mis Tableros".
- Pide nombre (obligatorio, 1–60 caracteres, recortado de espacios).
- Se crea con 3 columnas por defecto: *Por hacer*, *En curso*, *Listo*.
- Aparece en la lista y se abre de inmediato.

**TB-02 Lista lateral**
- Cada ítem: ícono, nombre, "N columnas · M tarjetas".
- Ítem activo resaltado.
- Barra lateral colapsable (botón arriba a la izquierda); el estado (abierta/cerrada) se recuerda.

**TB-04 Renombrar**
- Clic en el título del tablero (cabecera) → edición inline. `Enter` guarda, `Esc` cancela.

**TB-05 Eliminar**
- Pide confirmación con el nombre del tablero y cuántas tarjetas se perderán.
- Borrado lógico; opción **Deshacer** durante ~10 s (toast).

---

## 2. Columnas

| ID | Funcionalidad | Prioridad |
|---|---|---|
| CO-01 | Agregar columna (máx. 5 por tablero) | MVP |
| CO-02 | Renombrar columna | MVP |
| CO-03 | Eliminar columna | MVP |
| CO-04 | Reordenar columnas (drag & drop) | MVP |
| CO-05 | Contador de tarjetas en cabecera ("2 tarjetas", "1 tarjeta") | MVP |
| CO-06 | Límite de tarjetas por columna (WIP) | Futuro |
| CO-07 | Colapsar columna | Futuro |

**CO-01 Agregar columna**
- Tarjeta-botón "Agregar columna" al final, con contador "3 de 5 columnas".
- Al llegar a 5: el botón se deshabilita y muestra "5 de 5 columnas".
- Nombre obligatorio, 1–40 caracteres.

**CO-03 Eliminar columna**
- Si tiene tarjetas: ofrecer **mover tarjetas a otra columna** o **eliminarlas**.
- Mínimo 1 columna por tablero (no se puede eliminar la última).
- Deshacer disponible.

**CO-05 Contador**
- Plural correcto en español: "0 tarjetas", "1 tarjeta", "2 tarjetas".
- Se actualiza en vivo al mover/crear/eliminar.

---

## 3. Tarjetas

| ID | Funcionalidad | Prioridad |
|---|---|---|
| TA-01 | Agregar tarjeta rápida (solo título) | MVP |
| TA-02 | Editar título inline | MVP |
| TA-03 | Abrir detalle (modal) | MVP |
| TA-04 | Descripción (texto) | MVP |
| TA-05 | Eliminar tarjeta | MVP |
| TA-06 | Mover tarjeta entre columnas (drag & drop) | MVP |
| TA-07 | Reordenar dentro de la columna | MVP |
| TA-08 | Fecha de creación ("Creada hoy", "Creada hace 3 días") | MVP |
| TA-09 | Adjuntar imagen / portada (comprimida con WASM) | V1 ✔ |
| TA-10 | Etiquetas con nombre y color (p. ej. "Coppel" · Azul) | V1 ✔ |
| TA-11 | Fecha de inicio y fecha final (ambas opcionales) | MVP |
| TA-12 | Lista de tareas (checklist, opcional) | MVP |
| TA-13 | Duplicar tarjeta | V1 |
| TA-14 | Mover a otro tablero | Futuro |
| TA-15 | Comentarios en feed con Markdown | MVP |
| TA-16 | Editar y eliminar comentarios | MVP |

**TA-01 Agregar tarjeta**
- Botón azul "+ Agregar tarjeta" al final de cada columna.
- Se abre campo de texto en la misma posición; `Enter` crea y deja abierto el campo para encadenar más; `Esc` cierra.
- Título vacío no crea nada.
- La tarjeta nueva se agrega al final de la columna.

**TA-03 Detalle**
- Clic en la tarjeta abre un modal con, en orden: título editable, columna actual, fechas de inicio/final (TA-11), descripción, lista de tareas (TA-12), comentarios (TA-15), acciones (eliminar, duplicar). Las secciones opcionales (fechas, lista) aparecen como botón "Agregar…" hasta que se usan.
- Se cierra con `Esc` o clic fuera. Cambios guardados automáticamente (ver sección 6).

**TA-06 / TA-07 Drag & drop**
- Arrastrar con mouse, touch o teclado (espacio para tomar, flechas para mover, espacio para soltar).
- Indicador visual del destino; la tarjeta arrastrada se ve elevada.
- Orden persistido con fractional indexing (una sola escritura por movimiento).

**TA-08 Fecha**
- Texto relativo en español en la esquina inferior derecha de la tarjeta; fecha completa en tooltip.

**TA-11 Fecha de inicio y final**
- Dos campos opcionales en el detalle: *Inicio* y *Final*. Cada uno se puede dejar vacío o borrar.
- Validación: si ambas existen, Final ≥ Inicio (si no, se muestra error en el campo y no se guarda).
- En la tarjeta del tablero: si hay fechas se muestra un chip con el rango ("3 nov → 10 nov", o solo "Inicio 3 nov" / "Vence 10 nov").
- Estados visuales del chip: normal, "vence pronto" (≤ 2 días), "vencida" (Final pasada y tarjeta fuera de la última columna).
- Selector de fecha nativo accesible; formato localizado en español.

**TA-12 Lista de tareas**
- Opcional: la tarjeta no tiene lista hasta que el usuario pulsa "Agregar lista de tareas".
- Ítems: texto (1–200 caracteres), casilla de completado, reordenables con drag & drop, editables inline, eliminables.
- Agregar con `Enter` (encadena ítems); pegar varias líneas crea un ítem por línea.
- Barra de progreso en el detalle y indicador compacto en la tarjeta ("2/5") solo si hay ítems.
- Una lista por tarjeta (varias listas con título: Futuro).
- Quitar la lista pide confirmación si tiene ítems; deshacer disponible.

**TA-15 Comentarios (feed)**
- Caja de comentarios en el detalle, debajo de la descripción. Los comentarios se muestran como feed cronológico (más recientes abajo, con scroll al nuevo comentario al enviarlo).
- El editor acepta **Markdown**: negritas, cursiva, tachado, encabezados, listas, listas de tareas `- [ ]`, citas, código en línea y bloques, enlaces. Pestañas *Escribir* / *Vista previa*.
- Enviar con botón "Comentar" o `Cmd/Ctrl+Enter`. Comentario vacío no se envía.
- Cada comentario muestra autor, fecha/hora relativa (fecha completa en tooltip) y marca "editado" si aplica.
- Render seguro: el Markdown se sanitiza (sin HTML crudo ni scripts); enlaces con `rel="noopener noreferrer"` y `target="_blank"`.
- Contador de comentarios en la tarjeta del tablero (ícono + número) solo si hay.
- Límite: 10 000 caracteres por comentario.
- Funciona sin conexión: el comentario se guarda local con estado *pendiente* y se envía al reconectar.

**TA-16 Editar y eliminar comentarios**
- Menú por comentario: *Editar* y *Eliminar*. Editar reutiliza el mismo editor; se actualiza `editado`.
- Eliminar pide confirmación; borrado lógico con deshacer.

**TA-09 Imágenes**
- Formatos de entrada: JPG, PNG, WebP, HEIC si el navegador lo decodifica.
- Compresión en Web Worker (WASM): máx. 1600 px lado largo, WebP calidad ~80.
- Se muestra ahorro de tamaño ("4.2 MB → 380 KB").
- Límite de entrada: 15 MB por archivo.

---

## 4. Búsqueda y filtros

| ID | Funcionalidad | Prioridad |
|---|---|---|
| BU-01 | Búsqueda global (tableros, columnas, tarjetas) | MVP |
| BU-02 | Atajo `/` o `Cmd/Ctrl+K` para enfocar búsqueda | MVP |
| BU-03 | Filtros (botón junto a búsqueda): por etiqueta | V1 ✔ (por etiqueta) |

**BU-01 Búsqueda**
- Campo "Buscar tableros, columnas y tarjetas" en la barra superior.
- Resultados agrupados por tipo; clic navega al tablero y resalta el elemento.
- Insensible a mayúsculas y acentos ("presentacion" encuentra "Presentación").
- Se ejecuta sobre IndexedDB local → funciona sin conexión.

**BU-03 Filtros**
- Por etiqueta, fecha de creación, rango de fechas inicio/final, "vencidas", "con lista de tareas incompleta" y "con comentarios".
- La búsqueda global (BU-01) también cubre descripción, ítems de lista y texto de comentarios.
- Las tarjetas que no coinciden se atenúan u ocultan; chip visible de "filtro activo" con opción de limpiar.

---

## 5. Navegación y ayuda

| ID | Funcionalidad | Prioridad |
|---|---|---|
| NA-01 | Botón inicio (vista de todos los tableros) | MVP |
| NA-02 | Ayuda `?` (atajos y guía rápida) | V1 |
| NA-03 | URL por tablero (`/b/:id`) para recargar/compartir enlace | MVP |
| NA-04 | Atajos de teclado | V1 |

**NA-04 Atajos sugeridos**
- `N` nueva tarjeta en columna enfocada · `/` buscar · `Esc` cerrar · `[` colapsar sidebar · `?` ayuda.

---

## 6. Guardado automático y nube

| ID | Funcionalidad | Prioridad |
|---|---|---|
| SY-01 | Autoguardado en la nube sin acción del usuario | MVP |
| SY-02 | Indicador de estado de guardado | MVP |
| SY-03 | Funcionamiento sin conexión | MVP |
| SY-04 | Sincronización entre pestañas/dispositivos | V1 |
| SY-05 | Resolución de conflictos (last-write-wins) | V1 |
| SY-06 | Deshacer / rehacer (`Cmd/Ctrl+Z`) | V1 |
| SY-07 | Exportar / importar JSON | V1 |

**SY-01** Todo cambio se guarda localmente al instante y se envía a la nube con debounce (~800 ms). No existe botón "Guardar".
**SY-02** Texto discreto en la barra superior: *Guardando…* → *Guardado* → *Sin conexión · N cambios pendientes*.
**SY-03** Sin red se puede leer y editar todo; los cambios quedan en cola y se envían al reconectar. Cerrar la pestaña no pierde datos pendientes.
**SY-04** Cambios remotos aparecen sin recargar (Realtime).
**SY-07** Exportar un tablero (o todos) a `.json`; importar crea tableros nuevos sin sobrescribir.

---

## 7. Cuenta y seguridad

| ID | Funcionalidad | Prioridad |
|---|---|---|
| AU-01 | Inicio de sesión (correo + contraseña, servidor propio) | MVP ✔ |
| AU-02 | Inicio de sesión con Google | Descartado (sin servicios externos) |
| AU-03 | Cerrar sesión | MVP |
| AU-04 | Datos aislados por usuario (RLS) | MVP |
| AU-05 | Eliminar cuenta y datos | V1 |

- Sesión persistente entre visitas.
- Primer ingreso: se crea el tablero inicial con columnas por defecto.
- Si hay datos locales previos sin cuenta, se ofrece importarlos al iniciar sesión.

---

## 8. PWA

| ID | Funcionalidad | Prioridad |
|---|---|---|
| PW-01 | Instalable desde Chrome (manifest + service worker) | MVP |
| PW-02 | Botón/aviso propio "Instalar app" | V1 |
| PW-03 | Aviso "Nueva versión disponible" → recargar | V1 |
| PW-04 | Carga instantánea de la app sin red (app shell en caché) | MVP |

---

## 9. Interfaz y experiencia

- Idioma: español (textos en un archivo de strings para facilitar i18n futuro).
- Estilo: tarjetas blancas redondeadas, fondo translúcido azul/gris claro, acento azul, tipografía del sistema.
- Responsive: escritorio (referencia), tablet, móvil (columnas con scroll horizontal; sidebar como panel deslizable).
- Estados vacíos: tablero sin tarjetas, sin tableros, búsqueda sin resultados.
- Estados de error: toast no intrusivo con reintento (fallo de sync, imagen inválida).
- Accesibilidad: navegación por teclado, roles ARIA, foco visible, contraste AA, anuncios de lector de pantalla al mover tarjetas.
- Modo oscuro: Futuro (pendiente de decisión).

---

## 10. Reglas y límites

| Elemento | Regla |
|---|---|
| Columnas por tablero | 1 a 5 |
| Nombre de tablero | 1–60 caracteres |
| Nombre de columna | 1–40 caracteres |
| Título de tarjeta | 1–200 caracteres |
| Descripción | hasta 10 000 caracteres |
| Fechas | inicio y final opcionales; final ≥ inicio |
| Ítems de lista de tareas | 1–200 caracteres; hasta 100 por tarjeta |
| Comentario | 1–10 000 caracteres, Markdown sanitizado |
| Imagen | ≤ 15 MB de entrada; se guarda comprimida |
| Borrados | lógicos, con deshacer ~10 s |
| Tarjetas por columna | sin límite (WIP opcional en Futuro) |

---

## 11. Fuera de alcance (por ahora)

- Colaboración multiusuario y tableros compartidos.
- Menciones (`@usuario`), reacciones y actividad/historial por tarjeta (los comentarios sí están incluidos, TA-15).
- Notificaciones y recordatorios.
- Automatizaciones, integraciones, app móvil nativa.

---

## 12. Mapa a fases de project.md

| Fase | Funcionalidades |
|---|---|
| 1 UI estática | Layout, TB-02, CO-05, TA-08 (visual) |
| 2 Local funcional | TB-01/03/04/05, CO-01..04, TA-01..08, TA-11, TA-12, TA-15/16, BU-01/02, NA-01/03 |
| 3 Nube | AU-01/03/04, SY-01..03 |
| 4 PWA | PW-01, PW-04 (luego PW-02/03) |
| 5 Imágenes WASM | TA-09 |
| 6+ V1 | TB-06, TA-10/11/13, BU-03, NA-02/04, SY-04..07, AU-02/05 |

## 13. Etiquetas (implementado)

- Una etiqueta = **nombre** (1–30 caracteres, único sin distinguir mayúsculas) + **color** de una paleta de 8: Azul, Verde, Rojo, Naranja, Amarillo, Morado, Rosa y Gris. Hasta 50 por usuario; son **globales** (sirven en todos los tableros, p. ej. una por empresa).
- Se asignan desde el detalle de la tarjeta (hasta 8 por tarjeta): crear (queda puesta en esa tarjeta), reutilizar, editar nombre/color, eliminar con Deshacer.
- En la tarjeta se ven hasta 3 etiquetas ("+N" si hay más). El nombre siempre está escrito: el color no es la única señal.
- **Filtrar** (botón Filtros): muestra solo las tarjetas con alguna de las etiquetas elegidas; las columnas indican "1 de 2 tarjetas". El filtro es de la sesión (no se guarda).
- **Buscar** encuentra tarjetas por el nombre de su etiqueta.
- Se sincronizan con el servidor (tabla `labels`) como el resto de los datos.
