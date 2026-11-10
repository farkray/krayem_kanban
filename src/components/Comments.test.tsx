import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { setIdentityResolver, setRoleResolver } from '../lib/access'
import { CanEditContext } from '../lib/CanEdit'
import type { Comment, Like } from '../lib/types'
import { resetStore, useStore } from '../store/store'
import { useAccess } from '../sync/access'
import { useAuth } from '../sync/auth'
import { Comments } from './Comments'

const ts = '2026-11-01T10:00:00.000Z'
const base = { createdAt: ts, updatedAt: ts }
const comment = (id: string, extra: Partial<Comment> = {}): Comment => ({
  ...base,
  id,
  cardId: 'k1',
  boardId: 'b1',
  bodyMd: `Texto ${id}`,
  ...extra,
})

const ME = 'u-me'
const ANA = 'u-ana'

async function setup(
  opts: { role?: 'owner' | 'editor' | 'viewer'; comments?: Comment[]; likes?: Like[] } = {},
) {
  await resetStore()
  const foreign = opts.role === 'editor' || opts.role === 'viewer'
  useStore.setState({
    boards: [
      { ...base, id: 'b1', title: 'B', position: 'a0', ...(foreign ? { ownerId: 'u-owner' } : {}) },
    ],
    columns: [{ ...base, id: 'c1', boardId: 'b1', title: 'C', position: 'a0' }],
    cards: [{ ...base, id: 'k1', boardId: 'b1', columnId: 'c1', title: 'Tarjeta', position: 'a0' }],
    comments: opts.comments ?? [],
    likes: opts.likes ?? [],
  })
  useAuth.setState({ status: 'signedIn', userId: ME, email: 'yo@correo.com', alias: 'Yo Mismo' })
  useAccess.setState({
    shared: foreign
      ? [
          {
            boardId: 'b1',
            role: opts.role as 'editor' | 'viewer',
            ownerId: 'u-owner',
            ownerEmail: 'dueno@correo.com',
          },
        ]
      : [],
    members: [],
    participants: [
      { boardId: 'b1', userId: ME, email: 'yo@correo.com', alias: 'Yo Mismo', role: 'owner' },
      { boardId: 'b1', userId: ANA, email: 'ana@correo.com', alias: 'Ana López', role: 'editor' },
    ],
    loaded: true,
  })
  setIdentityResolver(() => ME)
  setRoleResolver(() => opts.role ?? 'owner')
  return userEvent.setup()
}
const S = () => useStore.getState()
/** Dibuja las actualizaciones como las vería alguien con ese rol (solo lectura no puede escribir). */
const show = (canEdit = true) =>
  render(
    <CanEditContext.Provider value={canEdit}>
      <Comments cardId="k1" />
    </CanEditContext.Provider>,
  )
const like = (id: string, commentId: string, userId: string, extra: Partial<Like> = {}): Like => ({
  ...base,
  id,
  cardId: 'k1',
  boardId: 'b1',
  commentId,
  userId,
  ...extra,
})

afterEach(() => {
  setRoleResolver(null)
  setIdentityResolver(null)
  useAuth.setState({ status: 'signedOut', userId: null, email: null, alias: '' })
  useAccess.setState({ shared: [], members: [], participants: [], loaded: false })
})

describe('actualizaciones: autor y respuestas', () => {
  it('muestra quién escribió cada una (no "Tú" para todas)', async () => {
    await setup({ comments: [comment('m1', { authorId: ANA }), comment('m2', { authorId: ME })] })
    render(<Comments cardId="k1" />)
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Yo Mismo')).toBeInTheDocument()
  })

  it('las más nuevas van primero y las respuestas cuelgan de su actualización', async () => {
    await setup({
      comments: [
        comment('a', { createdAt: '2026-11-01T10:00:00.000Z', authorId: ME }),
        comment('b', { createdAt: '2026-11-01T11:00:00.000Z', authorId: ME }),
        comment('r1', {
          createdAt: '2026-11-01T12:00:00.000Z',
          parentId: 'a',
          authorId: ANA,
          bodyMd: 'Respuesta uno',
        }),
      ],
    })
    render(<Comments cardId="k1" />)
    const feed = screen.getByRole('list', { name: 'Actualizaciones' })
    const cards = within(feed).getAllByText(/^Texto/)
    expect(cards.map((c) => c.textContent)).toEqual(['Texto b', 'Texto a'])
    const replies = within(feed).getByRole('list', { name: 'Respuestas' })
    expect(within(replies).getByText('Respuesta uno')).toBeInTheDocument()
  })

  it('responder crea una respuesta con autor y la deja bajo su actualización', async () => {
    const user = await setup({ comments: [comment('a', { authorId: ANA })] })
    render(<Comments cardId="k1" />)
    await user.click(screen.getByRole('button', { name: 'Responder' }))
    await user.type(screen.getByRole('textbox', { name: /Responder a Ana López/ }), 'De acuerdo')
    await user.click(screen.getAllByRole('button', { name: 'Responder' }).at(-1)!) // el de enviar
    const reply = S().comments.find((c) => c.parentId === 'a')!
    expect(reply).toMatchObject({ bodyMd: 'De acuerdo', authorId: ME, cardId: 'k1' })
    expect(await screen.findByText('De acuerdo')).toBeInTheDocument()
  })

  it('una respuesta a una respuesta se cuelga de la actualización original', async () => {
    await setup({ comments: [comment('a'), comment('r', { parentId: 'a' })] })
    const id = S().addReply('r', 'Otra')!
    expect(S().comments.find((c) => c.id === id)?.parentId).toBe('a')
    expect(S().addReply('no-existe', 'x')).toBeNull()
    expect(S().addReply('a', '   ')).toBeNull()
  })

  it('quien solo lee no ve el cuadro ni "Responder", pero sí puede dar "Me gusta"', async () => {
    await setup({ role: 'viewer', comments: [comment('a', { authorId: ANA })] })
    show(false)
    expect(
      screen.queryByRole('button', { name: /Escribe una actualización/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Responder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Más acciones' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me gusta' })).toBeInTheDocument()
  })

  it('editar y borrar: lo propio sí; lo de otra persona solo el dueño del tablero', async () => {
    await setup({
      role: 'editor',
      comments: [comment('mia', { authorId: ME }), comment('ajena', { authorId: ANA })],
    })
    const { unmount } = show()
    expect(screen.getAllByRole('button', { name: 'Más acciones' })).toHaveLength(1) // editor: solo la suya
    unmount()
    // el dueño del tablero (yo, sin tablero ajeno) puede con ambas
    useStore.setState({ boards: [{ ...base, id: 'b1', title: 'B', position: 'a0' }] })
    useAccess.setState({ shared: [] })
    show()
    expect(screen.getAllByRole('button', { name: 'Más acciones' })).toHaveLength(2) // dueño: ambas
  })

  it('al borrar una actualización se borran sus respuestas y sus "me gusta", y deshacer los trae de vuelta', async () => {
    await setup({
      comments: [comment('a', { authorId: ME }), comment('r', { parentId: 'a', authorId: ANA })],
      likes: [like('l1', 'a', ANA), like('l2', 'r', ME)],
    })
    S().deleteComment('a')
    expect(S().comments.every((c) => c.deletedAt)).toBe(true)
    expect(S().likes.every((l) => l.deletedAt)).toBe(true)
    S().toast?.undo?.()
    expect(S().comments.every((c) => !c.deletedAt)).toBe(true)
    expect(S().likes.every((l) => !l.deletedAt)).toBe(true)
  })
})

