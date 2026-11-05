import { expect, test, type Locator, type Page } from '@playwright/test'
import { addCard, card, column, openFirstBoard } from './helpers'

/** Arrastra con el mouse hasta un punto absoluto (dnd-kit necesita movimiento real). */
async function dragToPoint(page: Page, from: Locator, x: number, y: number) {
  const a = (await from.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 })
  await page.mouse.move(x, y, { steps: 20 })
  // Tras soltar, dnd-kit anima la tarjeta ~250 ms: se espera para no empezar otro arrastre a medias.
  return {
    drop: async () => {
      await page.mouse.up()
      await page.waitForTimeout(350)
    },
  }
}

const titles = (page: Page, col: string) => column(page, col).locator('article h4').allInnerTexts()

async function seed(page: Page) {
  await openFirstBoard(page)
  for (const [col, names] of [
    ['Por hacer', ['A1', 'A2']],
    ['En curso', ['B1', 'B2']],
    ['Listo', ['C1', 'C2']],
  ] as const) {
    for (const n of names) await addCard(page, col, n)
  }
}

const box = async (l: Locator) => (await l.boundingBox())!

test.describe('arrastrar tarjetas (todas las columnas)', () => {
  test('al espacio vacío de la columna del medio (debajo de sus tarjetas)', async ({ page }) => {
    await seed(page)
    const mid = await box(column(page, 'En curso'))
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A1'),
      mid.x + mid.width / 2,
      mid.y + mid.height - 60,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['B1', 'B2', 'A1'])
    expect(await titles(page, 'Por hacer')).toEqual(['A2'])
  })

  test('sobre una tarjeta de la columna del medio: se inserta ahí', async ({ page }) => {
    await seed(page)
    const target = await box(card(column(page, 'En curso'), 'B1'))
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A1'),
      target.x + target.width / 2,
      target.y + 8,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['A1', 'B1', 'B2'])
  })

  test('sobre el encabezado de la columna del medio', async ({ page }) => {
    await seed(page)
    const head = await box(column(page, 'En curso').locator('header'))
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A1'),
      head.x + head.width / 2,
      head.y + head.height / 2,
    )
    await d.drop()
    await expect.poll(async () => (await titles(page, 'En curso')).includes('A1')).toBe(true)
  })

  test('desde la última columna hacia la del medio, y de la del medio a ambos lados', async ({
    page,
  }) => {
    await seed(page)
    let mid = await box(column(page, 'En curso'))
    let d = await dragToPoint(
      page,
      card(column(page, 'Listo'), 'C1'),
      mid.x + mid.width / 2,
      mid.y + mid.height - 60,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toContain('C1')

    const last = await box(column(page, 'Listo'))
    d = await dragToPoint(
      page,
      card(column(page, 'En curso'), 'B1'),
      last.x + last.width / 2,
      last.y + last.height - 60,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'Listo')).toContain('B1')

    const first = await box(column(page, 'Por hacer'))
    d = await dragToPoint(
      page,
      card(column(page, 'En curso'), 'B2'),
      first.x + first.width / 2,
      first.y + first.height - 60,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'Por hacer')).toContain('B2')
  })

  test('a una columna vacía del medio', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Sola')
    const mid = await box(column(page, 'En curso'))
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'Sola'),
      mid.x + mid.width / 2,
      mid.y + 200,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['Sola'])
  })

  test('reordenar dentro de la misma columna, hacia arriba y hacia abajo', async ({ page }) => {
    await seed(page)
    let t = await box(card(column(page, 'En curso'), 'B2'))
    let d = await dragToPoint(
      page,
      card(column(page, 'En curso'), 'B1'),
      t.x + t.width / 2,
      t.y + t.height - 6,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['B2', 'B1'])
    t = await box(card(column(page, 'En curso'), 'B2'))
    d = await dragToPoint(page, card(column(page, 'En curso'), 'B1'), t.x + t.width / 2, t.y + 6)
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['B1', 'B2'])
  })

  test('Escape cancela el arrastre y la tarjeta vuelve a su sitio', async ({ page }) => {
    await seed(page)
    const mid = await box(column(page, 'En curso'))
    await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A1'),
      mid.x + mid.width / 2,
      mid.y + 100,
    )
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await titles(page, 'Por hacer')).toEqual(['A1', 'A2'])
    expect(await titles(page, 'En curso')).toEqual(['B1', 'B2'])
  })

  test('soltar fuera de cualquier columna no mueve nada', async ({ page }) => {
    await seed(page)
    const d = await dragToPoint(page, card(column(page, 'Por hacer'), 'A1'), 5, 5)
    await d.drop()
    expect(await titles(page, 'Por hacer')).toEqual(['A1', 'A2'])
  })

  test('un clic sin mover abre el detalle; arrastrar no lo abre', async ({ page }) => {
    await seed(page)
    await card(column(page, 'Por hacer'), 'A1').click()
    await expect(page.getByRole('dialog', { name: 'Detalle de la tarjeta' })).toBeVisible()
    await page.keyboard.press('Escape')

    const mid = await box(column(page, 'En curso'))
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A2'),
      mid.x + mid.width / 2,
      mid.y + mid.height - 60,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toContain('A2')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

// Regresión: con una ventana alta la columna del medio es muy alta y, soltando en su zona vacía,
// la tarjeta caía en otra columna (solo funcionaba arrastrar a la primera y a la última).
test.describe('ventana grande (columnas altas)', () => {
  test.use({ viewport: { width: 1548, height: 1100 } })

  test('soltar en medio del espacio vacío de la columna del medio', async ({ page }) => {
    await seed(page)
    const mid = await box(column(page, 'En curso'))
    expect(mid.height).toBeGreaterThan(900)
    const d = await dragToPoint(
      page,
      card(column(page, 'Por hacer'), 'A1'),
      mid.x + mid.width / 2,
      mid.y + mid.height * 0.65,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toEqual(['B1', 'B2', 'A1'])
  })

  test('también desde la última y a la primera columna', async ({ page }) => {
    await seed(page)
    const first = await box(column(page, 'Por hacer'))
    let d = await dragToPoint(
      page,
      card(column(page, 'Listo'), 'C1'),
      first.x + first.width / 2,
      first.y + first.height * 0.65,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'Por hacer')).toContain('C1')
    const mid = await box(column(page, 'En curso'))
    d = await dragToPoint(
      page,
      card(column(page, 'Listo'), 'C2'),
      mid.x + mid.width / 2,
      mid.y + mid.height * 0.4,
    )
    await d.drop()
    await expect.poll(() => titles(page, 'En curso')).toContain('C2')
  })
})

// Táctil: pulsación larga para arrastrar (un deslizamiento corto sigue siendo scroll).
test.describe('táctil', () => {
  test.use({ hasTouch: true })

  test('mantener pulsado y arrastrar mueve la tarjeta a la columna del medio', async ({ page }) => {
    await seed(page)
    const cdp = await page.context().newCDPSession(page)
    const from = await box(card(column(page, 'Por hacer'), 'A1'))
    const mid = await box(column(page, 'En curso'))
    const sx = from.x + from.width / 2
    const sy = from.y + from.height / 2
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y! }],
      })
    await touch('touchStart', sx, sy)
    await page.waitForTimeout(350) // pulsación larga
    for (let i = 1; i <= 12; i++) {
      await touch(
        'touchMove',
        sx + ((mid.x + mid.width / 2 - sx) * i) / 12,
        sy + ((mid.y + mid.height - 80 - sy) * i) / 12,
      )
      await page.waitForTimeout(16)
    }
    await touch('touchEnd')
    await expect.poll(() => titles(page, 'En curso')).toContain('A1')
  })
})
