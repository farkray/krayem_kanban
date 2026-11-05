import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addCard, card, column, openFirstBoard } from './helpers'

const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  )

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

/** Espera a que terminen las animaciones de entrada del elemento (hoja / panel). */
const settled = (l: ReturnType<Page['locator']>) =>
  l.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => true))

const sizeOf = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!

test.describe('teléfono (390×844, táctil)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('el tablero se ve de entrada: sin panel abierto y sin desbordar', async ({ page }) => {
    await openFirstBoard(page)
    await expect(page.locator('aside')).toHaveCount(0)
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect((await sizeOf(page.getByRole('heading', { level: 1 }))).y).toBeLessThan(120)
    // La siguiente columna se asoma: se entiende que el tablero se desplaza.
    const first = await sizeOf(column(page, 'Por hacer'))
    const second = await sizeOf(column(page, 'En curso'))
    expect(first.width).toBeLessThanOrEqual(390 * 0.86 + 1)
    expect(second.x).toBeLessThan(390)
  })

  test('menú: abre el panel y se cierra con la pantalla oscura, Escape y al elegir un tablero', async ({
    page,
  }) => {
    await openFirstBoard(page)
    const menu = page.getByRole('button', { name: 'Mostrar barra lateral' })
    await menu.tap()
    const aside = page.locator('aside')
    await expect(aside).toBeVisible()
    await settled(aside)
    expect((await sizeOf(aside)).width).toBeLessThanOrEqual(320.5)
    await page.mouse.click(385, 400) // sobre la pantalla oscura, fuera del panel
    await expect(aside).toHaveCount(0)

    await menu.tap()
    await page.keyboard.press('Escape')
    await expect(aside).toHaveCount(0)

    await menu.tap()
    await aside.getByRole('button', { name: /Mi tablero/ }).tap()
    await expect(aside).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
  })

  test('barra superior compacta: buscar ocupa el espacio; Ayuda (sin función) se oculta y Filtros sigue', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await expect(page.getByRole('button', { name: 'Ayuda' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filtros' })).toBeVisible() // ya filtra por etiqueta
    const search = page.getByRole('combobox', { name: 'Buscar' })
    expect((await sizeOf(search)).width).toBeGreaterThan(150)
    await expect(search).toHaveAttribute('placeholder', 'Buscar')
    for (const name of ['Mostrar barra lateral', 'Inicio']) {
      const b = await sizeOf(page.getByRole('button', { name }))
      expect(b.width).toBeGreaterThanOrEqual(44)
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    // El resultado de búsqueda ocupa el ancho de la pantalla, sin salirse.
    await addCard(page, 'Por hacer', 'Presentación')
    await search.fill('present')
    const panel = await sizeOf(page.getByRole('listbox', { name: 'Resultados' }))
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(390)
  })

  test('controles de columna siempre visibles (no dependen de hover) y de 44 px', async ({
    page,
  }) => {
    await openFirstBoard(page)
    const col = column(page, 'Por hacer')
    for (const name of [/Mover columna/, /Eliminar columna/]) {
      const b = col.getByRole('button', { name })
      await expect(b).toBeVisible()
      expect(await b.evaluate((e) => getComputedStyle(e).opacity)).toBe('1')
      const box = await sizeOf(b)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('texto de 16 px en tarjetas y campos (iOS no hace zoom al enfocar)', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Texto legible')
    expect(
      await card(page, 'Texto legible')
        .locator('h4')
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px')
    expect(
      await page
        .getByRole('combobox', { name: 'Buscar' })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px')
  })

  test('detalle de tarjeta como hoja inferior: ocupa el ancho, "Eliminar" siempre a la vista', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con hoja')
    await card(page, 'Con hoja').tap()
    const dlg = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
    await expect(dlg).toBeVisible()
    await settled(dlg)
    const box = await sizeOf(dlg)
    expect(box.width).toBe(390)
    expect(Math.round(box.y + box.height)).toBe(844) // pegada al borde inferior
    const del = dlg.getByRole('button', { name: 'Eliminar tarjeta' })
    const d = await sizeOf(del)
    expect(d.y + d.height).toBeLessThanOrEqual(844) // visible sin desplazar
    expect(d.height).toBeGreaterThanOrEqual(44)
    expect(await dlg.getByLabel('Descripción').evaluate((e) => getComputedStyle(e).fontSize)).toBe(
      '16px',
    )
    expect(await violations(page)).toEqual([])
  })

  test('accesibilidad con el panel abierto y en el tablero', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Una')
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Mostrar barra lateral' }).tap()
    await settled(page.locator('aside'))
    expect(await violations(page)).toEqual([])
  })

  test('las columnas encajan al desplazar, salvo mientras se arrastra', async ({ page }) => {
    await openFirstBoard(page)
    const snap = () =>
      page.locator('main div').evaluateAll((els) => {
        const el = els.find((e) => getComputedStyle(e).scrollSnapType !== 'none')
        return el ? getComputedStyle(el).scrollSnapType : 'none'
      })
    expect(await snap()).toContain('x')
  })

  test('mantener pulsado y arrastrar reordena una tarjeta (táctil real sintetizado)', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'T1')
    await addCard(page, 'Por hacer', 'T2')
    const cdp = await page.context().newCDPSession(page)
    const from = await sizeOf(card(column(page, 'Por hacer'), 'T1'))
    const to = await sizeOf(card(column(page, 'Por hacer'), 'T2'))
    const x = from.x + from.width / 2
    const touch = (type: string, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y: y! }],
      })
    await touch('touchStart', from.y + from.height / 2)
    await page.waitForTimeout(350)
    for (let i = 1; i <= 10; i++) {
      await touch(
        'touchMove',
        from.y + from.height / 2 + ((to.y + to.height - 6 - (from.y + from.height / 2)) * i) / 10,
      )
      await page.waitForTimeout(16)
    }
    await touch('touchEnd')
    await expect
      .poll(() => column(page, 'Por hacer').locator('article h4').allInnerTexts())
      .toEqual(['T2', 'T1'])
  })
})

test.describe('tableta vertical (820×1180)', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })

  test('la barra lateral es un panel (deja ver el tablero) y funciona', async ({ page }) => {
    await openFirstBoard(page)
    await expect(page.locator('aside')).toHaveCount(0)
    expect(await noHorizontalOverflow(page)).toBe(true)
    // Con el ancho completo caben ~2 columnas en vez de 1,5.
    expect((await sizeOf(column(page, 'En curso'))).x + 320).toBeLessThanOrEqual(820)
    await page.getByRole('button', { name: 'Mostrar barra lateral' }).tap()
    await expect(page.locator('aside')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })
})

test.describe('teléfono apaisado (844×390)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('el tablero y el detalle caben en la altura disponible', async ({ page }) => {
    await openFirstBoard(page)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await addCard(page, 'Por hacer', 'Apaisado')
    await card(page, 'Apaisado').tap()
    const dlg = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
    await expect(dlg).toBeVisible()
    await settled(dlg)
    const box = await sizeOf(dlg)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(390.5) // tolerancia de subpíxel
    await expect(dlg.getByRole('button', { name: 'Eliminar tarjeta' })).toBeInViewport()
  })
})

test.describe('escritorio y cambio de tamaño', () => {
  test('a 1280 la barra lateral es fija y no hay botón de menú; al angostar pasa a panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openFirstBoard(page)
    await expect(page.locator('aside')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mostrar barra lateral' })).toHaveCount(0)
    await page.setViewportSize({ width: 600, height: 800 })
    await expect(page.locator('aside')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mostrar barra lateral' })).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('aside')).toBeVisible()
  })
})