describe('actualizaciones: "Me gusta"', () => {
  it('da y quita mi "me gusta" y muestra el total', async () => {
    const user = await setup({
      comments: [comment('a', { authorId: ANA })],
      likes: [like('l1', 'a', ANA)],
    })
    render(<Comments cardId="k1" />)
    const btn = screen.getByRole('button', { name: 'Me gusta, 1' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveAttribute('title', 'Ana López')
    await user.click(btn)
    expect(screen.getByRole('button', { name: 'Me gusta, 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(S().likes.filter((l) => !l.deletedAt && l.userId === ME)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Me gusta, 2' }))
    expect(screen.getByRole('button', { name: 'Me gusta, 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(S().likes.find((l) => l.userId === ME)?.deletedAt).toBeTruthy() // borrado lógico, se sincroniza
  })

  it('dos "me gusta" de la misma persona (dos dispositivos) cuentan uno y se quitan juntos', async () => {
    const user = await setup({
      comments: [comment('a')],
      likes: [like('l1', 'a', ME), like('l2', 'a', ME)],
    })
    render(<Comments cardId="k1" />)
    expect(screen.getByRole('button', { name: 'Me gusta, 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Me gusta, 1' }))
    expect(S().likes.every((l) => l.deletedAt)).toBe(true)
  })

  it('el "me gusta" lleva la tarjeta y el tablero (para sincronizarse y compartirse)', async () => {
    await setup({ comments: [comment('a')] })
    S().toggleLike('a')
    expect(S().likes[0]).toMatchObject({ commentId: 'a', userId: ME, cardId: 'k1', boardId: 'b1' })
    S().toggleLike('no-existe') // no hace nada
    expect(S().likes).toHaveLength(1)
  })

  it('en un tablero de solo lectura el "me gusta" se guarda (no se bloquea como una edición)', async () => {
    await setup({ role: 'viewer', comments: [comment('a')] })
    S().toggleLike('a')
    expect(S().likes.filter((l) => !l.deletedAt)).toHaveLength(1)
    expect(S().toast).toBeNull()
    S().addComment('k1', 'no debería') // en cambio escribir sí se bloquea
    expect(S().toast?.message).toMatch(/solo lectura/)
  })
})

describe('actualizaciones: "Ver más"', () => {
  const stubHeight = (h: number) =>
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(h)
  afterEach(() => vi.restoreAllMocks())

  it('una actualización corta no ofrece "Ver más"', async () => {
    await setup({ comments: [comment('a')] })
    stubHeight(100)
    render(<Comments cardId="k1" />)
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument()
  })

  it('una larga se recorta y se expande y contrae', async () => {
    const user = await setup({ comments: [comment('a')] })
    stubHeight(900)
    render(<Comments cardId="k1" />)
    const more = screen.getByRole('button', { name: /Ver más/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(screen.getByRole('button', { name: /Ver más/ })).toBeInTheDocument()
  })
})

describe('actualizaciones: cuadro cerrado', () => {
  it('muestra "Escribe una actualización…" y al pulsarlo abre el editor; Cancelar lo cierra', async () => {
    const user = await setup()
    render(<Comments cardId="k1" />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nueva actualización' }))
    expect(await screen.findByRole('textbox', { name: 'Nueva actualización' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('publicar crea la actualización con su autor y vuelve a cerrar el cuadro', async () => {
    const user = await setup()
    render(<Comments cardId="k1" />)
    await user.click(screen.getByRole('button', { name: 'Nueva actualización' }))
    await user.type(
      await screen.findByRole('textbox', { name: 'Nueva actualización' }),
      'Hola equipo',
    )
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(S().comments[0]).toMatchObject({ bodyMd: 'Hola equipo', authorId: ME })
    expect(await screen.findByText('Hola equipo')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nueva actualización' })).not.toBeInTheDocument()
  })
})
