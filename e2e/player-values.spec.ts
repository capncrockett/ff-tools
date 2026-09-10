import { test, expect } from '@playwright/test'
import type { Dashboard, MarketRow, SourceName } from '../src/shared/tracker'

function series(
  playerId: number,
  playerName: string,
  source: SourceName,
  contextLabel: string,
  value: number,
  baselineValue: number,
  capturedAt = '2026-09-05T00:00:00Z',
): MarketRow {
  return {
    playerId,
    playerName,
    sleeperId: String(playerId),
    position: 'WR',
    team: 'FA',
    source,
    contextKey: contextLabel,
    contextLabel,
    value,
    capturedAt,
    baselineValue,
    baselineAt: '2025-01-01T00:00:00Z',
    previousValue: baselineValue,
    baselineChangePct: ((value - baselineValue) / baselineValue) * 100,
    changePct: ((value - baselineValue) / baselineValue) * 100,
    observations: 2,
    history: [
      { value: baselineValue, capturedAt: '2025-01-01T00:00:00Z' },
      { value, capturedAt },
    ],
  }
}

test('player identity, missing values, zero values and alternate formats survive grouping and source sorting', async ({
  page,
}) => {
  const data: Dashboard = {
    market: [
      series(1, 'Same Name', 'dynasty-nerds', 'Older SF format', 999, 10, '2025-06-01T00:00:00Z'),
      series(1, 'Same Name', 'dynasty-nerds', 'Current PPR format', 125, 100),
      series(1, 'Same Name', 'dynasty-calculator', 'Half PPR', 12, 24),
      series(2, 'Same Name', 'dynasty-calculator', 'Half PPR', 20, 10),
      series(3, 'Zero Player', 'dynasty-nerds', 'PPR', 0, 10),
    ],
    holdings: [],
    sources: [],
    roster: null,
  }
  await page.route('**/api/tracker', (route) => route.fulfill({ json: data }))
  await page.goto('/')
  const rows = page.locator('.workspace tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Same Name', exact: true })).toHaveCount(2)
  await expect(page.locator('.workspace-footer')).toContainText('3 players')
  const combined = rows.filter({ hasText: 'Current PPR format' })
  await expect(combined.locator('[data-source="dynasty-nerds"] .value-number')).toHaveText([
    '125',
    '999',
  ])
  await expect(combined.locator('[data-source="dynasty-calculator"] .value-number')).toHaveText(
    '12',
  )
  await combined
    .getByRole('button', { name: /View Same Name history from Dynasty GM: Older SF format/ })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Older SF format')
  await expect(page.getByRole('dialog').locator('tbody tr').first()).toContainText('999')
  await page.keyboard.press('Escape')
  const zero = rows.filter({ hasText: 'Zero Player' })
  await expect(zero.locator('[data-source="dynasty-nerds"] .value-number')).toHaveText('0')
  await expect(zero.locator('[data-source="dynasty-calculator"]')).toHaveText('No value yet')
  await page.getByLabel('Sort by').selectOption('dynasty-nerds:baseline')
  await expect(rows.first()).toContainText('Current PPR format')
  await expect(rows.last().locator('[data-source="dynasty-nerds"]')).toHaveText('No value yet')
  await page.getByLabel('Sort by').selectOption('dynasty-calculator:baseline')
  await expect(rows.first().locator('[data-source="dynasty-calculator"] .value-number')).toHaveText(
    '20',
  )
  await expect(rows.last()).toContainText('Zero Player')
  await page.getByLabel('Find a player').fill('Zero')
  await expect(rows).toHaveCount(1)
})

test('value trends keep provider formats separate and filter player lines by position', async ({
  page,
}) => {
  const receiver = series(11, 'Trend Receiver', 'dynasty-calculator', 'Half PPR', 24, 20)
  const runner = {
    ...series(12, 'Trend Runner', 'dynasty-calculator', 'Half PPR', 30, 25),
    position: 'RB',
  }
  const tightEnd = {
    ...series(13, 'Trend Tight End', 'dynasty-calculator', 'Half PPR', 16, 15),
    position: 'TE',
  }
  const data: Dashboard = {
    market: [
      receiver,
      runner,
      tightEnd,
      series(11, 'Trend Receiver', 'dynasty-nerds', 'PPR', 2400, 2000),
      {
        ...series(
          14,
          'Old Format Quarterback',
          'dynasty-calculator',
          'Old Superflex',
          40,
          30,
          '2025-06-01T00:00:00Z',
        ),
        position: 'QB',
      },
    ],
    holdings: [],
    sources: [],
    roster: null,
  }
  await page.route('**/api/tracker', (route) => route.fulfill({ json: data }))
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Value trends', exact: true }).click()

  const chart = page.getByRole('img', { name: /Dynasty Trade Calculator value trends/ })
  await expect(chart).toHaveAttribute('aria-label', /3 players/)
  await expect(page.locator('[data-trend-line]')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'View Trend Runner history' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Old Format Quarterback history/ })).toHaveCount(0)
  const plotBox = await page.locator('.trend-chart-frame').boundingBox()
  const legendBox = await page.locator('.trend-legend').boundingBox()
  expect(legendBox!.y).toBeGreaterThanOrEqual(plotBox!.y + plotBox!.height)

  await page.getByLabel('Trend position').selectOption('RB')
  await expect(page.locator('[data-trend-line]')).toHaveCount(1)
  await expect(chart).toHaveAttribute('aria-label', /1 player$/)
  await page.getByRole('button', { name: 'View Trend Runner history' }).click()
  await expect(page.getByRole('dialog')).toContainText('Trend Runner - value history')
  await page.keyboard.press('Escape')

  await page.getByLabel('Trend position').selectOption('all')
  await page.getByLabel('Trend source').selectOption('dynasty-nerds')
  await expect(page.getByLabel('Trend scoring format')).toHaveValue('PPR')
  await expect(page.locator('[data-trend-line]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'View Trend Receiver history' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page
      .locator('.trend-chart-frame')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true)
})
