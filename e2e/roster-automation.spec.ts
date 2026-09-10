import { expect, test } from '@playwright/test'
import type { Dashboard } from '../src/shared/tracker'

test('one automated acquisition row keeps both provider returns side by side', async ({ page }) => {
  const common = {
    acquisitionKey: 'sleeper:tx-add:add:101',
    playerId: 1,
    playerName: 'Fixture Receiver',
    portfolio: 'A League For All Seasons',
    acquiredAt: '2026-09-01T10:00:00Z',
    targetRoi: 20,
    notes: 'Started automatically.',
    closedAt: null,
    proceeds: null,
    automated: true,
    reviewReason: null,
    capturedAt: new Date().toISOString(),
    targetReached: true,
  } as const
  const data: Dashboard = {
    market: [],
    sources: [],
    roster: null,
    holdings: [
      {
        ...common,
        id: 'gm-holding',
        sourceName: 'dynasty-nerds',
        contextKey: 'ppr',
        contextLabel: 'PPR',
        costBasis: 100,
        currentValue: 125,
        gain: 25,
        roi: 25,
        targetValue: 120,
      },
      {
        ...common,
        id: 'dtc-holding',
        sourceName: 'dynasty-calculator',
        contextKey: 'half-ppr',
        contextLabel: 'Half PPR',
        costBasis: 10,
        currentValue: 13,
        gain: 3,
        roi: 30,
        targetValue: 12,
      },
    ],
  }
  await page.route('**/api/tracker', (route) => route.fulfill({ json: data }))
  await page.goto('/')
  await page.getByRole('tab', { name: /My investments/ }).click()

  const rows = page.locator('.investment-table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.locator('td')).toHaveCount(4)
  await expect(rows.locator('[data-source="dynasty-nerds"]')).toContainText('100')
  await expect(rows.locator('[data-source="dynasty-nerds"]')).toContainText('125')
  await expect(rows.locator('[data-source="dynasty-calculator"]')).toContainText('10')
  await expect(rows.locator('[data-source="dynasty-calculator"]')).toContainText('13')
  await expect(page.getByText('OPEN INVESTMENTS').locator('..')).toContainText('1')
})

test('roster review explains a stale exit and accepts the last known value explicitly', async ({
  page,
}) => {
  let accepted = false
  const dashboard = (): Dashboard => ({
    market: [],
    holdings: [],
    sources: [],
    roster: {
      leagueName: 'A League For All Seasons',
      status: accepted ? 'success' : 'needs_review',
      message: accepted ? 'Watching 30 roster players.' : '1 roster movement needs review.',
      lastCheckedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      nextAllowedAt: new Date(Date.now() + 50 * 60_000).toISOString(),
      rosterPlayers: 30,
      pending: 0,
      reviews: accepted
        ? []
        : [
            {
              id: 'review-1',
              movementId: 'movement-1',
              playerName: 'Fixture Receiver',
              sleeperPlayerId: '101',
              direction: 'remove',
              occurredAt: new Date().toISOString(),
              sourceName: 'dynasty-calculator',
              contextKey: 'half-ppr',
              message: 'The last DTC value before removal is more than 36 hours old.',
              suggestedValue: 42,
              suggestedCapturedAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
              canAcceptLastValue: true,
            },
          ],
    },
  })
  await page.route('**/api/tracker', (route) => route.fulfill({ json: dashboard() }))
  await page.route('**/api/roster/reviews/review-1/accept-last-value', (route) => {
    accepted = true
    return route.fulfill({ json: { accepted: true } })
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  const panel = page.getByRole('region', { name: 'Sleeper roster automation' })
  await expect(panel).toContainText('1 need review')
  await expect(panel).toContainText('Fixture Receiver / Removed')
  await expect(panel).toContainText('Last known: 42 points')
  await expect(panel.getByRole('button', { name: 'Check roster now' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Use last value' }).click()
  await expect(page.getByRole('status')).toContainText('Last known value accepted')
  await expect(panel).toContainText('Watching 30 roster players')
  await expect(panel.getByRole('button', { name: 'Use last value' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
