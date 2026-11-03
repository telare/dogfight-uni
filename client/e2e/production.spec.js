import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

test('server crash returns the pilot to the lobby and reconnects after restart', async ({ page }) => {
  const base = 'http://127.0.0.1:3109'
  let child
  async function start() {
    child = spawn(process.execPath, ['server/dist/index.js'], { env: { ...process.env, PORT: '3109', ALLOWED_ORIGINS: base }, stdio: 'ignore' })
    await expect.poll(() => fetch(base + '/ready').then((r) => r.ok).catch(() => false)).toBe(true)
  }
  try {
    await start()
    await page.goto(base + '/?diagnostics=1')
    await page.locator('[data-room-id="room-alpha"]').click()
    await page.locator('#btn-join').click()
    await expect.poll(() => page.evaluate(() => window.__dogfight.connection.shipId)).not.toBeNull()
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    await expect(page.locator('#btn-join')).toBeVisible()
    await start()
    await expect.poll(() => page.evaluate(() => window.__dogfight.connection.status), { timeout: 10000 }).toBe('connected')
    await expect(page.locator('#btn-join')).toBeVisible()
  } finally { child?.kill() }
})

test('pilot names, room names and chat render as text', async ({ page }) => {
  await page.goto('/?diagnostics=1')
  const name = '<b>Pilot</b>'
  await page.locator('#pilot-name').fill(name)
  await page.locator('[data-room-id="room-alpha"]').click()
  await expect(page.locator('#roster-list')).toContainText(name)
  await expect(page.locator('#roster-list b')).toHaveCount(0)
  await page.locator('#chat-input').fill('<svg onload=alert(2)>')
  await page.locator('#chat-form').evaluate((form) => form.requestSubmit())
  await expect(page.locator('#chat-messages')).toContainText('<svg onload=alert(2)>')
  await expect(page.locator('#chat-messages svg')).toHaveCount(0)
  await page.request.post('/api/rooms', { data: { name: '<b>Sector</b>', maxPlayers: 2 } })
  await page.locator('#btn-refresh').click()
  await expect(page.locator('.room-name').filter({ hasText: '<b>Sector</b>' })).toBeVisible()
  await expect(page.locator('.room-name b')).toHaveCount(0)
})

test('PWA registers and shows a useful offline page without caching APIs', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  const cacheKeys = await page.evaluate(async () => {
    const cache = await caches.open('dogfight-shell-v1')
    return (await cache.keys()).map((request) => new URL(request.url).pathname)
  })
  expect(cacheKeys.some((key) => key.startsWith('/api') || key === '/health' || key === '/metrics')).toBe(false)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible()
})
