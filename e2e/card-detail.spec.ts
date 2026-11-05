import { expect, test } from '@playwright/test'
import { addCard, card, column, openFirstBoard, waitForStored } from './helpers'

const detail = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

test.describe('detalle de tarjeta: acción principal y eliminar', () => {
  test('"Listo" guarda lo pendiente y cierra', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Título original')
    await card(page, 'Título original').click()
    const d = detail(page)
    // Se escribe sin salir del campo: "Listo" debe guardar igualmente.
    await d.getByLabel('Título de la tarjeta').fill('Título nuevo')
    await d.getByLabel('Descripción').fill('Descripción escrita justo antes de cerrar')
    await d.getByRole('button', { name: 'Listo' }).click()
    await expect(d).toHaveCount(0)
    await expect(card(column(page, 'Por hacer'), 'Título nuevo')).toBeVisible()
    await waitForStored(page, 'cards', 'Título nuevo')
    await page.reload()
    await card(page, 'Título nuevo').click()
    await expect(detail(page).getByLabel('Descripción')).toHaveValue(
      'Descripción escrita justo antes de cerrar',
    )
  })

  test('el pie solo tiene "Listo" y el aviso de autoguardado; Eliminar vive dentro del scroll', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'A eliminar')
    await card(page, 'A eliminar').click()
    const d = detail(page)
    const footer = d.locator('footer')
    await expect(footer.getByRole('button', { name: 'Listo' })).toBeVisible()
    await expect(footer).toContainText('Los cambios se guardan solos')
    await expect(footer.getByRole('button', { name: 'Eliminar tarjeta' })).toHaveCount(0)

    const del = d.getByRole('button', { name: 'Eliminar tarjeta' })
    // Está dentro del contenedor desplazable (no en el pie fijo).
    expect(
      await del.evaluate((el) => {
        let n: HTMLElement | null = el.parentElement
        while (n) {
          if (['auto', 'scroll'].includes(getComputedStyle(n).overflowY)) return true
          n = n.parentElement
        }
        return false
      }),
    ).toBe(true)

    await del.scrollIntoViewIfNeeded()
    await del.click()
    await expect(d).toHaveCount(0)
    await expect(card(page, 'A eliminar')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(card(page, 'A eliminar')).toBeVisible()
  })

  test('Escape sigue cerrando y conservando lo escrito', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con Escape')
    await card(page, 'Con Escape').click()
    await detail(page).getByLabel('Descripción').fill('Se guarda al salir')
    await page.keyboard.press('Escape')
    await expect(detail(page)).toHaveCount(0)
    await card(page, 'Con Escape').click()
    await expect(detail(page).getByLabel('Descripción')).toHaveValue('Se guarda al salir')
  })
})

test.describe('agarres para mover', () => {
  test('el agarre de la columna se ve sin apuntarlo y es un objetivo cómodo', async ({ page }) => {
    await openFirstBoard(page)
    const grip = column(page, 'Por hacer').getByRole('button', { name: /Mover columna Por hacer/ })
    await expect(grip).toBeVisible()
    const opacity = Number(await grip.evaluate((e) => getComputedStyle(e).opacity))
    expect(opacity).toBeGreaterThanOrEqual(0.6)
    const box = (await grip.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(24)
    expect(box.height).toBeGreaterThanOrEqual(32)
    // No tapa el título: el agarre queda a la derecha del texto
    const title = (await column(page, 'Por hacer')
      .getByRole('button', { name: 'Por hacer', exact: true })
      .boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(title.x + title.width)
    await expect(grip).toHaveAttribute('title', 'Arrastra para mover la columna')
  })

  test('la tarjeta muestra su agarre al apuntarla', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con agarre')
    const c = card(column(page, 'Por hacer'), 'Con agarre')
    const handle = c.locator('[title="Arrastra para mover"]')
    await page.mouse.move(2, 2) // el puntero queda sobre la tarjeta recién creada: se aparta
    await expect
      .poll(async () => Number(await handle.evaluate((e) => getComputedStyle(e).opacity)))
      .toBe(0)
    await c.hover()
    await expect
      .poll(async () => Number(await handle.evaluate((e) => getComputedStyle(e).opacity)))
      .toBe(1)
  })

  test('el agarre de los ítems del checklist se ve', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con lista')
    await card(page, 'Con lista').click()
    const d = detail(page)
    await d.getByRole('button', { name: /Agregar lista de tareas/ }).click()
    await d.getByLabel('Nuevo ítem de la lista').fill('Primero')
    await page.keyboard.press('Enter')
    const grip = d.getByRole('button', { name: /Mover ítem Primero/ })
    expect(Number(await grip.evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThanOrEqual(
      0.5,
    )
  })
})

test.describe('detalle en teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('"Listo" ocupa el ancho del pie y Eliminar se alcanza desplazando', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Móvil')
    await card(page, 'Móvil').tap()
    const d = detail(page)
    await expect(d).toBeVisible()
    const done = (await d.getByRole('button', { name: 'Listo' }).boundingBox())!
    expect(done.width).toBeGreaterThan(300)
    expect(done.height).toBeGreaterThanOrEqual(48)
    const del = d.getByRole('button', { name: 'Eliminar tarjeta' })
    await del.scrollIntoViewIfNeeded()
    await expect(del).toBeInViewport()
    await d.getByRole('button', { name: 'Listo' }).tap()
    await expect(d).toHaveCount(0)
  })
})
