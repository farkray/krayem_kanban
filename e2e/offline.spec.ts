import { expect, test } from '@playwright/test'
import { addCard, card, column, openFirstBoard } from './helpers'

test('PWA: se instala el service worker y la app funciona sin conexión', async ({
  page,
  context,
}) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'Antes de desconectar')

  // Espera a que el SW controle la página (la primera visita solo lo instala).
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 })
    .toBe(true)

  await context.setOffline(true)
  await page.reload() // el shell sale del caché del SW
  await expect(page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
  await expect(card(page, 'Antes de desconectar')).toBeVisible()

  // Se puede seguir trabajando sin red y los datos persisten.
  await addCard(page, 'En curso', 'Creada sin conexión')
  await page.reload()
  await expect(card(column(page, 'En curso'), 'Creada sin conexión')).toBeVisible()

  await context.setOffline(false)
})

test('PWA: el manifest es válido e instalable', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const res = await request.get(new URL(href!, page.url()).toString())
  expect(res.headers()['content-type']).toContain('manifest')
  const m = await res.json()
  expect(m).toMatchObject({ display: 'standalone', lang: 'es', start_url: '/' })
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, page.url()).toString())
    expect(r.status()).toBe(200)
  }
})
