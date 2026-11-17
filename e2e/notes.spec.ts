import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addCard, card, openFirstBoard } from './helpers'

const panelOf = (page: Page) => page.getByRole('complementary', { name: 'Notas del tablero' })

/** Crea una nota con "Tomar una nota…", escribe el texto y vuelve a modo tarjetas con "Listo". */
async function addNote(page: Page, text: string) {
  const panel = panelOf(page)
  await panel.getByRole('button', { name: 'Tomar una nota…' }).click()
  await panel.getByRole('textbox', { name: 'Nota' }).click()
  await page.keyboard.type(text)
  await panel.getByRole('button', { name: 'Listo' }).click()
}

test.describe('notas del tablero (tarjetas)', () => {
  test('el botón abre y cierra el panel y se recuerda abierto', async ({ page }) => {
    await openFirstBoard(page)
    const toggle = page.getByRole('button', { name: 'Notas', exact: true })
    await expect(panelOf(page)).toHaveCount(0)
    await toggle.click()
    await expect(panelOf(page)).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.reload()
    await page
      .getByRole('button', { name: /Mi tablero/ })
      .first()
      .click()
    await expect(panelOf(page)).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar notas' }).click()
    await expect(panelOf(page)).toHaveCount(0)
  })

  test('atajos de teclado: Ctrl/Cmd+B negrita, Ctrl/Cmd+I cursiva; al terminar queda la tarjeta con formato', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const panel = panelOf(page)
    await panel.getByRole('button', { name: 'Tomar una nota…' }).click()
    const editor = panel.getByRole('textbox', { name: 'Nota' })
    await editor.click()
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type('importante')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type(' y ')
    await page.keyboard.press('ControlOrMeta+i')
    await page.keyboard.type('matiz')
    // ya con formato dentro del editor
    await expect(editor.locator('strong')).toHaveText('importante')
    await expect(editor.locator('em')).toHaveText('matiz')
    // Escape (o "Listo") vuelve al modo tarjetas
    await page.keyboard.press('Escape')
    await expect(panel.getByRole('textbox', { name: 'Nota' })).toHaveCount(0)
    const cardEl = panel.getByRole('article')
    await expect(cardEl.locator('strong')).toHaveText('importante')
    await expect(cardEl.locator('em')).toHaveText('matiz')
  })

  test('enlaces (Drive) clicables, doble clic para editar, y persisten al recargar', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    await addNote(page, 'Carpeta: https://drive.google.com/drive/folders/abc123 ')
    const panel = panelOf(page)
    await expect(panel.getByRole('link', { name: /drive.google.com/ })).toHaveAttribute(
      'href',
      'https://drive.google.com/drive/folders/abc123',
    )
    // doble clic sobre el texto: modo edición; Listo: vuelve a la tarjeta
    await panel.getByRole('article').getByText('Carpeta:').dblclick()
    await expect(panel.getByRole('textbox', { name: 'Nota' })).toBeVisible()
    await panel.getByRole('button', { name: 'Listo' }).click()
    await expect(panel.getByRole('textbox', { name: 'Nota' })).toHaveCount(0)

    await page.waitForTimeout(500)
    await page.reload()
    await page
      .getByRole('button', { name: /Mi tablero/ })
      .first()
      .click()
    await expect(page.getByRole('link', { name: /drive.google.com/ })).toBeVisible()
  })

  test('fijar: la primera que se fija queda arriba y así sucesivamente; desfijar la baja', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const panel = panelOf(page)
    for (const t of ['Uno', 'Dos', 'Tres']) await addNote(page, t)
    const order = async () =>
      (await panel.getByRole('article').allInnerTexts()).map((x) => x.split('\n')[0])
    expect(await order()).toEqual(['Tres', 'Dos', 'Uno']) // la más nueva arriba
    const pin = (t: string) =>
      panel
        .getByRole('article')
        .filter({ hasText: t })
        .getByRole('button', { name: 'Fijar nota' })
        .click()
    await pin('Uno')
    await pin('Tres')
    await expect(panel.getByRole('heading', { name: 'Fijadas' })).toBeVisible()
    expect(await order()).toEqual(['Uno', 'Tres', 'Dos'])
    await panel
      .getByRole('article')
      .filter({ hasText: 'Uno' })
      .getByRole('button', { name: 'Quitar de fijadas' })
      .click()
    expect(await order()).toEqual(['Tres', 'Dos', 'Uno'])
  })

  test('eliminar con "Deshacer"; una nota vacía no se conserva', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const panel = panelOf(page)
    await addNote(page, 'Temporal')
    await panel.getByRole('button', { name: 'Eliminar nota' }).click()
    await expect(panel.getByRole('article')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(panel.getByRole('article')).toHaveCount(1)
    // abrir una nota nueva y salir sin escribir: no queda tarjeta vacía
    await panel.getByRole('button', { name: 'Tomar una nota…' }).click()
    await page.keyboard.press('Escape')
    await expect(panel.getByRole('article')).toHaveCount(1)
  })

  test('cada tablero tiene sus propias notas', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    await addNote(page, 'Notas del primero')
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
    const box = (await panelOf(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await panelOf(page).getByRole('button', { name: 'Cerrar notas' }).click()
    await expect(card(page, 'Tarea')).toBeVisible()
  })

  test('accesibilidad (AA): vacío, editando y con tarjetas fijadas', async ({ page }) => {
    await openFirstBoard(page)
    await page.getByRole('button', { name: 'Notas', exact: true }).click()
    const scan = async () =>
      (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)
    expect(await scan()).toEqual([])
    await panelOf(page).getByRole('button', { name: 'Tomar una nota…' }).click()
    await page.keyboard.type('Un enlace https://example.com') // el cursor ya está en la nota
    expect(await scan()).toEqual([])
    await panelOf(page).getByRole('button', { name: 'Listo' }).click()
    await panelOf(page).getByRole('button', { name: 'Fijar nota' }).click()
    await addNote(page, 'Otra nota')
    expect(await scan()).toEqual([])
  })
})
