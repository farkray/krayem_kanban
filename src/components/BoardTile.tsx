import type { CSSProperties } from 'react'
import { boardColorOf, boardIconOf, type BoardIconName } from '../lib/types'
import {
  BarChartIcon,
  BoardIcon,
  BookIcon,
  BriefcaseIcon,
  CodeBracketsIcon,
  HeartIcon,
  HomeIcon,
  MegaphoneIcon,
  RocketIcon,
  StarIcon,
} from './Icons'

/** El glifo de un icono de tablero (blanco, sobre el color). */
export function BoardGlyph({ name, size }: { name: BoardIconName; size: number }) {
  const p = { width: size, height: size }
  switch (name) {
    case 'trabajo':
      return <BriefcaseIcon {...p} />
    case 'estudio':
      return <BookIcon {...p} />
    case 'codigo':
      return <CodeBracketsIcon {...p} />
    case 'grafica':
      return <BarChartIcon {...p} />
    case 'anuncio':
      return <MegaphoneIcon {...p} />
    case 'casa':
      return <HomeIcon {...p} />
    case 'corazon':
      return <HeartIcon {...p} />
    case 'estrella':
      return <StarIcon {...p} />
    case 'cohete':
      return <RocketIcon {...p} />
    default:
      return <BoardIcon {...p} />
  }
}

interface Props {
  /** Color e icono del tablero; si faltan o no se conocen, el aspecto por defecto. */
  color?: string
  icon?: string
  /** Tamaño del glifo en px. */
  size: number
  /** Clase que da tamaño y forma al cuadro (cada lugar tiene el suyo). */
  className: string
}

/**
 * Cuadro de color con el icono del tablero. Es decorativo: el nombre del tablero va siempre al lado,
 * así que no se anuncia por separado.
 */
export function BoardTile({ color, icon, size, className }: Props) {
  const c = boardColorOf({ color })
  const style = {
    '--tile-from': `var(--board-${c})`,
    '--tile-to': `var(--board-${c}-deep)`,
  } as CSSProperties
  return (
    <span className={className} style={style} aria-hidden="true">
      <BoardGlyph name={boardIconOf({ icon })} size={size} />
    </span>
  )
}
