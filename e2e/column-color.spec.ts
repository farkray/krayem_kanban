import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { column, openFirstBoard } from './helpers'

test('el encabezado de columna cambia de color con una paleta de 6 tonos claros', async ({
  page,
}) => {
  await openFirstBoard(page)
  const col = column(page, 'Por hacer')
  const header = col.locator('header')
  await col.getByRole('button', { name: /Tipo de columna/ }).click()
  const group = col.getByRole('radiogroup', { name: 'Color del encabezado' })
  // sin color + 6 tonos
  await expect(group.getByRole('radio')).toHaveCount(7)
  await group.getByRole('radio', { name: 'Menta' }).click()
  await expect(header).toHaveAttribute('data-color', 'mint')
  await expect(group.getByRole('radio', { name: 'Menta' })).toHaveAttribute('aria-checked', 'true')
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).not.toBe('rgba(0, 0, 0, 0)')

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations).toEqual([])

  // persiste al recargar
  await page.reload()
  await page.getByRole('button', { name: /Mi tablero/ }).first().click()
  await expect(column(page, 'Por hacer').locator('header')).toHaveAttribute('data-color', 'mint')

  await column(page, 'Por hacer').getByRole('button', { name: /Tipo de columna/ }).click()
  await page.getByRole('radio', { name: 'Sin color' }).click()
  await expect(column(page, 'Por hacer').locator('header')).not.toHaveAttribute('data-color', /.+/)
})
