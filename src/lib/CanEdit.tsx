import { createContext, useContext } from 'react'

/** ¿Se puede editar lo que se está viendo? (false = tablero compartido como solo lectura) */
export const CanEditContext = createContext(true)
export const useCanEdit = () => useContext(CanEditContext)
