import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { addCard, card, column, openFirstBoard, waitForStored } from './helpers'

const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  )

const detail = (page: Page) => page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

/** Crea una etiqueta nueva desde el detalle abierto (queda puesta en esa tarjeta). */
async function createLabel(dialog: Locator, name: string, color: string) {
  const open = dialog.getByRole('button', {
    name: /Agregar etiqueta|\+ Etiqueta|\+ Crear etiqueta/,
  })
  await open.first().click()
  const form = dialog.getByRole('form', { name: 'Nueva etiqueta' })
  if (!(await form.isVisible()))
    await dialog.getByRole('button', { name: '+ Crear etiqueta' }).click()
  await form.getByLabel('Nombre de la etiqueta').fill(name)
  await form.getByRole('radio', { name: color }).click()
  await form.getByRole('button', { name: 'Crear etiqueta' }).click()
  await expect(dialog.getByRole('button', { name: `Quitar etiqueta ${name}` })).toBeVisible()
}

const chipOf = (scope: Locator | Page, name: string) =>
  scope.locator('[data-color]', { hasText: name }).first()

test.describe('etiquetas por tablero', () => {
  test('cada tablero tiene sus etiquetas: las de uno no aparecen en otro', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Tarea del tablero 1')
    await card(page, 'Tarea del tablero 1').click()
    await createLabel(detail(page), 'Coppel', 'Azul')
    await page.keyboard.press('Escape')

    // segundo tablero: no hereda "Coppel"; puede crear su propia "Coppel" (otro color)
    await page.getByRole('button', { name: 'Nuevo tablero' }).click()
    await page.getByLabel('Nombre del tablero').fill('Tablero 2')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Tablero 2' })).toBeVisible()
    await addCard(page, 'Por hacer', 'Tarea del tablero 2')
    await card(page, 'Tarea del tablero 2').click()
    const d = detail(page)
    await d.getByRole('button', { name: /Agregar etiqueta/ }).click()
    await expect(d.getByRole('checkbox', { name: /Coppel/ })).toHaveCount(0)
    await expect(d.getByText('Crea tu primera etiqueta')).toBeVisible()
    const form = d.getByRole('form', { name: 'Nueva etiqueta' })
    await form.getByLabel('Nombre de la etiqueta').fill('Coppel')
    await form.getByRole('radio', { name: 'Rojo' }).click()
    await form.getByRole('button', { name: 'Crear etiqueta' }).click()
    await expect(d.getByRole('button', { name: 'Quitar etiqueta Coppel' })).toBeVisible()
    await page.keyboard.press('Escape')

    // cada tarjeta conserva la etiqueta de su tablero (azul en el 1, roja en el 2)
    await expect(chipOf(card(page, 'Tarea del tablero 2'), 'Coppel')).toHaveAttribute(
      'data-color',
      'red',
    )
    await page.getByRole('button', { name: /Mi tablero/ }).click()
    await expect(chipOf(card(page, 'Tarea del tablero 1'), 'Coppel')).toHaveAttribute(
      'data-color',
      'blue',
    )
  })
})

