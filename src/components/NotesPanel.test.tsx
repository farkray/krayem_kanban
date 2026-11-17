import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetStore, useStore } from '../store/store'
import { NotesPanel } from './NotesPanel'

let boardId = ''
const S = () => useStore.getState()
const live = () => S().notes.filter((n) => !n.deletedAt)

beforeEach(async () => {
  await resetStore()
  boardId = S().createBoard('Proyecto')!
})

describe('NotesPanel (notas como tarjetas)', () => {
  it('"Tomar una nota…" abre el editor; al terminar vuelve a ser tarjeta con enlaces clicables', async () => {
    const user = userEvent.setup()
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    expect(screen.getByText(/Aún no hay notas/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tomar una nota…' }))
    const editor = await screen.findByRole('textbox', { name: 'Nota' })
    await user.click(editor)
    await user.keyboard('Carpeta: https://drive.google.com/drive/folders/abc')
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    // modo tarjetas: ya no hay editor y la nota se ve con su enlace
    expect(screen.queryByRole('textbox', { name: 'Nota' })).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /drive.google.com/ })
    expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc')
    expect(live()).toHaveLength(1)
  })

  it('Escape también termina la edición y una nota vacía no se conserva', async () => {
    const user = userEvent.setup()
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Tomar una nota…' }))
    await user.click(await screen.findByRole('textbox', { name: 'Nota' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Nota' })).not.toBeInTheDocument()
    expect(live()).toHaveLength(0)
    expect(screen.getByText(/Aún no hay notas/)).toBeInTheDocument()
  })

  it('editar en el sitio: abre la nota existente en el editor y "Listo" vuelve a la tarjeta', async () => {
    const user = userEvent.setup()
    S().addNote(boardId, '**importante** original')
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Editar nota' }))
    const editor = await screen.findByRole('textbox', { name: 'Nota' })
    expect(editor).toHaveTextContent('importante original')
    expect(within(editor).getByText('importante').tagName).toBe('STRONG') // el formato se ve ya aplicado
    expect(screen.getByRole('button', { name: 'Negrita' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('textbox', { name: 'Nota' })).not.toBeInTheDocument()
    expect(screen.getByText('importante').tagName).toBe('STRONG')
    expect(live()).toHaveLength(1)
  })

  it('las fijadas van arriba en el orden en que se fijaron, bajo "Fijadas"', async () => {
    const user = userEvent.setup()
    S().addNote(boardId, 'Uno')
    S().addNote(boardId, 'Dos')
    S().addNote(boardId, 'Tres')
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    const titles = () =>
      screen.getAllByRole('article').map((a) => /^(Uno|Dos|Tres)/.exec(a.textContent ?? '')?.[1])
    expect(titles()).toEqual(['Tres', 'Dos', 'Uno']) // sin fijar: la más nueva arriba
    const pin = (text: string) =>
      user.click(
        within(screen.getByText(text).closest('article')!).getByRole('button', {
          name: 'Fijar nota',
        }),
      )
    await pin('Uno')
    await pin('Tres')
    expect(screen.getByRole('heading', { name: 'Fijadas' })).toBeInTheDocument()
    expect(titles()).toEqual(['Uno', 'Tres', 'Dos']) // Uno se fijó primero, luego Tres, luego las demás
    // quitar de fijadas
    await user.click(
      within(screen.getByText('Uno').closest('article')!).getByRole('button', {
        name: 'Quitar de fijadas',
      }),
    )
    expect(titles()).toEqual(['Tres', 'Dos', 'Uno'])
  })

  it('eliminar quita la tarjeta y se puede deshacer', async () => {
    const user = userEvent.setup()
    S().addNote(boardId, 'Borrame')
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Eliminar nota' }))
    expect(screen.queryByText('Borrame')).not.toBeInTheDocument()
    S().toast!.undo!()
    expect(await screen.findByText('Borrame')).toBeInTheDocument()
  })

  it('solo lectura: ve las tarjetas pero no hay crear, editar, fijar ni eliminar', () => {
    S().addNote(boardId, 'solo para leer')
    render(<NotesPanel boardId={boardId} canEdit={false} onClose={() => {}} />)
    expect(screen.getByText('solo para leer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar una nota…' })).not.toBeInTheDocument()
    for (const name of ['Editar nota', 'Fijar nota', 'Eliminar nota'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('el botón cerrar avisa', async () => {
    const onClose = vi.fn()
    render(<NotesPanel boardId={boardId} canEdit onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar notas' }))
    expect(onClose).toHaveBeenCalled()
  })
})
