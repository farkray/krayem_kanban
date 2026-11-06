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
| CO-01 | Agregar columna (máx. 10 por tablero) | MVP |
| CO-02 | Renombrar columna | MVP |
| CO-03 | Eliminar columna | MVP |
| CO-04 | Reordenar columnas (drag & drop) | MVP |
| CO-05 | Contador de tarjetas en cabecera ("2 tarjetas", "1 tarjeta") | MVP |
| CO-06 | Límite de tarjetas por columna (WIP) | Futuro |
| CO-07 | Colapsar columna | Futuro |

**CO-01 Agregar columna**
- Tarjeta-botón "Agregar columna" al final, con contador "3 de 10 columnas".
- Al llegar a 10: el botón se deshabilita y muestra "10 de 10 columnas".
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

## 14. Tipo de columna y límite de tarjetas (implementado)

Cada columna tiene un **tipo** que se elige con radios en el botón de ajustes del encabezado ("Tipo de columna"):

| Tipo | Límite | Para qué |
|---|---|---|
| Estándar | sin límite | Por hacer, Listo, archivo… |
| Next | **4** tarjetas | Lo que sigue |
| Doing | **2** tarjetas | Lo que se ejecuta ahora |

- El encabezado muestra el contador (`Doing 1/2`); al llegar al tope se pinta en ámbar y "Agregar tarjeta" pasa a "Límite alcanzado" (deshabilitado).
- **Se aplica siempre**: al crear, al arrastrar (ratón, dedo o teclado), al cambiar de columna desde el detalle y al eliminar una columna moviendo sus tarjetas. Si no cabe, no se mueve y aparece un aviso. Durante el arrastre la columna llena se resalta en ámbar.
- Reordenar dentro de la misma columna siempre se permite.
- No se puede cambiar una columna a un tipo con menos cupo que sus tarjetas actuales (mueve algunas primero).
- Deshacer el borrado de una tarjeta no se aplica si la columna ya se llenó.
- Los tableros nuevos crean "En curso" como Doing; los existentes siguen como Estándar hasta que lo cambies.
- El tipo se guarda en la columna (`kind`) y se sincroniza como cualquier otro dato.

## 15. Papelera en la tarjeta (implementado)

Cada tarjeta tiene un botón de papelera fuera de su área clicable (aparece al apuntarla; siempre visible en táctil y atenuado en la última columna) para eliminar rápido sin abrir el detalle. Usa el mismo aviso "Deshacer" de 10 s.

## 16. Actualizaciones y editor con formato (implementado)

- La tarjeta tiene dos pestañas: **Detalles** y **Actualizaciones / n**.
- Ambas pestañas tienen el mismo cuadro de texto con barra de formato y el botón **Actualizar**. En Detalles solo se envía (queda un aviso "Enviada a la pestaña Actualizaciones"); en Actualizaciones, además, se ve el **feed** (lo más nuevo primero) con el Markdown renderizado, editable y eliminable.
- Ya no hay campo "Descripción" ni sección "Comentarios": una descripción que existiera pasa sola a ser la primera actualización al abrir la tarjeta.
- El cuadro es un **editor visual**: el formato se ve ya aplicado mientras escribes (sin asteriscos ni guiones crudos); por debajo se guarda Markdown plano.
- Barra: título, negrita, cursiva, tachado, listas (viñetas, numerada, de tareas), cita, código, enlace, línea separadora; Ctrl/Cmd+Enter envía.
- **Imágenes:** se pegan con Ctrl/Cmd+V (o se sueltan) en el editor; se comprimen en el navegador igual que las de la tarjeta, se guardan como adjuntos "en línea" (no aparecen en la galería de la tarjeta; máx. 100 por tarjeta) y se sincronizan. En el Markdown quedan como `![nombre](attachment:ID)`; no se cargan imágenes externas.
- Límite conocido: al eliminar una actualización, sus imágenes quedan en el servidor (el borrado es lógico).

## 17. Administración de usuarios (implementado)

- La cuenta de `ADMIN_EMAIL` es **administrador** (se vuelve a asignar en cada arranque del servidor). Cualquier otra cuenta puede ser admin con `set-admin` por CLI.
- El admin ve el botón **Usuarios** en la barra lateral: lista de cuentas, **crear** (correo + contraseña opcional; vacía = temporal generada, que se muestra una sola vez con botón Copiar), **restablecer contraseña** (nueva temporal; cierra las sesiones de ese usuario) y **eliminar** (con confirmación; borra todos sus datos e imágenes). No puede eliminarse a sí mismo.
- API `/api/admin/*` (GET/POST `users`, POST `users/:id/password`, DELETE `users/:id`): exige sesión de admin (403 si no) y la misma comprobación de origen que el resto.

## 18. Tableros privados y compartidos (implementado)

- Cada tablero es **privado** por defecto. El dueño pulsa **Compartir** en el tablero e invita por **correo** a una cuenta existente (si no tiene cuenta, el admin debe crearla) con permiso **Editor** (cambia tarjetas, columnas, etiquetas, comentarios e imágenes) o **Solo lectura** (solo ve). Puede cambiar el permiso o quitar a alguien cuando quiera.
- Solo el dueño comparte, renombra o elimina el tablero. Un invitado puede **Salir del tablero**.
- En la barra lateral, los tableros ajenos aparecen en **Compartidos conmigo** (con dueño y permiso); los propios compartidos indican con cuántas personas.
- En solo lectura se ocultan o desactivan los controles de edición (agregar, arrastrar, eliminar, editor de actualizaciones); además el cliente y el servidor rechazan las escrituras.
- Los cambios llegan en vivo a todos los miembros. Si te quitan acceso, el tablero se borra de tu dispositivo.
- **Etiquetas por tablero:** pasaron a ser del tablero (se comparten con él). Al actualizar, las etiquetas antiguas se copian a cada tablero que las usaba (las que no usaba ninguno, al primero).
- Límite conocido: si el admin elimina a un usuario, se borran también las imágenes que subió a tableros de otros.

