import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { addCard, card, column, pickOption } from './helpers'

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
  await expect(a.page.getByRole('dialog').locator('strong', { hasText: /^B$/ })).toBeVisible({
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

// Administración de usuarios. Necesita una cuenta admin: la de ADMIN_EMAIL/ADMIN_PASSWORD del stack.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@local.test'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD
test('el admin crea, restablece y elimina usuarios; un usuario normal no ve el panel', async ({
  browser,
}) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD (la ADMIN_PASSWORD del stack).')
  const admin = await newDevice(browser)
  await signIn(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await admin.page.getByRole('button', { name: 'Panel de control' }).click()
  // es una pantalla propia (ruta /admin), no un modal
  await expect(admin.page).toHaveURL(/\/admin$/)
  await expect(
    admin.page.getByRole('heading', { level: 1, name: 'Panel de control' }),
  ).toBeVisible()
  await expect(admin.page.getByRole('dialog')).toHaveCount(0)
  const dlg = admin.page.getByRole('main')

  // crear con contraseña temporal generada
  const email = unique()
  await dlg.getByRole('button', { name: 'Nuevo usuario' }).click()
  const newUser = dlg.getByRole('region', { name: 'Nuevo usuario' })
  await newUser.getByLabel('Correo').fill(email)
  await newUser.getByLabel(/Alias/).fill('Jorge  E2E')
  await newUser.getByRole('button', { name: 'Crear usuario' }).click()
  const temp = (await dlg.getByRole('status').locator('code').innerText()).trim()
  expect(temp.length).toBeGreaterThanOrEqual(10)
  const list = dlg.getByRole('table', { name: 'Usuarios' })
  await expect(list.getByText('Jorge E2E', { exact: true })).toBeVisible() // alias, sin espacios dobles
  await expect(list.getByText(new RegExp(email))).toBeVisible()
  // editar el alias
  await list.getByRole('button', { name: `Editar alias de ${email}` }).click()
  await list.getByLabel(`Alias de ${email}`).fill('Jorge Menéndez')
  await list.getByRole('button', { name: 'Guardar' }).click()
  await expect(list.getByText('Jorge Menéndez', { exact: true })).toBeVisible()

  const axe = await new AxeBuilder({ page: admin.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])

  // el nuevo usuario entra con esa contraseña y NO ve el panel
  const user = await newDevice(browser)
  await signIn(user.page, email, temp)
  await expect(user.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await expect(user.page.getByRole('button', { name: 'Panel de control' })).toHaveCount(0)

  // restablecer: la anterior deja de servir
  await dlg.getByRole('button', { name: `Más acciones de ${email}` }).click()
  await dlg.getByRole('menuitem', { name: `Restablecer contraseña de ${email}` }).click()
  await expect(dlg.getByRole('status').locator('code')).not.toHaveText(temp) // llegó la nueva
  const temp2 = (await dlg.getByRole('status').locator('code').innerText()).trim()
  const again = await newDevice(browser)
  await signIn(again.page, email, temp)
  await expect(again.page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.')

  // eliminar (con confirmación) y ya no puede entrar
  await dlg.getByRole('button', { name: `Más acciones de ${email}` }).click()
  await dlg.getByRole('menuitem', { name: `Eliminar a ${email}` }).click()
  await admin.page.getByRole('button', { name: 'Eliminar usuario' }).click()
  await expect(list.getByText(email)).toHaveCount(0)
  await signIn(again.page, email, temp2)
  await expect(again.page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.')
  // el admin no se puede eliminar a sí mismo
  await dlg.getByRole('button', { name: `Más acciones de ${ADMIN_EMAIL}` }).click()
  await expect(dlg.getByRole('menuitem', { name: `Eliminar a ${ADMIN_EMAIL}` })).toHaveCount(0)
  await admin.page.keyboard.press('Escape')

  // volver a los tableros desde el panel
  await admin.page.getByRole('button', { name: /Volver a los tableros/ }).click()
  await expect(admin.page).not.toHaveURL(/\/admin/)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  // y se puede abrir de nuevo por la dirección directa
  await admin.page.goto('/admin')
  await expect(
    admin.page.getByRole('heading', { level: 1, name: 'Panel de control' }),
  ).toBeVisible()

  await admin.ctx.close()
  await user.ctx.close()
  await again.ctx.close()
})

test('compartir tableros: privado por defecto, editor, solo lectura y salir', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const a = await newDevice(browser)
  const b = await newDevice(browser)
  const emailA = unique()
  const emailB = unique()
  await signUp(a.page, emailA)
  await signUp(b.page, emailB)

  // A renombra su tablero y crea otro privado
  await openBoard(a.page)
  await a.page.getByRole('heading', { level: 1 }).getByRole('button').click()
  await a.page.getByLabel('Nombre del tablero').fill('Proyecto A')
  await a.page.keyboard.press('Enter')
  await addCard(a.page, 'Por hacer', 'Tarea compartida')
  await saved(a.page)

  // privado: B no ve nada de A
  await expect(b.page.getByRole('list', { name: 'Compartidos conmigo' })).toHaveCount(0)
  await expect(b.page.getByRole('button', { name: /Proyecto A/ })).toHaveCount(0)

  // A comparte con B como editor (correo sin cuenta → error claro)
  await a.page.getByRole('button', { name: 'Compartir' }).click()
  const dlg = a.page.getByRole('dialog', { name: /Compartir/ })
  await expect(dlg.getByText('privado')).toBeVisible()
  const axe = await new AxeBuilder({ page: a.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  // menú con los usuarios registrados (sin uno mismo); se elige a B
  const picker = dlg.getByRole('combobox', { name: 'Persona' })
  await picker.click()
  await expect(dlg.page().getByRole('option', { name: new RegExp(emailA) })).toHaveCount(0)
  await dlg.page().getByRole('option', { name: new RegExp(emailB) }).click()
  await dlg.getByRole('button', { name: 'Compartir', exact: true }).click()
  await expect(dlg.getByRole('list', { name: 'Personas con acceso' })).toContainText(emailB)
  await dlg.getByRole('button', { name: 'Cerrar' }).click()

  // B lo recibe en vivo, con la tarjeta
  const shared = b.page.getByRole('list', { name: 'Compartidos conmigo' })
  await expect(shared).toContainText('Proyecto A', { timeout: 15_000 })
  await expect(shared).toContainText('Editor')
  await shared.getByRole('button', { name: /Proyecto A/ }).click()
  await expect(card(column(b.page, 'Por hacer'), 'Tarea compartida')).toBeVisible()

  // Lista de miembros: B (invitado) también ve quién participa
  await b.page.getByRole('button', { name: /Miembros del tablero: 2 personas/ }).click()
  const membersB = b.page.getByRole('group', { name: 'Miembros del tablero' })
  await expect(membersB).toContainText(emailA)
  await expect(membersB).toContainText('Dueño')
  await expect(membersB).toContainText(`${emailB} (tú)`)
  await b.page.keyboard.press('Escape')

  // A asigna la tarjeta a B: el avatar aparece en ambos y B la filtra con "Yo"
  await card(column(a.page, 'Por hacer'), 'Tarea compartida').click()
  const detalleA = a.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await pickOption(detalleA.getByLabel('Asignado a'), new RegExp(emailB))
  await detalleA.getByRole('button', { name: 'Listo' }).click()
  await expect(
    card(column(b.page, 'Por hacer'), 'Tarea compartida').getByRole('img', {
      name: `Asignada a ${emailB}`,
    }),
  ).toBeVisible({ timeout: 15_000 })

  await b.page.getByRole('button', { name: 'Filtros' }).click()
  await b.page.getByRole('checkbox', { name: 'Mostrar solo lo asignado a mí' }).check()
  await expect(card(column(b.page, 'Por hacer'), 'Tarea compartida')).toBeVisible()
  await b.page.keyboard.press('Escape')
  await b.page.screenshot({ path: '/tmp/assigned-b.png' })
  await b.page.getByRole('button', { name: 'Limpiar filtro' }).click()

  // Menciones: A etiqueta a B con @ en una actualización y en una tarea
  await card(column(a.page, 'Por hacer'), 'Tarea compartida').click()
  const dm = a.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await dm.getByRole('textbox', { name: 'Nueva actualización' }).click()
  await a.page.keyboard.type('Revisa esto @')
  const menuA = a.page.getByRole('listbox', { name: 'Mencionar a' })
  await expect(menuA).toContainText(emailB)
  const axeMenu = await new AxeBuilder({ page: a.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(axeMenu.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  await expect(menuA).toContainText(emailA) // participan el dueño y B (también se puede mencionar a uno mismo)
  await menuA.getByRole('option', { name: new RegExp(emailB) }).click()
  await dm.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await dm.getByRole('button', { name: /Agregar lista de tareas/ }).click()
  await dm.getByLabel('Nuevo ítem de la lista').fill('Llamar a @')
  await a.page
    .getByRole('listbox', { name: 'Mencionar a' })
    .getByRole('option', { name: new RegExp(emailB) })
    .click()
  await a.page.keyboard.press('Enter') // ya sin menú: envía el ítem
  await expect(
    dm
      .getByRole('list')
      .locator('[title]', { hasText: `@${emailB}` })
      .first(),
  ).toBeVisible()
  await dm.getByRole('tab', { name: /^Actualizaciones/ }).click()
  await expect(dm.getByRole('list', { name: 'Actualizaciones' })).toContainText(`@${emailB}`)
  await dm.getByRole('button', { name: 'Listo' }).click()
  // B ve la marca "Te mencionan" en la tarjeta y su chip resaltado dentro
  const cardB = card(column(b.page, 'Por hacer'), 'Tarea compartida')
  await expect(cardB.getByTitle('Te mencionan')).toBeVisible({ timeout: 15_000 })
  // y la campana de B avisa de la mención (en vivo), con quién y en qué tarjeta
  const bell = b.page.getByRole('button', { name: /^Notificaciones, \d+ sin leer$/ })
  await expect(bell).toBeVisible({ timeout: 15_000 })
  await bell.click()
  const inbox = b.page.getByRole('group', { name: 'Notificaciones' })
  const mentionItem = inbox.getByRole('button', { name: /te mencionó/ })
  await expect(mentionItem).toContainText('Tarea compartida')
  await expect(mentionItem).toContainText('Sin leer')
  await b.page.keyboard.press('Escape')
  await cardB.click()
  const db = b.page.getByRole('dialog', { name: 'Detalle de la tarjeta' })
  await expect(db.getByTitle('Te mencionan').first()).toBeVisible()
  await db.getByRole('button', { name: 'Listo' }).click()
  // al abrir la tarjeta su aviso quedó leído
  await b.page.getByRole('button', { name: /^Notificaciones/ }).click()
  await expect(
    b.page
      .getByRole('group', { name: 'Notificaciones' })
      .getByRole('button', { name: /te mencionó/ }),
  ).not.toContainText('Sin leer')
  await b.page.keyboard.press('Escape')

  // Notas del tablero (tarjetas): A crea una, B (editor) la ve y la edita, A ve el cambio
  const notesA = a.page.getByRole('complementary', { name: 'Notas del tablero' })
  const notesB = b.page.getByRole('complementary', { name: 'Notas del tablero' })
  await a.page.getByRole('button', { name: 'Notas', exact: true }).click()
  await notesA.getByRole('button', { name: 'Tomar una nota…' }).click()
  await notesA.getByRole('textbox', { name: 'Nota' }).click()
  await a.page.keyboard.type('Drive: https://drive.google.com/drive/folders/xyz')
  await notesA.getByRole('button', { name: 'Listo' }).click()
  await saved(a.page)
  await b.page.getByRole('button', { name: 'Notas', exact: true }).click()
  await expect(notesB.getByRole('link', { name: /drive.google.com/ })).toBeVisible({
    timeout: 15_000,
  })
  await notesB.getByRole('button', { name: 'Editar nota' }).click()
  await notesB.getByRole('textbox', { name: 'Nota' }).click()
  await b.page.keyboard.press('ControlOrMeta+End')
  await b.page.keyboard.type(' Editado por B')
  await notesB.getByRole('button', { name: 'Listo' }).click()
  await saved(b.page)
  await expect(notesA.getByText(/Editado por B/)).toBeVisible({ timeout: 15_000 })

  // B (editor) agrega una tarjeta y A la ve en vivo; B no puede eliminar ni compartir el tablero
  await addCard(b.page, 'Por hacer', 'Hecha por B')
  await saved(b.page)
  await expect(card(column(a.page, 'Por hacer'), 'Hecha por B')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByRole('button', { name: 'Eliminar tablero' })).toHaveCount(0)
  await expect(b.page.getByRole('button', { name: 'Compartir' })).toHaveCount(0)

  // A baja a B a solo lectura: B pierde los controles de edición
  await a.page.getByRole('button', { name: /Compartido · 1/ }).click()
  await pickOption(
    a.page.getByRole('dialog', { name: /Compartir/ }).getByLabel(`Permiso de ${emailB}`),
    'Solo lectura',
  )
  await a.page
    .getByRole('dialog', { name: /Compartir/ })
    .getByRole('button', { name: 'Cerrar' })
    .click()
  await expect(shared).toContainText('Solo lectura', { timeout: 15_000 })
  await expect(notesB.getByText(/Editado por B/)).toBeVisible() // las notas se leen
  await expect(notesB.getByRole('button', { name: 'Editar nota' })).toHaveCount(0) // pero no se editan
  await expect(notesB.getByRole('button', { name: 'Tomar una nota…' })).toHaveCount(0)
  await expect(b.page.getByRole('button', { name: 'Salir del tablero' })).toBeVisible()
  const axeB = await new AxeBuilder({ page: b.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(axeB.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  await b.page.screenshot({ path: '/tmp/shared-readonly.png' })
  await expect(
    column(b.page, 'Por hacer').getByRole('button', { name: 'Agregar tarjeta' }),
  ).toHaveCount(0)
  await expect(b.page.getByRole('button', { name: /Eliminar tarjeta/ })).toHaveCount(0)

  // B se sale: el tablero desaparece de su lista y A queda de nuevo con un tablero privado
  await b.page.getByRole('button', { name: 'Salir del tablero' }).click()
  await b.page.getByRole('button', { name: 'Salir del tablero' }).last().click()
  await expect(b.page.getByRole('list', { name: 'Compartidos conmigo' })).toHaveCount(0, {
    timeout: 15_000,
  })
  await expect(a.page.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible({
    timeout: 15_000,
  })

  await a.ctx.close()
  await b.ctx.close()
})

test('rol de invitado: no crea tableros, solo participa; el admin puede cambiar el rol', async ({
  browser,
}) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD (la ADMIN_PASSWORD del stack).')
  test.setTimeout(120_000)
  const admin = await newDevice(browser)
  await signIn(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()

  // el admin crea un usuario con rol de invitado
  await admin.page.getByRole('button', { name: 'Panel de control' }).click()
  await admin.page.getByRole('button', { name: 'Nuevo usuario' }).click()
  const form = admin.page.getByRole('region', { name: 'Nuevo usuario' })
  const email = unique()
  await form.getByLabel('Correo').fill(email)
  await pickOption(form.getByRole('combobox', { name: 'Rol' }), 'Invitado')
  await form.getByRole('checkbox', { name: 'General' }).check() // comparte workspace con el admin
  await form.getByRole('button', { name: 'Crear usuario' }).click()
  const temp = (await admin.page.getByRole('status').locator('code').innerText()).trim()
  await expect(admin.page.getByRole('combobox', { name: `Rol de ${email}` })).toHaveText(/Invitado/)

  // el invitado entra: sin tablero propio y sin forma de crear uno
  const guest = await newDevice(browser)
  await signIn(guest.page, email, temp)
  await expect(guest.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await expect(
    guest.page.getByText(/Aún no te han compartido ningún tablero/).first(),
  ).toBeVisible()
  await expect(guest.page.getByRole('button', { name: /Nuevo tablero/ })).toHaveCount(0)
  await expect(guest.page.getByRole('button', { name: /Mi tablero/ })).toHaveCount(0) // sin tablero inicial

  // el admin comparte su tablero con él: ahora participa (como editor) sin poder crear nada
  await admin.page.getByRole('button', { name: /Volver a los tableros/ }).click()
  await admin.page
    .getByRole('button', { name: /Mi tablero/ })
    .first()
    .click()
  await admin.page.getByRole('button', { name: 'Compartir' }).click()
  const dlg = admin.page.getByRole('dialog', { name: /Compartir/ })
  await pickOption(dlg.getByRole('combobox', { name: 'Persona' }), new RegExp(email))
  await dlg.getByRole('button', { name: 'Compartir', exact: true }).click()
  await expect(dlg.getByRole('list', { name: 'Personas con acceso' })).toContainText(email)
  await dlg.getByRole('button', { name: 'Cerrar' }).click()

  const shared = guest.page.getByRole('list', { name: 'Compartidos conmigo' })
  await expect(shared).toContainText('Mi tablero', { timeout: 15_000 })
  await shared.getByRole('button', { name: /Mi tablero/ }).click()
  await addCard(guest.page, 'Por hacer', 'Tarea del invitado')
  await saved(guest.page)
  await expect(card(column(admin.page, 'Por hacer'), 'Tarea del invitado')).toBeVisible({
    timeout: 15_000,
  })
  await expect(guest.page.getByRole('button', { name: 'Crear subtablero' })).toHaveCount(0)
  await expect(guest.page.getByRole('button', { name: 'Nuevo tablero' })).toHaveCount(0)

  // el admin lo cambia a usuario normal: al recargar ya puede crear tableros
  await admin.page.goto('/admin')
  await pickOption(admin.page.getByRole('combobox', { name: `Rol de ${email}` }), 'Usuario')
  await expect(admin.page.getByRole('combobox', { name: `Rol de ${email}` })).toHaveText(/Usuario/)
  await guest.page.goto('/') // la sesión se vuelve a leer del servidor con el rol nuevo
  await expect(guest.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await expect(guest.page.getByRole('button', { name: /Nuevo tablero/ }).first()).toBeVisible({
    timeout: 15_000,
  })

  await admin.ctx.close()
  await guest.ctx.close()
})

// Workspaces: el admin crea uno y asigna usuarios; quien está fuera no existe para los de dentro.
test('workspaces: el admin los crea y asigna; no se ven usuarios de otros workspaces', async ({
  browser,
}) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD (la ADMIN_PASSWORD del stack).')
  const admin = await newDevice(browser)
  await signIn(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await admin.page.goto('/admin')
  const main = admin.page.getByRole('main')
  const ws = `Mercabits ${Date.now()}`
  // pestañas: Usuarios, Workspaces y Avisos
  await expect(main.getByRole('tab')).toHaveText([/Usuarios/, /Workspaces/, /Conexiones/, /Avisos/])
  await expect(main.getByRole('tab', { name: /Usuarios/ })).toHaveAttribute('aria-selected', 'true')
  await main.getByRole('tab', { name: /Workspaces/ }).click()
  await main.getByLabel('Nombre del nuevo workspace').fill(ws)
  await main.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(main.getByRole('list', { name: 'Workspaces' })).toContainText(ws)
  await expect(main.getByRole('region', { name: `Detalle de ${ws}` })).toBeVisible()
  await main.getByRole('tab', { name: /Usuarios/ }).click()

  const create = async (email: string, inWs: boolean) => {
    await main.getByRole('button', { name: 'Nuevo usuario' }).click()
    const form = main.getByRole('region', { name: 'Nuevo usuario' })
    await form.getByLabel('Correo').fill(email)
    await form.getByLabel('Contraseña (opcional)').fill(PASSWORD)
    const box = form.getByRole('checkbox', { name: ws })
    if (inWs) await box.check()
    else if (await box.isChecked()) await box.uncheck()
    await form.getByRole('button', { name: 'Crear usuario' }).click()
    await expect(main.getByRole('table', { name: 'Usuarios' })).toContainText(email)
  }
  const [a, b, c] = [unique(), unique(), unique()]
  await create(a, true)
  await create(b, true)
  await create(c, false)
  await main.getByRole('tab', { name: /Workspaces/ }).click()
  await expect(main.getByRole('list', { name: 'Workspaces' })).toContainText('2 miembros')
  await main.getByRole('button', { name: /^General/ }).click()
  await main.getByRole('tab', { name: /Avisos/ }).click()
  await expect(main.getByRole('heading', { name: /Avisos|Entrega/ }).first()).toBeVisible()
  const axe = await new AxeBuilder({ page: admin.page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])

  const userA = await newDevice(browser)
  await signIn(userA.page, a)
  await expect(userA.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  const emails = await userA.page.evaluate(async () => {
    const r = await fetch('/api/users/directory', { credentials: 'same-origin' })
    return ((await r.json()) as { users: { email: string }[] }).users.map((u) => u.email)
  })
  expect(emails).toContain(b)
  expect(emails).not.toContain(c)

  // sin workspace: la persona entra pero no puede crear tableros y se le explica
  const userC = await newDevice(browser)
  await signIn(userC.page, c)
  await expect(userC.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await userC.page.getByRole('button', { name: /Nuevo tablero/ }).first().click()
  await userC.page.getByLabel('Nombre del tablero').fill('Sin workspace')
  await userC.page.keyboard.press('Enter')
  await expect(userC.page.getByRole('status').filter({ hasText: /workspace/ })).toBeVisible()

  for (const x of [admin, userA, userC]) await x.ctx.close()
})

// Mover un tablero de workspace: avisa de quién perdería el acceso y lo retira al confirmar.
test('el dueño mueve su tablero a otro workspace y quien queda fuera pierde el acceso', async ({
  browser,
}) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD (la ADMIN_PASSWORD del stack).')
  test.setTimeout(120_000)
  const admin = await newDevice(browser)
  await signIn(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await admin.page.goto('/admin')
  const main = admin.page.getByRole('main')

  // un workspace nuevo y una persona solo en General
  const dest = `Destino ${Date.now()}`
  await main.getByRole('tab', { name: /Workspaces/ }).click()
  await main.getByLabel('Nombre del nuevo workspace').fill(dest)
  await main.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(main.getByRole('list', { name: 'Workspaces' })).toContainText(dest)
  await main.getByRole('tab', { name: /Usuarios/ }).click()
  const email = unique()
  await main.getByRole('button', { name: 'Nuevo usuario' }).click()
  const form = main.getByRole('region', { name: 'Nuevo usuario' })
  await form.getByLabel('Correo').fill(email)
  await form.getByLabel('Contraseña (opcional)').fill(PASSWORD)
  await form.getByRole('checkbox', { name: 'General' }).check()
  await form.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(main.getByRole('table', { name: 'Usuarios' })).toContainText(email)

  // el admin comparte su tablero con esa persona
  await admin.page.getByRole('button', { name: /Volver a los tableros/ }).click()
  await admin.page.getByRole('button', { name: /Mi tablero/ }).first().click()
  await admin.page.getByRole('main').getByRole('button', { name: /^(Compartir|Compartido)/ }).click()
  const dlg = admin.page.getByRole('dialog', { name: /Compartir/ })
  await pickOption(dlg.getByRole('combobox', { name: 'Persona' }), new RegExp(email))
  await dlg.getByRole('button', { name: 'Compartir', exact: true }).click()
  await expect(dlg.getByRole('list', { name: 'Personas con acceso' })).toContainText(email)

  // cambia el workspace del tablero: se avisa de quién queda fuera y, al confirmar, se le retira
  await pickOption(dlg.getByRole('combobox', { name: 'Workspace del tablero' }), dest)
  const confirm = admin.page.getByRole('alertdialog', { name: /Mover el tablero/ })
  await expect(confirm).toContainText(email)
  await confirm.getByRole('button', { name: 'Mover y quitar acceso' }).click()
  await expect(dlg.getByRole('combobox', { name: 'Workspace del tablero' })).toHaveText(
    new RegExp(dest),
  )
  await expect(dlg.getByRole('list', { name: 'Personas con acceso' })).toHaveCount(0)

  await admin.ctx.close()
})

// Conexiones de agentes externos (Hermes, Claude…): el administrador autoriza tableros y entrega un token.
test('conexiones de agentes: el admin crea una, ve el token una vez; el agente lee solo lo autorizado y al revocar pierde el acceso', async ({
  browser,
}) => {
  test.skip(!ADMIN_PASSWORD, 'Define E2E_ADMIN_PASSWORD (la ADMIN_PASSWORD del stack).')
  test.setTimeout(120_000)
  const admin = await newDevice(browser)
  await signIn(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Mis tableros' })).toBeVisible()
  await admin.page.goto('/admin')
  const main = admin.page.getByRole('main')
  await main.getByRole('tab', { name: /Conexiones/ }).click()
  await main.getByRole('button', { name: 'Nueva conexión' }).first().click()

  const form = main.getByRole('form', { name: 'Nueva conexión' })
  await form.getByLabel(/Nombre del agente/).fill('Hermes')
  await form.getByLabel('Avisar dentro de la app a personas de esos tableros').check()
  await form.getByRole('checkbox', { name: /Mi tablero/ }).first().check()
  await pickOption(form.getByRole('combobox', { name: /Nivel en Mi tablero/ }), 'Leer y escribir')
  await form.getByRole('button', { name: 'Crear conexión y generar token' }).click()

  // el token aparece una sola vez, con la guía de conexión
  const reveal = main.getByRole('status', { name: 'Token de la conexión' })
  await expect(reveal).toContainText('no se vuelve a mostrar')
  const token = (await reveal.locator('pre').first().innerText()).trim()
  expect(token).toMatch(/^kbn_/)
  await expect(reveal).toContainText('openapi.json')
  await expect(reveal).toContainText('agent-mcp/server.mjs')
  await reveal.getByRole('button', { name: 'Ya lo guardé' }).click()
  await expect(reveal).toHaveCount(0)
  await expect(main.getByRole('list', { name: 'Conexiones' })).toContainText('Hermes')
  await expect(main.getByRole('list', { name: 'Conexiones' })).not.toContainText(token) // solo el prefijo

  // el agente (sin cookie) lee el tablero autorizado
  const call = (path: string) =>
    admin.page.evaluate(
      async ([p, t]) => {
        const r = await fetch(`/api/agent/v1${p}`, { headers: { Authorization: `Bearer ${t}` }, credentials: 'omit' })
        return { status: r.status, body: await r.json().catch(() => ({})) }
      },
      [path, token],
    )
  const me = await call('/me')
  expect(me.status).toBe(200)
  expect(me.body.boards[0]).toMatchObject({ access: 'write' })
  expect((await call('/boards/otro-tablero')).status).toBe(404)

  // revocar: el acceso termina al instante
  const item = main.getByRole('list', { name: 'Conexiones' }).getByRole('listitem').first()
  await item.getByRole('button', { name: 'Más acciones de Hermes' }).click()
  await item.getByRole('menuitem', { name: 'Revocar acceso' }).click()
  await admin.page.getByRole('alertdialog').getByRole('button', { name: 'Revocar' }).click()
  await expect(item).toContainText('Revocada')
  expect((await call('/me')).status).toBe(401)

  await admin.ctx.close()
})
