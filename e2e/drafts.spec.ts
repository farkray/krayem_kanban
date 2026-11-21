import { expect, test, type Page } from '@playwright/test'
import { addCard, card, openFirstBoard } from './helpers'

const detail = (page: Page) => page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

async function openCard(page: Page, title: string) {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', title)
  await card(page, title).click()
  return detail(page)
}

const editorOf = (d: ReturnType<typeof detail>) => d.getByRole('textbox', { name: 'Nueva actualización' })

test.describe('una actualización escrita no se pierde', () => {
  test('"Actualizar y cerrar": lo pendiente se publica al pulsar Listo', async ({ page }) => {
    const d = await openCard(page, 'Con texto pendiente')
    await editorOf(d).click()
    await page.keyboard.type('Quedó listo para revisión')
    await expect(d.getByText('Hay una actualización sin enviar')).toBeVisible()
    await d.getByRole('button', { name: 'Actualizar y cerrar' }).click()
    await expect(d).toHaveCount(0)

    // la actualización quedó publicada y el contador la cuenta
    await card(page, 'Con texto pendiente').click()
    await expect(d.getByRole('tab', { name: /Actualizaciones \/ 1/ })).toBeVisible()
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()
    await expect(d.getByRole('list', { name: 'Actualizaciones' })).toContainText(
      'Quedó listo para revisión',
    )
  })

  test('Esc conserva el borrador y al reabrir se recupera (sin publicar)', async ({ page }) => {
    const d = await openCard(page, 'Borrador con Esc')
    await editorOf(d).click()
    await page.keyboard.type('Esto aún no está listo')
    await page.keyboard.press('Escape')
    await expect(d).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: /Borrador guardado/ })).toBeVisible()
    // la tarjeta lo indica
    await expect(card(page, 'Borrador con Esc')).toContainText('Borrador')

    await card(page, 'Borrador con Esc').click()
    await expect(editorOf(d)).toContainText('Esto aún no está listo')
    await expect(d.getByText('Borrador recuperado')).toBeVisible()
    await expect(d.getByRole('tab', { name: /Actualizaciones.*borrador/ })).toBeVisible()
  })

  test('el borrador sobrevive a recargar la página y a cambiar de pestaña', async ({ page }) => {
    const d = await openCard(page, 'Borrador y recarga')
    await editorOf(d).click()
    await page.keyboard.type('Texto que no debe perderse')
    // cambiar de pestaña y volver
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()
    await expect(editorOf(d)).toContainText('Texto que no debe perderse') // el cuadro se abre solo con el borrador
    await d.getByRole('tab', { name: 'Detalles' }).click()
    await expect(editorOf(d)).toContainText('Texto que no debe perderse')

    // recargar (se espera a que el borrador llegue a la base local)
    await page.waitForTimeout(600)
    await page.reload()
    await card(page, 'Borrador y recarga').click()
    await expect(editorOf(d)).toContainText('Texto que no debe perderse')
  })

  test('Actualizar y Cancelar vacían el borrador', async ({ page }) => {
    const d = await openCard(page, 'Borrador descartado')
    await editorOf(d).click()
    await page.keyboard.type('Se envía')
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await expect(d.getByText('Hay una actualización sin enviar')).toHaveCount(0)
    await expect(editorOf(d)).not.toContainText('Se envía')
  })
})
