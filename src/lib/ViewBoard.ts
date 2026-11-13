import { createContext, useContext } from 'react'

/**
 * Tablero que se está mirando. Si es un subtablero, `linkLabelId` es la etiqueta que lo vincula:
 * las tarjetas son siempre del tablero padre, y las subetiquetas solo se ven y se usan dentro del
 * subtablero donde se crearon.
 */
export interface ViewBoard {
  boardId: string
  linkLabelId: string | null
}
export const ViewBoardContext = createContext<ViewBoard | null>(null)
export const useViewBoard = () => useContext(ViewBoardContext)
