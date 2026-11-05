import { expect, test, type Page } from '@playwright/test'
import { addCard, card, column, dragTo, openFirstBoard, setKind } from './helpers'
import AxeBuilder from '@axe-core/playwright'

const titles = (page: Page, col: string) => column(page, col).locator('article h4').allInnerTexts()

test.describe('tipo de columna y límite de tarjetas', () => {
  test('"En curso" es Doing: admite 2 y bloquea la tercera', async ({ page }) => {
    await openFirstBoard(page)
    const doing = column(page, 'En curso')
    await expect(doing.getByText('Doing 0/2')).toBeVisible()
    await addCard(page, 'En curso', 'Uno')
    await addCard(page, 'En curso', 'Dos')
    await expect(doing.getByText('Doing 2/2')).toBeVisible()
    await expect(doing.getByRole('button', { name: /Límite alcanzado/ })).toBeDisabled()
  })

  test('arrastrar a una columna llena no mueve la tarjeta y avisa', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'En curso', 'Uno')
    await addCard(page, 'En curso', 'Dos')
    await addCard(page, 'Por hacer', 'Extra')
    await dragTo(
      page,
      card(column(page, 'Por hacer'), 'Extra'),
      card(column(page, 'En curso'), 'Uno'),
    )
    await expect(page.getByRole('status').filter({ hasText: /límite/ })).toBeVisible()
    expect(await titles(page, 'Por hacer')).toEqual(['Extra'])
    expect(await titles(page, 'En curso')).toEqual(['Uno', 'Dos'])
    // sí se puede sacar una y luego meter la otra
    await dragTo(page, card(column(page, 'En curso'), 'Uno'), column(page, 'Listo'))
    await expect.poll(() => titles(page, 'Listo')).toEqual(['Uno'])
  })

  test('cambiar el tipo con radios: Next admite 4 y Estándar quita el límite', async ({ page }) => {
    await openFirstBoard(page)
    await setKind(page, 'Por hacer', 'Next')
    const col = column(page, 'Por hacer')
    await expect(col.getByText('Next 0/4')).toBeVisible()
    for (const n of ['1', '2', '3', '4']) await addCard(page, 'Por hacer', n)
    await expect(col.getByRole('button', { name: /Límite alcanzado/ })).toBeDisabled()
    // no deja bajar a Doing (2) con 4 tarjetas
    await col.getByRole('button', { name: /^Tipo de columna/ }).click()
    await col.getByRole('radio', { name: /^Doing/ }).click()
    await expect(page.getByRole('status').filter({ hasText: /Mueve algunas/ })).toBeVisible()
    await expect(col.getByRole('radio', { name: /^Next/ })).toBeChecked()
    await col.getByRole('radio', { name: /^Estándar/ }).click()
    await expect(col.getByText(/Next \d\/4/)).toHaveCount(0)
    await addCard(page, 'Por hacer', '5')
  })

  test('el tipo se conserva al recargar', async ({ page }) => {
    await openFirstBoard(page)
    await setKind(page, 'Listo', 'Next')
    await expect(column(page, 'Listo').getByText('Next 0/4')).toBeVisible()
    await page.waitForTimeout(300)
    await page.reload()
    await page
      .getByRole('button', { name: /Mi tablero/ })
      .first()
      .click()
    await expect(column(page, 'Listo').getByText('Next 0/4')).toBeVisible()
  })

  test('accesibilidad del menú y de la columna llena (AA)', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'En curso', 'Uno')
    await addCard(page, 'En curso', 'Dos')
    await column(page, 'Por hacer')
      .getByRole('button', { name: /^Tipo de columna/ })
      .click()
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})

test.describe('papelera en la tarjeta', () => {
  test('borra varias tarjetas terminadas sin abrirlas y se puede deshacer', async ({ page }) => {
    await openFirstBoard(page)
    for (const n of ['T1', 'T2', 'T3']) await addCard(page, 'Listo', n)
    const done = column(page, 'Listo')
    await card(done, 'T1').hover()
    await done.getByRole('button', { name: 'Eliminar tarjeta T1' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0) // no abrió el detalle
    await done.getByRole('button', { name: 'Eliminar tarjeta T2' }).click()
    expect(await titles(page, 'Listo')).toEqual(['T3'])
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect.poll(() => titles(page, 'Listo')).toContain('T2')
  })

  test('con teclado: Tab llega a la papelera y Enter elimina', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Solo')
    await page.getByRole('button', { name: 'Eliminar tarjeta Solo' }).focus()
    await page.keyboard.press('Enter')
    await expect(card(column(page, 'Por hacer'), 'Solo')).toHaveCount(0)
  })
})
