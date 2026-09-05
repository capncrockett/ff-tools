import { test, expect } from '@playwright/test'
import type { Dashboard } from '../src/shared/tracker'

test.use({ hasTouch: true })
const capturedAt = new Date().toISOString()
const data: Dashboard = {
  market: [
    {
      playerId: 1,
      sleeperId: '900001',
      playerName: 'Guide Example',
      position: 'WR',
      team: 'FA',
      source: 'dynasty-nerds',
      contextKey: 'guide-fixture',
      contextLabel: 'Fixture / PPR',
      value: 125,
      capturedAt,
      previousValue: 110,
      changePct: 13.636,
      baselineValue: 100,
      baselineAt: '2026-01-01T00:00:00Z',
      baselineChangePct: 25,
      observations: 3,
      history: [
        { value: 100, capturedAt: '2026-01-01T00:00:00Z' },
        { value: 110, capturedAt: '2026-02-01T00:00:00Z' },
        { value: 125, capturedAt },
      ],
    },
  ],
  holdings: [],
  sources: [
    {
      source: 'dynasty-nerds',
      label: 'Dynasty GM',
      configured: true,
      lastSuccess: capturedAt,
      lastAttempt: capturedAt,
      status: 'success',
      message: 'Saved fixture',
      nextAllowedAt: null,
    },
    {
      source: 'dynasty-calculator',
      label: 'Dynasty Trade Calculator',
      configured: true,
      lastSuccess: capturedAt,
      lastAttempt: capturedAt,
      status: 'failed',
      message: 'Fixture failure',
      nextAllowedAt: null,
    },
  ],
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/tracker', (route) => route.fulfill({ json: data }))
})

test('worked example explains both growth measures without changing saved data; DTC stays flagged', async ({
  page,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') writes.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByText('DTC automatic refresh needs a fix.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh deferred', exact: true })).toBeDisabled()
  await page.locator('.tracker-guide > summary').click()
  await page.getByLabel('Try a latest value (example only)').fill('130')
  const output = page.locator('.guide-example dl')
  await expect(output).toContainText('+18.2%')
  await expect(output).toContainText('+30.0%')
  await expect(output).toContainText('Target reached, still unrealized')
  await page.getByLabel('Try a latest value (example only)').fill('115')
  await expect(output).toContainText('Below target')
  await expect(page.locator('.workspace tbody tr')).toContainText('125')
  await page.getByLabel('Try a latest value (example only)').fill('')
  await expect(output).toContainText('Enter a value')
  expect(writes).toEqual([])
})

test('help supports hover, keyboard dismissal, and pointer movement into the tooltip', async ({
  page,
}) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'About players observed', exact: true })
  await trigger.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('not the number of rows')
  await tip.hover()
  await page.waitForTimeout(200) // Longer than the pointer transit grace period.
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await trigger.focus()
  await expect(tip).toBeVisible()
  await expect(trigger).toHaveAttribute(
    'aria-describedby',
    (await tip.getAttribute('id')) as string,
  )
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('tapped table help fits mobile and stays above the scrolling table', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const trigger = page.getByRole('button', {
    name: 'About growth since tracking began',
    exact: true,
  })
  await trigger.tap()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('separate from entry cost')
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(812)
  expect(
    await tip.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + 10, r.top + 10))
    }),
  ).toBe(true)
  await page.getByRole('heading', { name: 'Dynasty Value Tracker', exact: true }).tap()
  await expect(tip).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('help inside an entry dialog dismisses before the dialog and never submits the form', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('button', {
      name: 'Record acquisition of Guide Example from Dynasty GM',
      exact: true,
    })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('button', { name: 'About entry cost and starting benchmarks', exact: true })
    .click()
  await expect(dialog.getByRole('tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Entry cost (provider points)')).toBeEmpty()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})
