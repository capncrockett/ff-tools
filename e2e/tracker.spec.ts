import { test, expect, type APIRequestContext } from '@playwright/test'
import type { SnapshotInput } from '../src/shared/tracker'

const capturedAt = new Date(Date.now() - 60_000).toISOString()
const before = new Date(Date.now() - 86_400_000).toISOString()
const context = {
  label: 'Browser fixture / PPR / 1QB',
  settings: { fixture: 'browser', scoring: 'PPR', qb: '1QB' },
}
const records = Array.from({ length: 40 }, (_, i) => ({
  sourceKey: String(900000 + i),
  sleeperId: String(900000 + i),
  playerName: i === 0 ? 'E2E Alpha' : `E2E Player ${String(i).padStart(2, '0')}`,
  position: 'WR' as const,
  team: 'FA',
  value: i === 0 ? 150 : i,
}))
async function importSnapshot(request: APIRequestContext, data: SnapshotInput) {
  const res = await request.post('/api/snapshots/import', {
    data,
    headers: { 'x-tracker-request': '1' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}
async function seed(request: APIRequestContext) {
  await importSnapshot(request, {
    source: 'dynasty-nerds',
    context,
    capturedAt: before,
    records: records.map((r) => ({ ...r, value: 100 })),
  })
  await importSnapshot(request, { source: 'dynasty-nerds', context, capturedAt, records })
  await importSnapshot(request, {
    source: 'dynasty-calculator',
    context: {
      label: 'Browser fixture / HALF PPR',
      settings: { fixture: 'browser', scoring: 'half_ppr' },
    },
    capturedAt,
    records: [{ ...records[0], value: 12 }],
  })
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  )
})

test('empty state and file import use the real isolated API and survive reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dynasty Value Tracker' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your history starts with the first capture' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Import snapshot', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Snapshot file').setInputFiles({
    name: 'history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'player_name,value,captured_at,source_key,position\nE2E Imported,45,2026-01-01T00:00:00Z,imported,TE',
    ),
  })
  await dialog.getByLabel('CSV original scoring format').fill('Fixture PPR')
  await dialog.getByRole('button', { name: 'Import snapshot', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'E2E Imported', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'E2E Imported', exact: true })).toBeVisible()
})

