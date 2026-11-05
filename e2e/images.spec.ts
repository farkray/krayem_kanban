import { expect, test } from '@playwright/test'
import { addCard, card, openFirstBoard } from './helpers'

/** PNG grande y "ruidoso" generado en el navegador (no se versiona ningún binario). */
async function bigPng(page: import('@playwright/test').Page, w = 3000, h = 2000) {
  const b64 = await page.evaluate(
    async ([W, H]) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')!
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `hsla(${Math.random() * 360},80%,55%,.7)`
        g.beginPath()
        g.arc(Math.random() * W, Math.random() * H, 10 + Math.random() * 80, 0, 7)
        g.fill()
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (const byte of buf) s += String.fromCharCode(byte)
      return btoa(s)
    },
    [w, h],
  )
  return Buffer.from(b64, 'base64')
}

test('imágenes: se comprime con WASM, se usa de portada y persiste', async ({ page }) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'Con imagen')
  await card(page, 'Con imagen').click()
  const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })

  const buffer = await bigPng(page)
  await dialog
    .getByLabel('Seleccionar imágenes')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer })

  const list = dialog.getByRole('list', { name: 'Imágenes' })
  await expect(list).toContainText('foto.png', { timeout: 30_000 })
  await expect(list).toContainText('1600×1067')
  await expect(list).toContainText(/MB → .*KB \(−\d+ %\)/)

  await list.getByRole('button', { name: 'Usar de portada' }).click()
  await page.keyboard.press('Escape')
  const cover = card(page, 'Con imagen').locator('img')
  await expect(cover).toBeVisible()
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600)

  await page.reload() // el archivo vive en IndexedDB
  await expect(card(page, 'Con imagen').locator('img')).toBeVisible()
})

test('imágenes: un archivo que no es imagen se rechaza con mensaje', async ({ page }) => {
  await openFirstBoard(page)
  await addCard(page, 'Por hacer', 'Sin imagen')
  await card(page, 'Sin imagen').click()
  const dialog = page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dialog.getByLabel('Seleccionar imágenes').setInputFiles({
    name: 'roto.png',
    mimeType: 'image/png',
    buffer: Buffer.from('esto no es un png'),
  })
  await expect(dialog.getByRole('alert')).toContainText('roto.png')
})
