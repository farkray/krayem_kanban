import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core'

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para mover este elemento, presiona la barra espaciadora. Con las flechas lo cambias de posición, ' +
    'con espacio lo sueltas y con Escape cancelas.',
}

/** Anuncios en español para lectores de pantalla. `nameOf` traduce un id de dnd-kit a un nombre legible. */
export function announcements(
  nameOf: (id: UniqueIdentifier) => string,
  noun: string,
): Announcements {
  return {
    onDragStart: ({ active }) => `Tomaste ${noun} “${nameOf(active.id)}”.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${noun[0].toUpperCase()}${noun.slice(1)} “${nameOf(active.id)}” está sobre “${nameOf(over.id)}”.`
        : `${noun[0].toUpperCase()}${noun.slice(1)} “${nameOf(active.id)}” ya no está sobre un destino.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${noun} “${nameOf(active.id)}” sobre “${nameOf(over.id)}”.`
        : `Soltaste ${noun} “${nameOf(active.id)}” fuera de un destino.`,
    onDragCancel: ({ active }) =>
      `Movimiento cancelado. ${noun[0].toUpperCase()}${noun.slice(1)} “${nameOf(active.id)}” volvió a su lugar.`,
  }
}
