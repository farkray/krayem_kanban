import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageError } from '../lib/image/compress'
import { byPosition } from '../lib/position'
import { resetStore, useStore } from '../store/store'
import { Attachments } from './Attachments'

const compressImage = vi.hoisted(() => vi.fn())
vi.mock('../lib/image/compress', async (orig) => ({
  ...(await orig<typeof import('../lib/image/compress')>()),
  compressImage,
}))

const S = () => useStore.getState()
let cardId: string

beforeEach(async () => {
  await resetStore()
  compressImage.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
  const b = S().createBoard('X')!
  const col = S()
    .columns.filter((c) => c.boardId === b)
    .sort(byPosition)[0]
  cardId = S().addCard(col.id, 'T')!
})

const png = (name = 'foto.png') => new File([new Uint8Array(4000)], name, { type: 'image/png' })
const ok = (over = {}) => ({
  blob: new Blob(['w'], { type: 'image/webp' }),
  mime: 'image/webp',
  width: 1600,
  height: 900,
  sizeOriginal: 4_000_000,
  sizeCompressed: 400_000,
  ...over,
})

function renderIt() {
  const view = () => (
    <Attachments
      cardId={cardId}
      coverId={S().cards.find((c) => c.id === cardId)?.coverAttachmentId}
    />
  )
  const r = render(view())
  return { ...r, rerender: () => r.rerender(view()) }
}

describe('Attachments', () => {
  it('comprime, guarda la imagen y muestra el ahorro', async () => {
    compressImage.mockResolvedValue(ok())
    const user = userEvent.setup()
    renderIt()
    await user.upload(screen.getByLabelText('Seleccionar imágenes'), png())
    expect(compressImage).toHaveBeenCalledOnce()
    await waitFor(() => expect(S().attachments).toHaveLength(1))
    const att = S().attachments[0]
    expect(att).toMatchObject({ name: 'foto.png', mime: 'image/webp', width: 1600, cardId })
    expect(await screen.findByText(/3,8 MB → 390,6 KB \(−90 %\)/)).toBeInTheDocument()
  })

  it('muestra "Comprimiendo…" mientras trabaja', async () => {
    let done!: (v: ReturnType<typeof ok>) => void
    compressImage.mockReturnValue(new Promise((r) => (done = r)))
    const user = userEvent.setup()
    renderIt()
    await user.upload(screen.getByLabelText('Seleccionar imágenes'), png('grande.png'))
    expect(await screen.findByRole('status')).toHaveTextContent('Comprimiendo grande.png…')
    done(ok())
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('informa el error y no agrega nada', async () => {
    compressImage.mockRejectedValue(new ImageError('La imagen supera el máximo de 15 MB.'))
    const user = userEvent.setup()
    renderIt()
    await user.upload(screen.getByLabelText('Seleccionar imágenes'), png('enorme.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'enorme.png: La imagen supera el máximo de 15 MB.',
    )
    expect(S().attachments).toHaveLength(0)
  })

  it('respeta el máximo de 10 imágenes', async () => {
    compressImage.mockResolvedValue(ok())
    for (let i = 0; i < 10; i++) {
      S().addAttachment(
        cardId,
        {
          name: `i${i}`,
          mime: 'image/webp',
          sizeOriginal: 1,
          sizeCompressed: 1,
          width: 1,
          height: 1,
        },
        new Blob(['x']),
      )
    }
    const user = userEvent.setup()
    renderIt()
    await user.upload(screen.getByLabelText('Seleccionar imágenes'), png())
    expect(await screen.findByRole('alert')).toHaveTextContent('Máximo 10 imágenes')
    expect(compressImage).not.toHaveBeenCalled()
  })

  it('portada: asignar, quitar; y eliminar con deshacer', async () => {
    compressImage.mockResolvedValue(ok())
    const user = userEvent.setup()
    const { rerender } = renderIt()
    await user.upload(screen.getByLabelText('Seleccionar imágenes'), png())
    const list = await screen.findByRole('list', { name: 'Imágenes' })
    await user.click(within(list).getByRole('button', { name: 'Usar de portada' }))
    expect(S().cards.find((c) => c.id === cardId)?.coverAttachmentId).toBe(S().attachments[0].id)
    rerender()
    await user.click(within(list).getByRole('button', { name: 'Quitar portada' }))
    expect(S().cards.find((c) => c.id === cardId)?.coverAttachmentId).toBeUndefined()

    await user.click(within(list).getByRole('button', { name: 'Eliminar' }))
    expect(S().attachments[0].deletedAt).toBeTruthy()
    S().toast!.undo!()
    expect(S().attachments[0].deletedAt).toBeUndefined()
  })
})
