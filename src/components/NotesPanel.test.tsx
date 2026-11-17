import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetStore, useStore } from '../store/store'
import { NotesPanel } from './NotesPanel'

let boardId = ''

beforeEach(async () => {
  await resetStore()
  boardId = useStore.getState().createBoard('Proyecto')!
})

describe('NotesPanel', () => {
  it('vacío: invita a escribir; al guardar muestra la nota con enlaces clicables', async () => {
    const user = userEvent.setup()
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    expect(screen.getByText(/Aún no hay notas/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Escribir notas' }))
    await user.type(
      screen.getByRole('textbox', { name: /Notas del tablero/ }),
      'Carpeta: https://drive.google.com/drive/folders/abc y **ojo**',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const link = screen.getByRole('link', { name: /drive.google.com/ })
    expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('ojo').tagName).toBe('STRONG')
    expect(useStore.getState().notes[0].bodyMd).toContain('drive.google.com')
  })

  it('se puede editar y cancelar sin perder lo guardado', async () => {
    const user = userEvent.setup()
    useStore.getState().saveNote(boardId, 'original')
    render(<NotesPanel boardId={boardId} canEdit onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Editar notas' }))
    const area = screen.getByRole('textbox', { name: /Notas del tablero/ })
    expect(area).toHaveValue('original')
    await user.clear(area)
    await user.type(area, 'cambio')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('original')).toBeInTheDocument()
    expect(useStore.getState().notes[0].bodyMd).toBe('original')
  })

  it('solo lectura: ve las notas pero no hay botón para editar', () => {
    useStore.getState().saveNote(boardId, 'solo para leer')
    render(<NotesPanel boardId={boardId} canEdit={false} onClose={() => {}} />)
    expect(screen.getByText('solo para leer')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Editar notas|Escribir notas/ }),
    ).not.toBeInTheDocument()
  })

  it('el botón cerrar avisa', async () => {
    const onClose = vi.fn()
    render(<NotesPanel boardId={boardId} canEdit onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar notas' }))
    expect(onClose).toHaveBeenCalled()
  })
})