test.describe('etiquetas', () => {
  test('crear "Coppel" en azul, verla en la tarjeta y que persista', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Banner importador')
    await card(page, 'Banner importador').click()
    await createLabel(detail(page), 'Coppel', 'Azul')
    await page.keyboard.press('Escape')

    const chip = chipOf(card(column(page, 'Por hacer'), 'Banner importador'), 'Coppel')
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('data-color', 'blue')

    await waitForStored(page, 'cards', 'Banner importador')
    await page.reload()
    await expect(chipOf(card(page, 'Banner importador'), 'Coppel')).toHaveAttribute(
      'data-color',
      'blue',
    )
  })

  test('reutilizar, quitar, editar color y eliminar con deshacer', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Uno')
    await addCard(page, 'Por hacer', 'Dos')
    await card(page, 'Uno').click()
    await createLabel(detail(page), 'Coppel', 'Azul')
    await page.keyboard.press('Escape')

    await card(page, 'Dos').click()
    const d = detail(page)
    await d.getByRole('button', { name: /Agregar etiqueta/ }).click()
    await d.getByRole('checkbox', { name: 'Etiqueta Coppel' }).check()
    await expect(d.getByRole('button', { name: 'Quitar etiqueta Coppel' })).toBeVisible()

    await d.getByRole('button', { name: 'Editar etiqueta Coppel' }).click()
    await d
      .getByRole('form', { name: 'Editar etiqueta' })
      .getByRole('radio', { name: 'Naranja' })
      .click()
    await d.getByRole('button', { name: 'Guardar' }).click()
    await expect(chipOf(d, 'Coppel')).toHaveAttribute('data-color', 'orange')

    await d.getByRole('button', { name: 'Editar etiqueta Coppel' }).click()
    await d.getByRole('button', { name: 'Eliminar etiqueta' }).click()
    await expect(d.getByText('Coppel')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(chipOf(d, 'Coppel')).toBeVisible()
  })

  test('filtrar el tablero por etiqueta y limpiar el filtro', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'De Coppel')
    await addCard(page, 'En curso', 'De otra empresa')
    await addCard(page, 'Listo', 'Sin etiqueta')
    await card(page, 'De Coppel').click()
    await createLabel(detail(page), 'Coppel', 'Azul')
    await page.keyboard.press('Escape')
    await card(page, 'De otra empresa').click()
    await createLabel(detail(page), 'Liverpool', 'Rosa')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Filtros' }).click()
    await page.getByRole('checkbox', { name: 'Mostrar solo Coppel' }).check()
    await expect(card(page, 'De Coppel')).toBeVisible()
    await expect(card(page, 'De otra empresa')).toHaveCount(0)
    await expect(card(page, 'Sin etiqueta')).toHaveCount(0)
    await expect(column(page, 'Por hacer')).toContainText('1 tarjeta')
    await expect(column(page, 'En curso')).toContainText('0 de 1 tarjeta')
    await expect(page.getByText('Filtrando por:')).toBeVisible()

    // Varias etiquetas = cualquiera de ellas
    await page.getByRole('checkbox', { name: 'Mostrar solo Liverpool' }).check()
    await expect(card(page, 'De otra empresa')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Limpiar filtro' }).first().click()
    await expect(card(page, 'Sin etiqueta')).toBeVisible()
    await expect(page.getByText('Filtrando por:')).toHaveCount(0)
  })

  test('buscar una tarjeta por el nombre de su etiqueta', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Pendiente')
    await card(page, 'Pendiente').click()
    await createLabel(detail(page), 'Coppel', 'Azul')
    await page.keyboard.press('Escape')
    await page.getByRole('combobox', { name: 'Buscar' }).fill('coppel')
    await expect(page.getByRole('option', { name: /Pendiente.*Etiqueta: Coppel/ })).toBeVisible()
  })
})

const ALL_COLORS = ['Azul', 'Verde', 'Rojo', 'Naranja', 'Amarillo', 'Morado', 'Rosa', 'Gris']

/** Una tarjeta por cada trío de colores: así axe revisa el contraste de los 8 en el tablero. */
async function seedAllColors(page: Page) {
  await openFirstBoard(page)
  const groups = [ALL_COLORS.slice(0, 3), ALL_COLORS.slice(3, 6), ALL_COLORS.slice(6)]
  for (const [i, colors] of groups.entries()) {
    const title = `Tarjeta ${i + 1}`
    await addCard(page, 'Por hacer', title)
    await card(page, title).click()
    for (const c of colors) await createLabel(detail(page), `Etiq ${c}`, c)
    await page.keyboard.press('Escape')
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`contraste de las 8 etiquetas (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    test('tablero y panel del detalle sin violaciones AA', async ({ page }) => {
      await seedAllColors(page)
      expect(await violations(page)).toEqual([])

      await card(page, 'Tarjeta 1').click()
      await detail(page).getByRole('button', { name: '+ Etiqueta' }).click()
      expect(await violations(page)).toEqual([])
      await detail(page).getByRole('button', { name: '+ Crear etiqueta' }).click()
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Filtros' }).click()
      await page.getByRole('checkbox', { name: 'Mostrar solo Etiq Azul' }).check()
      expect(await violations(page)).toEqual([])
    })
  })
}

test.describe('etiquetas en teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('crear y filtrar con el dedo; objetivos de 44 px y sin desbordar', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Móvil')
    await card(page, 'Móvil').tap()
    const d = detail(page)
    await createLabel(d, 'Coppel', 'Azul')
    for (const name of [/Editar etiqueta Coppel/, /Crear etiqueta/]) {
      const b = (await d.getByRole('button', { name }).first().boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    await d.getByRole('button', { name: 'Ocultar' }).tap()
    await page.keyboard.press('Escape')

    const filter = page.getByRole('button', { name: 'Filtros' })
    expect((await filter.boundingBox())!.width).toBeGreaterThanOrEqual(44)
    await filter.tap()
    const panel = (await page.getByRole('group', { name: 'Filtros' }).boundingBox())!
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(390)
    await page.getByRole('checkbox', { name: 'Mostrar solo Coppel' }).check()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    expect(await violations(page)).toEqual([])
  })
})
