import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addCard, openFirstBoard } from './helpers'

const scan = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
    .violations

const summary = (v: Awaited<ReturnType<typeof scan>>) =>
  v.map(
    (x) =>
      `${x.id}: ${x.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  )

test.describe('accesibilidad (axe, WCAG 2.1 AA)', () => {
  test('inicio', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
    expect(summary(await scan(page))).toEqual([])
  })

  test('tablero con tarjetas', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Una tarjeta')
    await addCard(page, 'En curso', 'Otra tarjeta')
    expect(summary(await scan(page))).toEqual([])
  })

  test('detalle de tarjeta', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Detalle')
    await page.locator('article', { hasText: 'Detalle' }).click()
    const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
    await dialog.getByRole('button', { name: /Agregar lista de tareas/ }).click()
    await dialog.getByLabel('Nuevo ítem de la lista').fill('ítem')
    await page.keyboard.press('Enter')
    await dialog.getByLabel('Nueva actualización').fill('hola')
    await dialog.getByRole('button', { name: 'Actualizar', exact: true }).click()
    expect(summary(await scan(page))).toEqual([])
  })

  test('búsqueda abierta y barra lateral oculta', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('combobox', { name: 'Buscar' }).fill('zzz')
    expect(summary(await scan(page))).toEqual([])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Ocultar barra lateral' }).click()
    expect(summary(await scan(page))).toEqual([])
  })

  test('el modal atrapa el foco con Escape y lo devuelve a la tarjeta', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Foco')
    const card = page.locator('article', { hasText: 'Foco' })
    await card.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Detalle de la tarjeta' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(card).toBeFocused()
  })
})

// Modo oscuro: mismo estándar AA que el claro (los tokens se recomponen, no se invierten)
test.describe('accesibilidad en modo oscuro (axe, WCAG 2.1 AA)', () => {
  test.use({ colorScheme: 'dark' })

  test('inicio, tablero y detalle de tarjeta', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
    expect(summary(await scan(page))).toEqual([])

    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Oscura')
    await addCard(page, 'En curso', 'Otra')
    expect(summary(await scan(page))).toEqual([])

    await page.locator('article', { hasText: 'Oscura' }).click()
    const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
    await dialog.getByRole('button', { name: /Agregar lista de tareas/ }).click()
    await dialog.getByLabel('Nuevo ítem de la lista').fill('ítem')
    await page.keyboard.press('Enter')
    await dialog.getByLabel('Nueva actualización').fill('hola **mundo**')
    await dialog.getByRole('button', { name: 'Actualizar', exact: true }).click()
    expect(summary(await scan(page))).toEqual([])
  })

  test('los colores cambian de verdad (fondo oscuro, texto claro)', async ({ page }) => {
    await openFirstBoard(page)
    const [bg, fg] = await page.evaluate(() => [
      getComputedStyle(document.body).backgroundImage,
      getComputedStyle(document.body).color,
    ])
    expect(bg).toContain('rgb(11, 18, 21)')
    expect(fg).toBe('rgb(230, 240, 241)')
  })
})
