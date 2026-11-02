import { test, expect } from '@playwright/test'

test('two pilots join, see remote movement within 500ms, and exchange chat', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ])
  try {
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()))
    for (const [page, name] of [
      [a, 'Viper'],
      [b, 'Iceman'],
    ]) {
      await page.goto('/?diagnostics=1')
      await page.locator('#pilot-name').fill(name)
      await page.locator('[data-room-id="room-alpha"]').click()
      await page.locator('#btn-join').click()
      await expect
        .poll(() =>
          page.evaluate(
            (name) =>
              window.__dogfight.connection.roster.some((p) => p.name === name),
            name,
          ),
        )
        .toBe(true)
    }
    for (const page of [a, b]) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__dogfight.connection.roster.map((p) => p.name).sort(),
          ),
        )
        .toEqual(['Iceman', 'Viper'])
    }
    const id = await a.evaluate(() => window.__dogfight.connection.shipId)
    await expect
      .poll(() =>
        b.evaluate(
          (id) => window.__dogfight.remote.some((e) => e.id === id),
          id,
        ),
      )
      .toBe(true)
    const before = await b.evaluate(
      (id) => window.__dogfight.remote.find((e) => e.id === id),
      id,
    )
    await a.keyboard.down('w')
    try {
      await expect
        .poll(
          async () =>
            b.evaluate(
              ({ id, before }) => {
                const e = window.__dogfight.remote.find((e) => e.id === id)
                return e ? Math.hypot(e.x - before.x, e.y - before.y) : 0
              },
              { id, before },
            ),
          { timeout: 500, intervals: [20] },
        )
        .toBeGreaterThan(2)
    } finally {
      await a.keyboard.up('w')
    }
    // Returning to the lobby retains the room connection and exposes the chat UI.
    for (const page of [a, b]) {
      await page.keyboard.press('Escape')
      await expect(page.locator('#roster-list')).toContainText('Viper')
      await expect(page.locator('#roster-list')).toContainText('Iceman')
    }
    await a.locator('#chat-input').pressSequentially('Lab 07 radio check')
    await a.locator('#chat-form button').click()
    await expect(b.locator('#chat-messages')).toContainText(
      'Lab 07 radio check',
    )
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
