import { expect, test } from '@playwright/test'
import { addCard, card, column } from './helpers'

test('los tableros se reordenan con el teclado y el orden se conserva', async ({ page }) => {
  await page.goto('/')
  for (const name of ['Segundo', 'Tercero']) {
    await page.goto('/')
    await page.getByRole('main').getByRole('button', { name: 'Nuevo tablero' }).click()
    await page.getByRole('textbox', { name: 'Nombre del tablero' }).fill(name)
    await page.keyboard.press('Enter')
    await expect(
      page
        .getByRole('complementary', { name: 'Tableros' })
        .getByRole('button', { name: new RegExp(`^${name}`) }),
    ).toBeVisible()
  }
  await page.goto('/')
  const names = () => page.getByRole('main').locator('[class*="name"]').allTextContents()
  const before = (await names()).filter((n) => n !== 'Nuevo tablero')
  expect(before.slice(-2)).toEqual(['Segundo', 'Tercero'])

  const grip = page.getByRole('main').getByRole('button', { name: 'Mover tablero Tercero' })
  await grip.focus()
  await page.keyboard.press('Space')
  await expect(grip).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')

  await expect
    .poll(async () => (await names()).filter((n) => n !== 'Nuevo tablero').slice(-2))
    .toEqual(['Tercero', 'Segundo'])
  await page.reload()
  const after = (await names()).filter((n) => n !== 'Nuevo tablero')
  expect(after.slice(-2)).toEqual(['Tercero', 'Segundo'])
})

test('el orden también se cambia desde la barra lateral', async ({ page }) => {
  await page.goto('/')
  for (const name of ['Segundo', 'Tercero']) {
    await page.goto('/')
    await page.getByRole('main').getByRole('button', { name: 'Nuevo tablero' }).click()
    await page.getByRole('textbox', { name: 'Nombre del tablero' }).fill(name)
    await page.keyboard.press('Enter')
    await expect(
      page
        .getByRole('complementary', { name: 'Tableros' })
        .getByRole('button', { name: new RegExp(`^${name}`) }),
    ).toBeVisible()
  }
  await page.goto('/')
  const side = page.getByRole('complementary', { name: 'Tableros' })
  const names = () =>
    side
      .getByRole('list', { name: 'Mis tableros' })
      .locator('li [class*="itemTitle"]')
      .allTextContents()
  expect(await names()).toEqual(['Mi tablero', 'Segundo', 'Tercero'])
  const grip = side.getByRole('button', { name: 'Mover tablero Tercero' })
  await grip.focus()
  await page.keyboard.press('Space')
  await expect(grip).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')
  await expect.poll(names).toEqual(['Mi tablero', 'Tercero', 'Segundo'])
})

test('una tarjeta se mueve a otro tablero y columna', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('main').getByRole('button', { name: 'Nuevo tablero' }).click()
  await page.getByRole('textbox', { name: 'Nombre del tablero' }).fill('Destino')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('complementary', { name: 'Tableros' }).getByRole('button', { name: /^Destino/ }),
  ).toBeVisible()
  await page.goto('/')
  await page
    .getByRole('main')
    .getByRole('button', { name: /^Mi tablero/ })
    .click()
  await addCard(page, 'Por hacer', 'Viajera')
  await card(column(page, 'Por hacer'), 'Viajera').click()
  const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dialog.getByRole('button', { name: 'Mover a otro tablero…' }).click()
  await dialog.getByRole('combobox', { name: 'Tablero' }).selectOption({ label: 'Destino' })
  await dialog.getByRole('combobox', { name: 'Columna' }).last().selectOption({ label: 'En curso' })
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click()
  await expect(page.getByText(/Tarjeta movida a “Destino” · En curso/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card(column(page, 'Por hacer'), 'Viajera')).toHaveCount(0)
  await page
    .getByRole('complementary', { name: 'Tableros' })
    .getByRole('button', { name: /^Destino/ })
    .click()
  await expect(card(column(page, 'En curso'), 'Viajera')).toBeVisible()
})
