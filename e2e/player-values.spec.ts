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
