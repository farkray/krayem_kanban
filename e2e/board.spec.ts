import { expect, test } from '@playwright/test'
import { addCard, card as cardLoc, column, dragTo, openFirstBoard, waitForStored } from './helpers'

test.describe('tablero', () => {
  test('primer uso: tablero con 3 columnas y límite de 5', async ({ page }) => {
    await openFirstBoard(page)
    for (const name of ['Por hacer', 'En curso', 'Listo']) {
      await expect(column(page, name)).toContainText('0 tarjetas')
    }
    const add = page.getByRole('button', { name: /Agregar columna/ })
    await expect(add).toContainText('3 de 5 columnas')
    for (const n of ['Revisión', 'Archivo']) {
      await add.click()
      await page.getByLabel('Nombre de la columna').fill(n)
      await page.keyboard.press('Enter')
    }
    await expect(add).toBeDisabled()
    await expect(add).toContainText('5 de 5 columnas')
  })

  test('crea tarjetas, persisten al recargar y se renombra la columna', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Banner importador')
    await addCard(page, 'Por hacer', 'Presentación IBERO')
    await expect(column(page, 'Por hacer')).toContainText('2 tarjetas')

    await column(page, 'Por hacer').getByRole('button', { name: 'Por hacer', exact: true }).click()
    await page.getByLabel('Nombre de la columna').fill('Pendiente')
    await page.keyboard.press('Enter')
    await waitForStored(page, 'columns', 'Pendiente') // la escritura local es asíncrona

    await page.reload()
    await expect(column(page, 'Pendiente')).toContainText('2 tarjetas')
    await expect(page.getByText('Banner importador')).toBeVisible()
  })

  test('arrastrar una tarjeta a otra columna con el mouse', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Mover con mouse')
    const card = cardLoc(column(page, 'Por hacer'), 'Mover con mouse')
    await dragTo(
      page,
      card,
      column(page, 'En curso').getByRole('button', { name: 'Agregar tarjeta' }),
    )
    await expect(column(page, 'En curso')).toContainText('1 tarjeta')
    await expect(column(page, 'Por hacer')).toContainText('0 tarjetas')
  })

  test('mover una tarjeta con el teclado (Espacio + flechas)', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Mover con teclado')
    await addCard(page, 'Por hacer', 'Otra')
    const card = cardLoc(column(page, 'Por hacer'), 'Mover con teclado')
    await card.focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(150) // dnd-kit activa el arrastre en el siguiente frame
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    const titles = await column(page, 'Por hacer').locator('article').allInnerTexts()
    expect(titles[0]).toContain('Otra')
    expect(titles[1]).toContain('Mover con teclado')
  })

  test('detalle: fechas, lista de tareas y comentario con Markdown', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Tarea completa')
    await cardLoc(page, 'Tarea completa').click()
    const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

    await dialog.getByRole('button', { name: /Agregar fechas/ }).click()
    await dialog.getByLabel('Inicio').fill('2026-11-10')
    await dialog.getByLabel('Final').fill('2026-11-12')

    await dialog.getByRole('button', { name: /Agregar lista de tareas/ }).click()
    await dialog.getByLabel('Nuevo ítem de la lista').fill('uno')
    await page.keyboard.press('Enter')
    await dialog.getByLabel('Nuevo ítem de la lista').fill('dos')
    await page.keyboard.press('Enter')
    await dialog.getByRole('checkbox', { name: 'Completar: uno' }).check()
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')

    await dialog.getByLabel('Comentario', { exact: true }).fill('Hablar con **diseño**')
    await dialog.getByRole('button', { name: 'Comentar' }).click()
    await expect(dialog.locator('strong', { hasText: 'diseño' })).toBeVisible()

    await page.keyboard.press('Escape')
    const card = cardLoc(page, 'Tarea completa')
    await expect(card).toContainText('10 nov → 12 nov')
    await expect(card).toContainText('1/2')
  })

  test('búsqueda global con "/" y sin acentos', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Presentación IBERO')
    await page.getByRole('button', { name: 'Inicio' }).click()
    await page.keyboard.press('/')
    await page.keyboard.type('presentacion')
    await page.getByRole('option', { name: /Presentación IBERO/ }).click()
    await expect(page.getByRole('dialog', { name: 'Detalle de la tarjeta' })).toBeVisible()
  })

  test('eliminar una tarjeta y deshacer', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Efímera')
    await cardLoc(page, 'Efímera').click()
    await page.getByRole('button', { name: 'Eliminar tarjeta' }).click()
    await expect(page.getByText('Efímera')).toHaveCount(1) // solo en el aviso
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(cardLoc(page, 'Efímera')).toBeVisible()
  })
})
