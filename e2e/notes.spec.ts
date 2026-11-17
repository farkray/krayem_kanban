import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { addCard, card, column, openFirstBoard } from './helpers'

test.describe('notas del tablero', () => {
  test('el botón abre y cierra el panel; las notas con enlaces persisten al recargar', async ({
    page,
  }) => {
    await openFirstBoard(page)
    const toggle = page.getByRole('button', { name: 'Notas', exact: true })
    const panel = page.getByRole('complementary', { name: 'Notas del tablero' })
    await expect(panel).toHaveCount(0)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(panel).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // el panel no tapa las columnas en pantalla ancha: conviven
    await expect(column(page, 'Por hacer')).toBeVisible()

    await panel.getByRole('button', { name: 'Escribir notas' }).click()
    await panel
      .getByRole('textbox', { name: /Notas del tablero/ })
      .fill(
        'Carpeta del cliente: https://drive.google.com/drive/folders/abc123\n\n- Contrato\n- Brief',
      )
    await panel.getByRole('button', { name: 'Guardar' }).click()
    const link = panel.getByRole('link', { name: /drive.google.com/ })
    await expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc123')
    await expect(panel.getByRole('listitem')).toHaveCount(2)

    // se recuerda abierto y la nota está guardada
    await page.waitForTimeout(400)
    await page.reload()
    await page
      .getByRole('button', { name: /Mi tablero/ })
      .first()
      .click()
    await expect(page.getByRole('complementary', { name: 'Notas del tablero' })).toBeVisible()
    await expect(page.getByRole('link', { name: /drive.google.com/ })).toBeVisible()

    // cerrar con la X y con el botón
    await page.getByRole('button', { name: 'Cerrar notas' }).click()
    await expect(page.getByRole('complementary', { name: 'Notas del tablero' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Notas del tablero' })).toHaveCount(0)
  })

  test('cada tablero tiene sus propias notas', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    await page.getByRole('button', { name: 'Escribir notas' }).click()
    await page.getByRole('textbox', { name: /Notas del tablero/ }).fill('Notas del primero')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Notas del primero')).toBeVisible()

    await page.getByRole('button', { name: 'Nuevo tablero' }).click()
    await page.getByLabel('Nombre del tablero').fill('Segundo')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Segundo' })).toBeVisible()
    await expect(page.getByText('Notas del primero')).toHaveCount(0)
    await expect(page.getByText(/Aún no hay notas/)).toBeVisible()
  })

  test('en teléfono el panel se abre encima del tablero y se puede cerrar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Tarea')
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Notas del tablero' })
    await expect(panel).toBeVisible()
    const box = (await panel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await panel.getByRole('button', { name: 'Cerrar notas' }).click()
    await expect(card(page, 'Tarea')).toBeVisible()
  })

  test('accesibilidad del panel (AA) con y sin notas', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const scan = async () =>
      (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)
    expect(await scan()).toEqual([])
    await page.getByRole('button', { name: 'Escribir notas' }).click()
    expect(await scan()).toEqual([])
    await page
      .getByRole('textbox', { name: /Notas del tablero/ })
      .fill('Un enlace https://example.com')
    await page.getByRole('button', { name: 'Guardar' }).click()
    expect(await scan()).toEqual([])
  })
})
