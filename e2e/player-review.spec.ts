import { expect, test } from '@playwright/test'
import type { PlayerMatchRow, ReviewPlayer } from '../src/shared/playerReview'

const candidates: ReviewPlayer[] = [
  {
    id: 701,
    name: 'Fixture Receiver',
    position: 'WR',
    birthDate: '2000-01-01',
    sleeperId: '88001',
    rostered: true,
  },
  {
    id: 702,
    name: 'Fixture Receiver',
    position: 'WR',
    birthDate: '2002-01-01',
    sleeperId: '88002',
    rostered: false,
  },
]
const row: PlayerMatchRow = {
  source: 'dynasty-nerds',
  key: '501',
  name: 'Fixture Receiver',
  position: 'WR',
  birthDate: '1990-01-01',
  age: null,
  lastSeenAt: '2026-09-14T12:00:00Z',
  current: true,
  status: 'ambiguous',
  method: 'automatic',
  note: 'Birth date differs. Confirm the identity.',
  linked: null,
  candidates,
  rostered: true,
}

test('roster-first review requires an explicit identity, survives reload, and fits narrow mobile', async ({
  page,
}) => {
  let linked: ReviewPlayer | null = null
  await page.route('**/api/player-matches?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const rows =
      linked && params.get('status') !== 'all'
        ? []
        : [
            {
              ...row,
              linked,
              status: linked ? 'linked' : 'ambiguous',
              method: linked ? 'manual' : 'automatic',
            },
          ]
    return route.fulfill({ json: { rows, total: rows.length, rosterAvailable: true } })
  })
  await page.route('**/api/player-matches/link', async (route) => {
    expect(route.request().headers()['x-tracker-request']).toBe('1')
    expect(route.request().postDataJSON()).toEqual({
      source: 'dynasty-nerds',
      key: '501',
      playerId: 702,
    })
    linked = candidates[1]
    await route.fulfill({ json: { saved: true } })
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Review player matches', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Review player matches' })
  await expect(dialog.getByLabel('Player scope')).toHaveValue('roster')
  await expect(dialog.getByText(/On roster - ambiguous/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Review match', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Confirm player link' })).toBeDisabled()
  await expect(dialog.getByText(/Provider birth date: 1990-01-01/)).toBeVisible()
  await dialog.getByLabel('Confirm Sleeper player').selectOption('702')
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const box = await dialog.locator('.modal-box').boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  await dialog.getByRole('button', { name: 'Confirm player link' }).click()
  await expect(dialog.getByRole('status')).toContainText('Future captures use this decision')
  await expect(dialog.getByText('0 matches.')).toBeVisible()
  await dialog.getByLabel('Match status').selectOption('all')
  await expect(dialog.getByText(/Confirmed manually/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Review player matches', exact: true }).click()
  await dialog.getByLabel('Match status').selectOption('all')
  await expect(dialog.getByText(/Confirmed manually/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Change link' }).click()
  await expect(
    dialog.getByText(/Currently linked to Fixture Receiver \(Sleeper 88002\)/),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Confirm player link' })).toBeDisabled()
})

test('a rejected mapping preserves the selected match for correction', async ({ page }) => {
  await page.route('**/api/player-matches?*', (route) =>
    route.fulfill({ json: { rows: [row], total: 1, rosterAvailable: true } }),
  )
  await page.route('**/api/player-matches/link', (route) =>
    route.fulfill({
      status: 409,
      json: { error: 'Another provider row already links to this player.' },
    }),
  )
  await page.route('**/api/player-matches/players?*', (route) =>
    route.fulfill({ json: candidates }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Review player matches', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Review player matches' })
  await dialog.getByRole('button', { name: 'Review match', exact: true }).click()
  await dialog.getByRole('button', { name: 'Search Sleeper players' }).click()
  await dialog.getByLabel('Confirm Sleeper player').selectOption('701')
  await dialog.getByRole('button', { name: 'Confirm player link' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Another provider row')
  await expect(dialog.getByLabel('Confirm Sleeper player')).toHaveValue('701')
  await expect(dialog.getByRole('button', { name: 'Confirm player link' })).toBeEnabled()
})
