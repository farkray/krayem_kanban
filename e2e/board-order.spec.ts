import { expect, test } from '@playwright/test'

test('los tableros se reordenan con el teclado y el orden se conserva', async ({ page }) => {
  await page.goto('/')
  for (const name of ['Segundo', 'Tercero']) {
    await page.goto('/')
    await page.getByRole('main').getByRole('button', { name: 'Nuevo tablero' }).click()
    await page.getByRole('textbox', { name: 'Nombre del tablero' }).fill(name)
    await page.keyboard.press('Enter')
  }
  await page.goto('/')
  const names = () => page.getByRole('main').locator('[class*="name"]').allTextContents()
  const before = (await names()).filter((n) => n !== 'Nuevo tablero')
  expect(before.slice(-2)).toEqual(['Segundo', 'Tercero'])

  const grip = page.getByRole('button', { name: 'Mover tablero Tercero' })
  await grip.focus()
  await page.keyboard.press('Space')
  await expect(grip).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  await page.keyboard.press('Space')

  await expect
    .poll(async () => (await names()).filter((n) => n !== 'Nuevo tablero').slice(-2))
    .toEqual(['Tercero', 'Segundo'])
  await page.reload()
  const after = (await names()).filter((n) => n !== 'Nuevo tablero')
  expect(after.slice(-2)).toEqual(['Tercero', 'Segundo'])
})
