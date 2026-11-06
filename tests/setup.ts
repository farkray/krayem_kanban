import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

// jsdom no implementa elementFromPoint (user-event lo usa al hacer clic dentro de diálogos)
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null
}

// ProseMirror (editor de actualizaciones) mide rangos de texto; jsdom no tiene layout
if (typeof Range !== 'undefined') {
  const none = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getClientRects ??= none
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
}
