import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { addCard, card, column, dragTo, openFirstBoard } from './helpers'

const detail = (page: Page) => page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
const side = (page: Page) => page.getByRole('complementary', { name: 'Tableros' })

async function createLabel(dialog: Locator, name: string) {
  await dialog
    .getByRole('button', { name: /Agregar etiqueta|\+ Etiqueta|\+ Crear etiqueta/ })
    .first()
    .click()
  const form = dialog.getByRole('form', { name: 'Nueva etiqueta' })
  if (!(await form.isVisible()))
    await dialog.getByRole('button', { name: '+ Crear etiqueta' }).click()
  await form.getByLabel('Nombre de la etiqueta').fill(name)
  await form.getByRole('button', { name: 'Crear etiqueta' }).click()
  await expect(dialog.getByRole('button', { name: `Quitar etiqueta ${name}` })).toBeVisible()
}

test('un subtablero se crea con una etiqueta, se ve sangrado y mueve las tarjetas del padre', async ({
  page,
}) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'De Coppel')
  await addCard(page, 'Por hacer', 'De otro')
  await card(column(page, 'Por hacer'), 'De Coppel').click()
  await createLabel(detail(page), 'Coppel')
  await page.keyboard.press('Escape')

  // crear el subtablero
  await page.getByRole('button', { name: 'Crear subtablero' }).click()
  const dlg = page.getByRole('dialog', { name: 'Crear subtablero' })
  await expect(dlg.getByRole('radio', { name: 'Etiqueta Coppel' })).toBeChecked()
  await dlg.getByRole('button', { name: 'Crear subtablero' }).click()

  // está dentro del subtablero: mismas columnas, solo la tarjeta etiquetada
  await expect(page.getByRole('heading', { level: 1, name: 'Coppel' })).toBeVisible()
  await expect(column(page, 'Por hacer')).toBeVisible()
  await expect(column(page, 'En curso')).toBeVisible()
  await expect(card(column(page, 'Por hacer'), 'De Coppel')).toBeVisible()
  await expect(card(column(page, 'Por hacer'), 'De otro')).toHaveCount(0)
  // las columnas se editan en el padre
  await expect(page.getByRole('button', { name: /Agregar columna/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mover columna Por hacer' })).toHaveCount(0)

  // en la barra lateral aparece sangrado bajo su padre
  const list = side(page).getByRole('list', { name: 'Subtableros de Mi tablero' })
  await expect(list.getByRole('button', { name: /^Coppel/ })).toBeVisible()
  const parentBox = (await side(page)
    .getByRole('button', { name: /^Mi tablero/ })
    .first()
    .boundingBox())!
  const childBox = (await list.getByRole('button', { name: /^Coppel/ }).boundingBox())!
  expect(childBox.x).toBeGreaterThan(parentBox.x + 15)

  // mover la tarjeta aquí la mueve también en el tablero padre
  await dragTo(page, card(column(page, 'Por hacer'), 'De Coppel'), column(page, 'En curso'))
  await expect(card(column(page, 'En curso'), 'De Coppel')).toBeVisible()
  await expect(page.getByText(/Soltaste el elemento/)).toBeAttached()
  await page.waitForTimeout(500)
  await side(page)
    .getByRole('button', { name: /^Mi tablero/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
  await expect(card(column(page, 'En curso'), 'De Coppel')).toBeVisible()
  await expect(card(column(page, 'Por hacer'), 'De otro')).toBeVisible()
})

test('las subetiquetas solo existen en el subtablero y ahí no se ven las generales', async ({
  page,
}) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'Tarea')
  await card(column(page, 'Por hacer'), 'Tarea').click()
  await createLabel(detail(page), 'Coppel')
  await createLabel(detail(page), 'General')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Crear subtablero' }).click()
  await page
    .getByRole('dialog', { name: 'Crear subtablero' })
    .getByRole('radio', { name: 'Etiqueta Coppel' })
    .check()
  await page
    .getByRole('dialog', { name: 'Crear subtablero' })
    .getByRole('button', { name: 'Crear subtablero' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Coppel' })).toBeVisible()

  // en el subtablero: su etiqueta (fija) y sus subetiquetas; las generales no aparecen
  await expect(card(column(page, 'Por hacer'), 'Tarea').getByText('General')).toHaveCount(0)
  await card(column(page, 'Por hacer'), 'Tarea').click()
  await expect(detail(page).getByRole('button', { name: 'Quitar etiqueta General' })).toHaveCount(0)
  await createLabel(detail(page), 'Urgente')
  await expect(detail(page).getByRole('button', { name: 'Quitar etiqueta Coppel' })).toHaveCount(0) // la que vincula no se quita
  await expect(detail(page).getByRole('checkbox', { name: 'Etiqueta General' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(card(column(page, 'Por hacer'), 'Tarea').getByText('Urgente')).toBeVisible()

  // en el tablero principal no se ve ni se ofrece la subetiqueta
  await side(page)
    .getByRole('button', { name: /^Mi tablero/ })
    .first()
    .click()
  await expect(card(column(page, 'Por hacer'), 'Tarea').getByText('General')).toBeVisible()
  await expect(card(column(page, 'Por hacer'), 'Tarea').getByText('Urgente')).toHaveCount(0)
  await card(column(page, 'Por hacer'), 'Tarea').click()
  await expect(detail(page).getByRole('button', { name: 'Quitar etiqueta Urgente' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('subtablero accesible', async ({ page }) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'Tarea')
  await card(column(page, 'Por hacer'), 'Tarea').click()
  await createLabel(detail(page), 'Coppel')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Crear subtablero' }).click()
  const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  // Las animaciones cortas de entrada: axe mide el contraste cuando ya terminaron.
  const settle = () =>
    page.evaluate(() =>
      Promise.allSettled(document.getAnimations().map((a) => a.finished)).then(() => true),
    )
  await settle()
  const scan = async () =>
    (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    )
  expect(await scan()).toEqual([])
  await page
    .getByRole('dialog', { name: 'Crear subtablero' })
    .getByRole('button', { name: 'Crear subtablero' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Coppel' })).toBeVisible()
  await settle()
  expect(await scan()).toEqual([])
})
