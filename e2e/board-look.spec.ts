import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openFirstBoard } from './helpers'

const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  )

const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Cambiar color e icono del tablero' })

test('el color y el icono del tablero se eligen, se ven en la barra lateral y se conservan', async ({
  page,
}) => {
  await openFirstBoard(page)
  await trigger(page).click()
  const panel = page.getByRole('group', { name: 'Aspecto del tablero' })
  await expect(panel.getByRole('radio')).toHaveCount(20) // 10 colores + 10 iconos
  expect(await violations(page)).toEqual([])

  await panel.getByRole('radio', { name: 'Morado', exact: true }).click()
  await panel.getByRole('radio', { name: 'Estudio', exact: true }).click()
  await expect(panel.getByRole('radio', { name: 'Morado', exact: true })).toBeChecked()
  expect(await violations(page)).toEqual([])

  // la barra lateral muestra el color elegido (el icono es decorativo: el nombre va al lado)
  const sidebarTile = page
    .getByRole('button', { name: /Mi tablero/ })
    .locator('span')
    .first()
  await expect
    .poll(() => sidebarTile.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toContain('rgb(124, 58, 237)')

  await page.keyboard.press('Escape')
  // espera a que el cambio llegue a IndexedDB antes de recargar
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open('kanban')
            req.onsuccess = () => {
              const all = req.result
                .transaction('boards', 'readonly')
                .objectStore('boards')
                .getAll()
              all.onsuccess = () => {
                resolve((all.result as { color?: string }[]).some((b) => b.color === 'morado'))
                req.result.close()
              }
            }
            req.onerror = () => resolve(false)
          }),
      ),
    )
    .toBe(true)
  await page.reload()
  await expect(
    page
      .getByRole('heading', { level: 1, name: 'Mi tablero' })
      .or(page.getByRole('heading', { level: 1, name: 'Mis tableros' })),
  ).toBeVisible()
  await page
    .getByRole('button', { name: /Mi tablero/ })
    .first()
    .click()
  await trigger(page).click()
  await expect(page.getByRole('radio', { name: 'Morado', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Estudio', exact: true })).toBeChecked()
})

test('con el teclado: Tab llega al selector y las flechas eligen', async ({ page }) => {
  await openFirstBoard(page)
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  const petroleo = page.getByRole('radio', { name: 'Petróleo', exact: true })
  await expect(petroleo).toBeChecked()
  await petroleo.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Cielo', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(trigger(page)).toBeFocused()
})
