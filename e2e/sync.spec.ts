import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { addCard, card, column } from './helpers'

// Requiere el stack completo (web + api): ALLOW_SIGNUP=true docker compose up -d --build
//   E2E_SYNC=1 E2E_BASE_URL=http://localhost:8080 npx playwright test sync
test.skip(!process.env.E2E_SYNC, 'Solo contra el stack con API (E2E_SYNC=1).')
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'contraseña-de-prueba-123'
const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@prueba.test`

async function signUp(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crear una cuenta' }).click()
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

const saved = (page: Page) =>
  expect(page.getByText('Guardado', { exact: true })).toBeVisible({ timeout: 15_000 })

async function openBoard(page: Page) {
  await page
    .getByRole('button', { name: /Mi tablero/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
}

async function newDevice(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'es-MX' })
  return { ctx, page: await ctx.newPage() }
}

test('credenciales incorrectas muestran un error y no entran', async ({ page }) => {
  await signIn(page, 'nadie@prueba.test', 'incorrecta-123')
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.')
  await expect(page.getByRole('heading', { level: 1, name: 'Kanban' })).toBeVisible()
})

test('dos dispositivos: lo creado en uno llega al otro, en vivo', async ({ browser }) => {
  const email = unique()
  const a = await newDevice(browser)
  await signUp(a.page, email)
  await openBoard(a.page)
  await addCard(a.page, 'Por hacer', 'Desde A')
  await saved(a.page)

  const b = await newDevice(browser)
  await signIn(b.page, email)
  await openBoard(b.page)
  await expect(card(column(b.page, 'Por hacer'), 'Desde A')).toBeVisible({ timeout: 15_000 })

  // En vivo (SSE), sin recargar.
  await addCard(a.page, 'En curso', 'Otra tarjeta nueva')
  await expect(card(column(b.page, 'En curso'), 'Otra tarjeta nueva')).toBeVisible({
    timeout: 15_000,
  })

  // Y al revés: B comenta, A lo ve en el detalle.
  await card(b.page, 'Desde A').click()
  const dlgB = b.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dlgB.getByLabel('Nueva actualización').fill('Hola desde **B**')
  await dlgB.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await saved(b.page)
  await card(a.page, 'Desde A').click()
  await a.page
    .getByRole('dialog')
    .getByRole('tab', { name: /^Actualizaciones/ })
    .click()
  await expect(a.page.getByRole('dialog').locator('strong', { hasText: 'B' })).toBeVisible({
    timeout: 15_000,
  })

  await a.ctx.close()
  await b.ctx.close()
})

test('sin conexión se acumulan cambios y al volver llegan al otro dispositivo', async ({
  browser,
}) => {
  const email = unique()
  const a = await newDevice(browser)
  await signUp(a.page, email)
  await openBoard(a.page)
  await saved(a.page)
  const b = await newDevice(browser)
  await signIn(b.page, email)
  await openBoard(b.page)

  await a.ctx.setOffline(true)
  await addCard(a.page, 'Por hacer', 'Hecha sin red')
  await expect(a.page.getByText(/Sin conexión · \d+ cambios? pendientes?/)).toBeVisible()
  await expect(card(b.page, 'Hecha sin red')).toHaveCount(0)

  await a.ctx.setOffline(false)
  await expect(card(column(b.page, 'Por hacer'), 'Hecha sin red')).toBeVisible({ timeout: 20_000 })
  await saved(a.page)

  await a.ctx.close()
  await b.ctx.close()
})

test('las imágenes se suben y el otro dispositivo las descarga (portada)', async ({ browser }) => {
  const email = unique()
  const a = await newDevice(browser)
  await signUp(a.page, email)
  await openBoard(a.page)
  await addCard(a.page, 'Por hacer', 'Con foto')
  await card(a.page, 'Con foto').click()

  const b64 = await a.page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 2400
    c.height = 1600
    const g = c.getContext('2d')!
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `hsla(${Math.random() * 360},80%,55%,.7)`
      g.beginPath()
      g.arc(Math.random() * 2400, Math.random() * 1600, 10 + Math.random() * 80, 0, 7)
      g.fill()
    }
    const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'))
    let s = ''
    for (const byte of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(byte)
    return btoa(s)
  })
  const dlg = a.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dlg.getByLabel('Seleccionar imágenes').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(b64, 'base64'),
  })
  await expect(dlg.getByRole('list', { name: 'Imágenes' })).toContainText('foto.png', {
    timeout: 30_000,
  })
  await dlg.getByRole('button', { name: 'Usar de portada' }).click()
  await a.page.keyboard.press('Escape')
  await saved(a.page)

  const b = await newDevice(browser)
  await signIn(b.page, email)
  await openBoard(b.page)
  const cover = card(b.page, 'Con foto').locator('img')
  await expect(cover).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600)

  await a.ctx.close()
  await b.ctx.close()
})

test('la sesión se recuerda, funciona offline y cerrar sesión borra los datos locales', async ({
  browser,
}) => {
  const email = unique()
  const a = await newDevice(browser)
  await signUp(a.page, email)
  await openBoard(a.page)
  await addCard(a.page, 'Por hacer', 'Persistente')
  await saved(a.page)

  // Recarga: sigue dentro (cookie de sesión).
  await a.page.reload()
  await expect(a.page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()

  // Sin conexión y con el service worker activo, abre con la identidad guardada.
  await a.page.evaluate(() => navigator.serviceWorker.ready)
  await a.page.reload()
  await expect
    .poll(() => a.page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 })
    .toBe(true)
  await a.ctx.setOffline(true)
  await a.page.reload()
  await expect(a.page.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeVisible()
  await expect(card(a.page, 'Persistente')).toBeVisible()
  await a.ctx.setOffline(false)
  await saved(a.page)

  // Cerrar sesión: confirma, vuelve al acceso y no quedan datos del usuario en el dispositivo.
  await a.page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await a.page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(a.page.getByRole('heading', { level: 1, name: 'Kanban' })).toBeVisible()
  const leftovers = await a.page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('kanban')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['boards', 'cards'], 'readonly')
          let n = 0
          let pending = 2
          for (const t of ['boards', 'cards']) {
            tx.objectStore(t).count().onsuccess = (e) => {
              n += (e.target as IDBRequest<number>).result
              if (--pending === 0) resolve(n)
            }
          }
        }
      }),
  )
  expect(leftovers).toBe(0)

  // Y con la sesión cerrada, la API ya no responde datos.
  const res = await a.page.request.get('/api/sync/boards')
  expect(res.status()).toBe(401)
  await a.ctx.close()
})

test('cambiar contraseña: valida, cierra las otras sesiones y la nueva sirve', async ({
  browser,
}) => {
  const email = unique()
  const NEW = 'otra-contraseña-nueva-456'
  const a = await newDevice(browser)
  await signUp(a.page, email)
  const b = await newDevice(browser)
  await signIn(b.page, email)
  await expect(b.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()

  await a.page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  const dlg = a.page.getByRole('dialog', { name: 'Cambiar contraseña' })
  await dlg.getByLabel('Contraseña actual', { exact: true }).fill('no-es-la-actual-123')
  await dlg.getByLabel('Nueva contraseña', { exact: true }).fill(NEW)
  await dlg.getByLabel('Repite la nueva contraseña').fill(NEW)
  await dlg.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(dlg.getByRole('alert')).toContainText('La contraseña actual no es correcta.')
  const violations = (
    await new AxeBuilder({ page: a.page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  ).violations
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])

  await dlg.getByLabel('Contraseña actual', { exact: true }).fill(PASSWORD)
  await dlg.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(dlg.getByRole('status')).toContainText('Listo.')
  await dlg.getByRole('button', { name: 'Cerrar' }).click()

  // La sesión de este dispositivo sigue; la del otro se cerró.
  await a.page.reload()
  await expect(a.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await b.page.reload()
  await expect(b.page.getByRole('heading', { level: 1, name: 'Kanban' })).toBeVisible()

  // Con la contraseña vieja ya no se entra; con la nueva, sí.
  await signIn(b.page, email, PASSWORD)
  await expect(b.page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.')
  await signIn(b.page, email, NEW)
  await expect(b.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()

  await a.ctx.close()
  await b.ctx.close()
})

test('las etiquetas se sincronizan: creadas en un dispositivo aparecen en el otro', async ({
  browser,
}) => {
  const email = unique()
  const a = await newDevice(browser)
  await signUp(a.page, email)
  await openBoard(a.page)
  await addCard(a.page, 'Por hacer', 'Pendiente de Coppel')
  await card(a.page, 'Pendiente de Coppel').click()
  const dlg = a.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dlg.getByRole('button', { name: /Agregar etiqueta/ }).click()
  await dlg.getByLabel('Nombre de la etiqueta').fill('Coppel')
  await dlg.getByRole('radio', { name: 'Azul' }).click()
  await dlg.getByRole('button', { name: 'Crear etiqueta' }).click()
  await expect(dlg.getByRole('button', { name: 'Quitar etiqueta Coppel' })).toBeVisible()
  await a.page.keyboard.press('Escape')
  await saved(a.page)

  const b = await newDevice(browser)
  await signIn(b.page, email)
  await openBoard(b.page)
  const chip = card(column(b.page, 'Por hacer'), 'Pendiente de Coppel').locator(
    '[data-color="blue"]',
    {
      hasText: 'Coppel',
    },
  )
  await expect(chip).toBeVisible({ timeout: 20_000 })

  // En vivo: B cambia el color y A lo ve sin recargar.
  await card(b.page, 'Pendiente de Coppel').click()
  const dlgB = b.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dlgB.getByRole('button', { name: /\+ Etiqueta/ }).click()
  await dlgB.getByRole('button', { name: 'Editar etiqueta Coppel' }).click()
  await dlgB.getByRole('radio', { name: 'Rojo' }).click()
  await dlgB.getByRole('button', { name: 'Guardar' }).click()
  await b.page.keyboard.press('Escape')
  await saved(b.page)
  await expect(
    card(column(a.page, 'Por hacer'), 'Pendiente de Coppel').locator('[data-color="red"]', {
      hasText: 'Coppel',
    }),
  ).toBeVisible({ timeout: 20_000 })

  await a.ctx.close()
  await b.ctx.close()
})
