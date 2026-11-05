import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { addCard, card, openFirstBoard } from './helpers'

const detail = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

test.describe('actualizaciones y editor con formato', () => {
  test('pestaña Actualizaciones: formato con la barra, Actualizar y feed renderizado', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con feed')
    await card(page, 'Con feed').click()
    const d = detail(page)
    await expect(d.getByRole('tab', { name: 'Detalles' })).toHaveAttribute('aria-selected', 'true')
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()

    const box = d.getByLabel('Nueva actualización')
    await box.fill('importante')
    await box.selectText()
    await d.getByRole('button', { name: 'Negrita' }).click()
    await expect(box).toHaveValue('**importante**')
    await box.evaluate((el: HTMLTextAreaElement) =>
      el.setSelectionRange(el.value.length, el.value.length),
    )
    await box.press('Enter')
    await d.getByRole('button', { name: 'Lista con viñetas' }).click()
    await box.pressSequentially('uno')
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()

    const feed = d.getByRole('list', { name: 'Actualizaciones' })
    await expect(feed.locator('strong', { hasText: 'importante' })).toBeVisible()
    await expect(feed.locator('li li', { hasText: 'uno' })).toBeVisible()
    await expect(d.getByRole('tab', { name: 'Actualizaciones / 1' })).toBeVisible()
  })

  test('desde Detalles se envía una actualización que aparece renderizada en el feed', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Desde detalles')
    await card(page, 'Desde detalles').click()
    const d = detail(page)
    await d
      .getByLabel('Nueva actualización')
      .fill('## Cotización enviada\n\nVer [hoja](https://example.com)')
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await expect(d.getByRole('status')).toContainText('Actualizaciones')
    await expect(d.getByLabel('Nueva actualización')).toHaveValue('') // el cuadro queda limpio
    await expect(d.getByRole('heading', { name: 'Cotización enviada' })).toHaveCount(0) // el feed no está aquí

    await d.getByRole('tab', { name: 'Actualizaciones / 1' }).click()
    await expect(d.getByRole('heading', { name: 'Cotización enviada' })).toBeVisible()
    await expect(d.getByRole('link', { name: 'hoja' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  test('accesibilidad de la pestaña Actualizaciones (AA)', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'A11y')
    await card(page, 'A11y').click()
    await detail(page)
      .getByRole('tab', { name: /^Actualizaciones/ })
      .click()
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})
