import { expect, type Page } from '@playwright/test'

/** Abre la app (con datos limpios) y entra al tablero inicial. */
export async function openFirstBoard(page: Page) {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Mi tablero/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
}

/** dnd-kit pone role=button en la tarjeta, así que se localiza por etiqueta HTML. */
export const card = (scope: Page | ReturnType<Page['locator']>, title: string) =>
  scope.locator('article', { hasText: title })

export const column = (page: Page, name: string) => page.getByRole('region', { name })

export async function addCard(page: Page, columnName: string, title: string) {
  const col = column(page, columnName)
  await col.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await col.getByLabel('Título de la tarjeta').fill(title)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  const created = card(col, title)
  await expect(created).toBeVisible()
  // La tarjeta nueva entra con una animación corta: se espera a que termine (axe mide contraste a medio fundido)
  await created.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)).then(() => true),
  )
}

/** Arrastra con el mouse en pasos (dnd-kit necesita movimiento real). */
export async function dragTo(
  page: Page,
  from: ReturnType<Page['locator']>,
  to: ReturnType<Page['locator']>,
) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.up()
}

/** Espera a que lo escrito esté realmente en IndexedDB (la escritura local es asíncrona). */
export async function waitForStored(
  page: Page,
  table: 'boards' | 'columns' | 'cards',
  title: string,
) {
  await expect
    .poll(() =>
      page.evaluate(
        ([t, wanted]) =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open('kanban')
            req.onsuccess = () => {
              const all = req.result.transaction(t, 'readonly').objectStore(t).getAll()
              all.onsuccess = () => {
                resolve((all.result as { title: string }[]).some((r) => r.title === wanted))
                req.result.close()
              }
            }
            req.onerror = () => resolve(false)
          }),
        [table, title] as const,
      ),
    )
    .toBe(true)
}
