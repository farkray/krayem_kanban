import {
  BOARD_COLORS,
  BOARD_COLOR_NAMES,
  BOARD_ICONS,
  BOARD_ICON_NAMES,
  boardColorOf,
  boardIconOf,
} from './types'

describe('aspecto de los tableros', () => {
  it('hay 10 colores y 10 iconos, cada uno con nombre en español y sin repetidos', () => {
    expect(BOARD_COLORS).toHaveLength(10)
    expect(BOARD_ICONS).toHaveLength(10)
    expect(new Set(Object.values(BOARD_COLOR_NAMES)).size).toBe(10)
    expect(new Set(Object.values(BOARD_ICON_NAMES)).size).toBe(10)
    for (const c of BOARD_COLORS) expect(BOARD_COLOR_NAMES[c]).toBeTruthy()
    for (const i of BOARD_ICONS) expect(BOARD_ICON_NAMES[i]).toBeTruthy()
  })

  it('lo ausente o desconocido cae al aspecto por defecto', () => {
    expect(boardColorOf({})).toBe('petroleo')
    expect(boardColorOf({ color: 'fucsia' })).toBe('petroleo')
    expect(boardColorOf({ color: 'rojo' })).toBe('rojo')
    expect(boardIconOf({})).toBe('tablero')
    expect(boardIconOf({ icon: 'dragon' })).toBe('tablero')
    expect(boardIconOf({ icon: 'estrella' })).toBe('estrella')
  })
})
