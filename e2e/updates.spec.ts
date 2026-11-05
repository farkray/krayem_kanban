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

    // el mismo dato aparece como comentario en la pestaña principal
    await d.getByRole('tab', { name: 'Detalles' }).click()
    await expect(d.locator('strong', { hasText: 'importante' })).toBeVisible()
  })

  test('la descripción se ve renderizada y se edita con "Editar"', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con descripción')
    await card(page, 'Con descripción').click()
    const d = detail(page)
    await d
      .getByLabel('Descripción')
      .fill('## Cotización enviada\n\nVer [hoja](https://example.com)')
    await d.getByLabel('Título de la tarjeta').click() // sale del campo: se guarda y se renderiza
    await expect(d.getByRole('heading', { name: 'Cotización enviada' })).toBeVisible()
    await expect(d.getByRole('link', { name: 'hoja' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    await d.getByRole('button', { name: 'Editar' }).click()
    await expect(d.getByLabel('Descripción')).toBeFocused()
    await d.getByRole('button', { name: 'Cita' }).first().click() // la barra no cierra el editor
    await expect(d.getByLabel('Descripción')).toBeVisible()
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
