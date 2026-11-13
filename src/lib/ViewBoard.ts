import { createContext, useContext } from 'react'
import { linkIdsOf, newCardLabelsOf } from './types'

/**
 * Tablero que se está mirando. Si es un subtablero, `linkLabelIds` son las etiquetas que lo vinculan:
 * las tarjetas son siempre del tablero padre, y las subetiquetas solo se ven y se usan dentro del
 * subtablero donde se crearon.
 */
export interface ViewBoard {
  boardId: string
  linkLabelIds: string[] | null
  /** Etiquetas con las que nace una tarjeta creada en el subtablero. */
  newCardLabelIds: string[]
}
export const ViewBoardContext = createContext<ViewBoard | null>(null)
export const useViewBoard = () => useContext(ViewBoardContext)

/** Valor del contexto para un tablero (null en los de primer nivel: sin vínculo). */
export const viewOf = (b: {
  id: string
  linkLabelIds?: string[]
  linkLabelId?: string
  linkMode?: 'any' | 'all'
}): ViewBoard => {
  const ids = linkIdsOf(b)
  return {
    boardId: b.id,
    linkLabelIds: ids.length ? ids : null,
    newCardLabelIds: newCardLabelsOf(b),
  }
}
