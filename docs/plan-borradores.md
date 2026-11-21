# Plan: que una actualización escrita nunca se pierda

## Qué pasa hoy

En **Detalles** de una tarjeta, la sección «Actualización» es un editor cuyo contenido solo existe en el propio editor
hasta que se pulsa **Actualizar** (o Ctrl/Cmd+Enter). Todo lo demás lo descarta sin avisar:

- **Listo**, la **×**, **Esc**, pulsar fuera del diálogo y cambiar a la pestaña **Actualizaciones** desmontan el editor.
- El botón **Actualizar** queda debajo del pliegue (el cuerpo se desplaza y el pie solo muestra «Listo»), así que es fácil
  ni verlo. El pie dice «Los cambios se guardan solos», que para este texto no es cierto.
- Lo mismo ocurre con las respuestas, y con editar una actualización ya publicada.

## Objetivo

1. Escribir y **cerrar** nunca pierde texto (borrador siempre guardado).
2. **Listo** significa «ya terminé»: si hay un texto pendiente, se publica.
3. Siempre se **ve** que hay algo sin enviar y cómo enviarlo.

## Cambios propuestos

**A. Borradores automáticos (red de seguridad, cubre todo)**
- Guardar el contenido (Markdown) de cada editor mientras se escribe, con retraso de ~400 ms, por tarjeta y tipo
  (`actualización`, `respuesta a <id>`, `edición de <id>`). Local al dispositivo, en la base del navegador (Dexie, tabla
  de metadatos), sin sincronizar.
- Al abrir el editor se restaura el borrador y se avisa: «Borrador recuperado».
- Se borra solo al **enviar** o al **descartar a propósito** (botón Cancelar). Cubre Esc, ×, pulsar fuera, cambio de
  pestaña, recargar la página, cierre del navegador y caídas.
- Las imágenes pegadas ya se guardan como adjuntos de la tarjeta al pegarlas; el borrador solo guarda su referencia.

**B. «Listo» publica lo pendiente**
- Con un borrador no vacío, **Listo** hace lo mismo que Actualizar y cierra; el botón pasa a decir **Actualizar y cerrar**
  y el pie muestra «Hay una actualización sin enviar».
- Si no se puede publicar (límite de imágenes, permisos, error), el diálogo **no se cierra** y explica el motivo.
- **×**, **Esc** y pulsar fuera **no publican**: cierran conservando el borrador, con un aviso «Borrador guardado en la
  tarjeta» (así nadie publica algo a medias sin querer).

**C. Visibilidad**
- Barra de acciones del editor (Cancelar / Actualizar) **fija al pie del cuerpo** del diálogo para que nunca quede oculta.
- Marca «Borrador» en la pestaña Actualizaciones y un punto discreto en la tarjeta del tablero cuando hay texto pendiente.
- Aviso al cambiar de pestaña con texto sin enviar: se conserva (A) y el pie lo recuerda.

**D. Alcance en dos pasos**
1. Actualizaciones nuevas (el caso que duele) con A, B y C.
2. Respuestas y edición de actualizaciones existentes con el mismo mecanismo.

## Pruebas

- Unitarias: guardar y restaurar borrador, limpiar al enviar, «Listo» publica y cierra, «Listo» con error no cierra.
- E2E: escribir → Listo → aparece en Actualizaciones y sube el contador; escribir → Esc → reabrir → texto recuperado;
  escribir → recargar → texto recuperado; escribir → cambiar de pestaña → vuelve el texto.
- Revisión visual: barra fija en escritorio y móvil, modo claro y oscuro.

## Decisión abierta

«Listo» con texto pendiente: **publicar** (propuesta; coincide con la expectativa de «terminé») o **conservar como
borrador y avisar**. Con A en marcha, ninguna de las dos pierde texto.