## 19. Tipo Done, miembros y asignación (implementado)

Decisiones de UX (apoyadas en una revisión de patrones de Jira, GitLab, Primer y otros sistemas de diseño):

- **Done:** cuarto tipo de columna (sin límite). Sus tarjetas se ven *apagadas sin bajar la opacidad* (eso rompe el contraste AA, problema documentado en GitLab): se aplanan (sin sombra), se acercan al fondo de la columna, el título pasa al gris de apoyo con peso normal y llevan una marca de visto bueno, de modo que no dependen solo del color. Al apuntarlas recuperan su relieve. La columna muestra la etiqueta "Done". En tableros nuevos, "Listo" nace como Done. Las tarjetas Done nunca se marcan como vencidas.
- **Miembros:** en los tableros compartidos (tuyos o ajenos) el encabezado muestra una pila de avatares (máx. 4 y "+n"); al pulsarla se abre la lista completa con correo, "(tú)" y permiso (Dueño / Editor / Solo lectura). El dueño tiene ahí "Administrar acceso". Los avatares usan iniciales y un color estable por correo (misma paleta AA de las etiquetas), con el correo como nombre accesible.
- **Asignado a:** campo en el detalle de la tarjeta (solo en tableros con más de una persona), con los participantes del tablero, "(tú)" y "Sin asignar". La tarjeta muestra el avatar de la persona asignada junto a su fecha (metadatos abajo, como se recomienda). Si la persona deja el tablero, el campo lo indica.
- **Filtro por persona:** en Filtros, sección "Asignado a" con "Yo" primero (el atajo que más se usa), cada participante y "Sin asignar"; se combina con las etiquetas (Y entre grupos, O dentro de cada uno) y aparece como chips en la barra de filtros. Los filtros se limpian al cambiar de tablero. Se listan todos los participantes, no solo los que ya tienen tarjetas.
- El servidor devuelve en `/api/shares` los `participants` (dueño + miembros) también a los invitados.

## 20. Alias de usuario y directorio para compartir (implementado)

- Cada usuario tiene un **alias** (nombre para mostrar, hasta 60 caracteres; espacios sobrantes se limpian). Vacío = se muestra el correo. Se fija **al crear** la cuenta (formulario del admin, CLI `--alias` y registro abierto, campo «Nombre (opcional)») y el admin lo edita después en **Usuarios → Editar alias** (o `set-alias`).
- El alias se muestra de forma consistente: iniciales del avatar, lista de miembros, «Asignado a», filtros, «De …» en tableros compartidos, el pie de la barra lateral y el diálogo de compartir. El color del avatar depende del correo, así que no cambia si se edita el alias.
- **Compartir**: en vez de escribir un correo, se elige a la persona de un **menú desplegable con los usuarios registrados** (`alias · correo`), sin uno mismo ni quienes ya tienen acceso. API: `GET /api/users/directory` (solo con sesión; devuelve id, correo y alias, nada más).
- Los participantes (`/api/shares`) y las respuestas de login/`me` incluyen el alias.

## 21. Panel de control (implementado)

- La gestión de usuarios dejó de ser un modal: es una **pantalla propia** en la ruta `/admin` («Panel de control» en la barra lateral, solo para administradores). Arriba tiene **← Volver a los tableros**; la barra lateral y el botón de inicio también regresan.
- Composición (tras la auditoría de estética): título con un resumen de una línea («3 usuarios · 1 administrador»); **tabla de anchos fijos** (Usuario · Rol · acciones) donde todas las filas miden lo mismo y los botones no se parten; por fila, **una acción visible** («Poner/Editar alias») y un **menú «⋯»** con «Restablecer contraseña» y «Eliminar usuario» (la propia cuenta no ofrece eliminar); buscador por nombre o correo; y al lado el formulario **Nuevo usuario** (correo, alias y contraseña opcionales) con el mismo encabezado alineado.
- La **contraseña temporal** aparece en una tarjeta serena junto al formulario (se muestra una sola vez, con «Copiar»).
- Responsive: en pantallas medias el formulario baja bajo la tabla; en teléfono cada usuario se apila (nombre, rol y acciones). Quien no es admin ve un aviso y solo puede volver.

## 22. Menciones con @ (implementado)

- En **tableros compartidos**, al escribir `@` en una **actualización** o en una **tarea** de la lista aparece un menú con las personas del tablero (dueño y miembros, también uno mismo); se filtra al seguir escribiendo (sin acentos ni mayúsculas) y se elige con ↑ ↓ + Enter/Tab o con el mouse; Escape lo cierra. Un correo (`a@b`) no abre el menú.
- Se guarda como un enlace Markdown, `[@Nombre](mention:<id de usuario>)`, así que sigue a la persona aunque cambie de alias. Se dibuja como un **chip** con su nombre actual, tanto en el feed como en los ítems; el chip de **tus** menciones va relleno.
- La tarjeta muestra un chip **@** («Te mencionan») cuando alguien te mencionó en sus actualizaciones o en su lista de tareas.
- Límite conocido: aún no hay notificaciones (push ni correo); la marca en la tarjeta es el aviso. En tableros privados no hay a quién mencionar.
