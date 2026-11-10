import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { addCard, card, openFirstBoard } from './helpers'

const detail = (page: Page) => page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

/** Simula Ctrl/Cmd+V con una imagen en el portapapeles (un PNG generado en la página). */
async function pasteImage(editor: Locator, color = '#e11') {
  await editor.evaluate(async (el, fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 120, 80)
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'captura.png', { type: 'image/png' }))
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  }, color)
}

test.describe('actualizaciones y editor visual', () => {
  test('el formato se ve ya renderizado al escribir y en el feed', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con feed')
    await card(page, 'Con feed').click()
    const d = detail(page)
    await expect(d.getByRole('tab', { name: 'Detalles' })).toHaveAttribute('aria-selected', 'true')
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()

    await d.getByRole('button', { name: 'Nueva actualización' }).click() // el cuadro de la pestaña se abre al pulsarlo

    const editor = d.getByRole('textbox', { name: 'Nueva actualización' })
    await editor.click()
    await d.getByRole('button', { name: 'Negrita' }).click()
    await page.keyboard.type('importante')
    await d.getByRole('button', { name: 'Negrita' }).click()
    await page.keyboard.press('Enter')
    await d.getByRole('button', { name: 'Lista con viñetas' }).click()
    await page.keyboard.type('uno')
    // ya renderizado dentro del editor, sin asteriscos ni guiones crudos
    await expect(editor.locator('strong', { hasText: 'importante' })).toBeVisible()
    await expect(editor.locator('li', { hasText: 'uno' })).toBeVisible()
    await expect(editor).not.toContainText('**')
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()

    const feed = d.getByRole('list', { name: 'Actualizaciones' })
    await expect(feed.locator('strong', { hasText: 'importante' })).toBeVisible()
    await expect(feed.locator('li li', { hasText: 'uno' })).toBeVisible()
    await expect(d.getByRole('tab', { name: 'Actualizaciones / 1' })).toBeVisible()
    await expect(editor).toHaveCount(0) // el cuadro vuelve a quedar cerrado
  })

  test('desde Detalles se envía una actualización que aparece renderizada en el feed', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Desde detalles')
    await card(page, 'Desde detalles').click()
    const d = detail(page)
    const editor = d.getByRole('textbox', { name: 'Nueva actualización' })
    await editor.click()
    await page.keyboard.type('## Cotización enviada')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Ver hoja')
    await page.keyboard.press('Shift+ArrowLeft', { delay: 0 })
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
    await d.getByRole('button', { name: 'Enlace' }).click()
    await d.getByLabel('Dirección del enlace').fill('https://example.com')
    await d.getByRole('button', { name: 'Aplicar' }).click()
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await expect(d.getByRole('status')).toContainText('Actualizaciones')
    await expect(d.getByRole('heading', { name: 'Cotización enviada' })).toHaveCount(0)

    await d.getByRole('tab', { name: 'Actualizaciones / 1' }).click()
    await expect(d.getByRole('heading', { name: 'Cotización enviada' })).toBeVisible()
    await expect(d.getByRole('link', { name: /hoja/ })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  test('pegar una imagen (Ctrl/Cmd+V): se ve en el editor, en el feed y tras recargar', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con imagen')
    await card(page, 'Con imagen').click()
    const d = detail(page)
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()
    await d.getByRole('button', { name: 'Nueva actualización' }).click() // el cuadro de la pestaña se abre al pulsarlo
    const editor = d.getByRole('textbox', { name: 'Nueva actualización' })
    await editor.click()
    await page.keyboard.type('Captura:')
    await pasteImage(editor)
    await expect(editor.locator('img')).toBeVisible()
    await d.getByRole('button', { name: 'Actualizar', exact: true }).click()

    const feed = d.getByRole('list', { name: 'Actualizaciones' })
    const img = feed.locator('img')
    await expect(img).toBeVisible()
    expect(await img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0)

    // no aparece en la galería de imágenes de la tarjeta
    await d.getByRole('tab', { name: 'Detalles' }).click()
    await expect(d.getByRole('list', { name: 'Imágenes' })).toHaveCount(0)

    await page.waitForTimeout(400)
    await page.reload()
    await card(page, 'Con imagen').click()
    await detail(page)
      .getByRole('tab', { name: /^Actualizaciones/ })
      .click()
    const again = detail(page).getByRole('list', { name: 'Actualizaciones' }).locator('img')
    await expect(again).toBeVisible()
    expect(await again.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0)
  })

  test('accesibilidad de la pestaña Actualizaciones (AA)', async ({ page }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'A11y')
    await card(page, 'A11y').click()
    await detail(page)
      .getByRole('tab', { name: /^Actualizaciones/ })
      .click()
    await detail(page).getByRole('button', { name: 'Nueva actualización' }).click() // el cuadro de la pestaña se abre al pulsarlo
    const editor = detail(page).getByRole('textbox', { name: 'Nueva actualización' })
    await editor.click()
    await page.keyboard.type('texto de prueba')
    await detail(page).getByRole('button', { name: 'Actualizar', exact: true }).click()
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })

  test('responder, dar "me gusta" y "Ver más" en una actualización larga (sin fallos de accesibilidad)', async ({
    page,
  }) => {
    await openFirstBoard(page)
    await addCard(page, 'Por hacer', 'Con hilo')
    await card(page, 'Con hilo').click()
    const d = detail(page)
    await d.getByRole('tab', { name: /^Actualizaciones/ }).click()

    const post = async (text: string) => {
      await d.getByRole('button', { name: 'Nueva actualización' }).click()
      await d.getByRole('textbox', { name: 'Nueva actualización' }).fill(text)
      await d.getByRole('button', { name: 'Actualizar', exact: true }).click()
    }
    await post('Primera actualización')
    await post(
      Array.from(
        { length: 16 },
        (_, i) => `Párrafo ${i + 1} con bastante texto para ocupar espacio.`,
      ).join('\n\n'),
    )

    // "Ver más" en la larga: recorta, expande y vuelve a contraer
    const more = d.getByRole('button', { name: /Ver más/ })
    await expect(more).toBeVisible()
    await more.click()
    await expect(d.getByText('Párrafo 16')).toBeVisible()
    await d.getByRole('button', { name: 'Ver menos' }).click()
    await expect(d.getByRole('button', { name: /Ver más/ })).toBeVisible()

    // "Me gusta" y respuesta en la primera
    const first = d.getByRole('listitem').filter({ hasText: 'Primera actualización' }).first()
    await first.getByRole('button', { name: 'Me gusta' }).click()
    await expect(first.getByRole('button', { name: 'Me gusta, 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await first.getByRole('button', { name: 'Responder' }).first().click()
    await d.getByRole('textbox', { name: /Responder a/ }).fill('Listo, lo reviso')
    await d.getByRole('button', { name: 'Responder' }).last().click()
    await expect(d.getByRole('list', { name: 'Respuestas' })).toContainText('Listo, lo reviso')
    await expect(d.getByRole('tab', { name: 'Actualizaciones / 2' })).toBeVisible() // no cuenta la respuesta

    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])

    // el "me gusta" y la respuesta se conservan al recargar
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open('kanban')
              req.onsuccess = () => {
                const all = req.result
                  .transaction('likes', 'readonly')
                  .objectStore('likes')
                  .getAll()
                all.onsuccess = () => {
                  resolve((all.result as { deletedAt?: string }[]).some((l) => !l.deletedAt))
                  req.result.close()
                }
              }
              req.onerror = () => resolve(false)
            }),
        ),
      )
      .toBe(true)
    await page.reload()
    await page
      .getByRole('button', { name: /Mi tablero/ })
      .first()
      .click()
    await card(page, 'Con hilo').click()
    await detail(page)
      .getByRole('tab', { name: /^Actualizaciones/ })
      .click()
    await expect(detail(page).getByRole('button', { name: 'Me gusta, 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(detail(page).getByRole('list', { name: 'Respuestas' })).toContainText(
      'Listo, lo reviso',
    )
  })
})
