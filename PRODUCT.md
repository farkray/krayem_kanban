# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una sola persona (el dueño): profesional de trabajo web/SEO y docencia que gestiona sus tareas
personales (por ejemplo "Actualizar la licencia de Screaming Frog", "Banner importador", "mandar
recibo"). Uso diario, pocas tarjetas por columna, sesiones cortas. Se usa sobre todo en
**escritorio** (planificar y arrastrar) y en el **teléfono** como apoyo (consultar y agregar tarjetas
rápido). Hay más usuarios solo si el dueño crea cuentas; el registro está cerrado.

## Product Purpose

Tablero Kanban en español para ordenar trabajo propio sin fricción: tableros con hasta 5 columnas,
tarjetas con descripción, fechas de inicio/final opcionales, lista de tareas opcional, comentarios
en Markdown e imágenes. Éxito = abrirlo, ver el estado del trabajo de un vistazo y mover o agregar
una tarjeta en segundos, desde cualquier dispositivo y sin conexión.

## Positioning

Los datos viven en el servidor propio del dueño (VPS), no en un servicio de terceros. Funciona sin
internet (offline-first, instalable como PWA) y sincroniza al volver la red. Las imágenes se
comprimen en el navegador (WebAssembly). Un tablero comercial no puede prometer esa propiedad de los
datos ni esa independencia.

## Operating Context

- Uso personal diario en computadora; consulta y captura rápida en el teléfono, a veces sin red.
- Se despliega en un VPS propio con HTTPS vía Traefik o Caddy; ver `deploy/README.md`.
- Idioma de la interfaz: español (México). Textos en `src/` (sin i18n todavía).

## Capabilities and Constraints

- Máximo 5 columnas por tablero; 3 por defecto: "Por hacer", "En curso" (Doing), "Listo".
- Tipos de columna con límite de tarjetas: Estándar (sin límite), Next (máx. 4) y Doing (máx. 2).
- Funciones fuera de alcance por ahora: tableros compartidos, menciones, ayuda (botón sin función).
  Los filtros existen solo por etiqueta.
- Borrados con "Deshacer" durante 10 s. Cerrar sesión borra los datos locales del dispositivo.
- Debe seguir funcionando offline y en táctil (arrastre con pulsación larga).
- Decisión abierta: dominio propio definitivo; modo oscuro (se trabaja en la pasada estética).

## Evidence on Hand

- Referencia visual original del dueño: tablero con columnas blancas redondeadas, tarjetas con
  título y "Creada hoy", botón azul "Agregar tarjeta" y "Agregar columna · 3 de 5 columnas".
- Documentos de producto: `project.md` (arquitectura y fases), `tool.md` (funcionalidades).
- No hay marca, logotipo ni testimonios más allá del icono de tres columnas (`public/favicon.svg`).
  No inventar clientes, métricas ni claims.

## Product Principles

1. **Operar primero.** Es una herramienta de uso diario: claridad y velocidad pesan más que la
   expresión; la personalidad vive en los detalles precisos.
2. **Siempre disponible.** Nunca bloquear al usuario por falta de red o por un servicio externo.
3. **Nada se pierde.** Todo borrado se puede deshacer; lo escrito se guarda solo.
4. **Mismo producto en cada pantalla.** El teléfono no es una versión recortada: las acciones
   principales funcionan igual con mouse, teclado y dedo.
5. **Datos propios.** Sin analítica ni servicios de terceros.

## Accessibility & Inclusion

Cumplir WCAG 2.1 AA (verificado con axe en CI de pruebas E2E): contraste, foco visible, uso completo
por teclado, anuncios de arrastre en español para lector de pantalla, objetivos táctiles de 44 px
en dispositivos táctiles y respeto de `prefers-reduced-motion`.