test('one player row keeps both source values and histories separate; failed capture preserves values', async ({
  page,
  request,
}) => {
  await seed(request)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Player alerts' })).toBeVisible()
  await expect(
    page.locator('.tracker-alert').filter({ hasText: 'E2E Alpha rose 50.0%' }),
  ).toBeVisible()
  await page.getByLabel('Find a player').fill('E2E Alpha')
  const row = page.locator('.workspace tbody tr')
  await expect(row).toHaveCount(1)
  await expect(row.locator('td')).toHaveCount(3)
  await expect(row.locator('[data-source="dynasty-nerds"] .value-number')).toHaveText('150')
  await expect(row.locator('[data-source="dynasty-calculator"] .value-number')).toHaveText('12')
  await expect(row.locator('[data-source="dynasty-nerds"]')).toContainText('+50.0%')
  await expect(
    row.getByRole('button', { name: 'Record entry for E2E Alpha', exact: true }),
  ).toHaveCount(1)
  await expect(page.locator('.workspace-footer')).toContainText('1 player')
  await page.getByRole('button', { name: 'E2E Alpha', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('svg')).toBeVisible()
  await expect(dialog.locator('tbody tr')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'E2E Alpha', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Capture values', exact: true }).first().click()
  await expect(page.getByRole('alert')).toContainText('Fixture provider unavailable')
  await expect(page.locator('.workspace tbody tr')).toContainText('150')
  await row.locator('[data-source="dynasty-calculator"] .value-number').click()
  await expect(dialog).toContainText('Dynasty Trade Calculator')
  await expect(dialog.locator('tbody tr')).toHaveCount(1)
  await expect(dialog.locator('tbody tr')).toContainText('12')
  await expect(dialog).toContainText('First capture')
})

test('entry formula, target and realized exit persist without inferring the cost', async ({
  page,
  request,
}) => {
  await seed(request)
  await page.goto('/')
  await page.getByLabel('Find a player').fill('E2E Alpha')
  await page.getByRole('button', { name: 'Record entry for E2E Alpha', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Entry cost (provider points)')).toBeEmpty()
  await dialog.getByLabel('Entry cost (provider points)').fill('100')
  await dialog
    .getByLabel('Value source', { exact: true })
    .selectOption({ label: 'Dynasty Trade Calculator / Browser fixture / HALF PPR' })
  await expect(dialog).toContainText('Latest observed value: 12.')
  await expect(dialog.getByLabel('Entry cost (provider points)')).toBeEmpty()
  await dialog
    .getByLabel('Value source', { exact: true })
    .selectOption({ label: 'Dynasty GM / Browser fixture / PPR / 1QB' })
  await dialog.getByLabel('Entry cost (provider points)').fill('100')
  await dialog.getByLabel('Acquisition date').fill('2026-01-01')
  await expect(dialog.locator('.calculation')).toContainText('120')
  await dialog.getByRole('button', { name: 'Save acquisition' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.locator('.tracker-alert').filter({ hasText: 'E2E Alpha reached the 20% target' }),
  ).toBeVisible()
  await expect(page.locator('.workspace tbody tr')).toContainText('+50.0%')
  await expect(page.locator('.workspace tbody tr')).toContainText('Target reached')
  await page.getByRole('button', { name: 'Record exit', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Player exit value (provider points)').fill('130')
  await page.getByRole('dialog').getByRole('button', { name: 'Save exit' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.workspace tbody tr')).toContainText('+30.0%')
  await expect(page.locator('.workspace tbody tr')).toContainText('Realized')
  await page.reload()
  await page.getByRole('tab', { name: /My investments/ }).click()
  await expect(page.locator('.workspace tbody tr').filter({ hasText: 'E2E Alpha' })).toContainText(
    '+30.0%',
  )
  await expect(page.getByRole('button', { name: 'Record exit', exact: true })).toHaveCount(0)
  const exported = await request.get('/api/export')
  expect(exported.ok()).toBeTruthy()
  expect((await exported.json()).holdings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ costBasis: 100, proceeds: 130, sourceName: 'dynasty-nerds' }),
    ]),
  )
})

test('desktop and narrow mobile keep columns aligned and dialogs within the viewport', async ({
  page,
  request,
}) => {
  await seed(request)
  for (const width of [1440, 390, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'E2E Alpha', exact: true })).toBeVisible()
    await expect(page.locator('.workspace thead th')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const scroll = page.locator('.table-scroll')
    await scroll.evaluate((el) => {
      el.scrollTop = 300
      el.scrollLeft = 200
    })
    const alignment = await scroll.evaluate((el) => {
      const head = el.querySelector('thead th')!.getBoundingClientRect()
      const cell = el.querySelector('tbody td')!.getBoundingClientRect()
      return {
        left: Math.abs(head.left - cell.left),
        top: Math.abs(head.top - el.getBoundingClientRect().top),
        horizontal: el.scrollLeft,
      }
    })
    expect(alignment.left).toBeLessThan(2)
    expect(alignment.top).toBeLessThan(3)
    if (width < 500) {
      expect(alignment.horizontal).toBe(0)
      const dtc = await page.locator('.workspace thead th').last().boundingBox()
      expect(dtc!.x + dtc!.width).toBeLessThanOrEqual(width)
    }
    await scroll.evaluate((el) => {
      el.scrollTop = 0
      el.scrollLeft = 0
    })
    await page.getByRole('button', { name: 'E2E Alpha', exact: true }).click()
    const box = await page.getByRole('dialog').locator('.modal-box').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
  }
})

test('hourly cooldown disables capture but keeps saved-data reload available', async ({ page }) => {
  await page.route('**/api/tracker', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.sources = data.sources.map((s: Record<string, unknown>) => ({
      ...s,
      nextAllowedAt: new Date(Date.now() + 3_600_000).toISOString(),
    }))
    await route.fulfill({ response, json: data })
  })
  await page.goto('/')
  for (const button of await page
    .getByRole('button', { name: 'Capture values', exact: true })
    .all())
    await expect(button).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Reload saved data' })).toBeEnabled()
  await expect(page.locator('.source-card').first()).toContainText('Next capture')
})
