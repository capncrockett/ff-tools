import { test, expect } from '@playwright/test'
import { sleeperLeagueId } from '../src/server/config'
import {
  captureNerdsPage,
  readNerdsRows,
  parseNerdsRows,
} from '../src/server/providers/dynastyNerds'
import {
  configureDtcRankingSettings,
  downloadDtcRankingExports,
  verifyDtcRankingSettings,
} from '../src/server/providers/dynastyCalculator'

test('Dynasty GM reads values for players with initials and rejects truncated rosters', async ({
  page,
}) => {
  await page.goto('/')
  await page.setContent(`<div><div dir="auto">Example Quarterback</div><div dir="auto">(LAC)</div><div dir="auto">2,624</div><div dir="auto">(QB7)</div></div>
    <section><div><div dir="auto">Example Receiver</div><div dir="auto">(FA)</div><div dir="auto">0</div><div dir="auto">(NR)</div></div></section>`)
  const players = [
    { id: 1, firstName: 'Example', lastName: 'Quarterback', pos: 'QB', team: 'LAC' },
    { id: 2, firstName: 'Example', lastName: 'Receiver', pos: 'WR', team: null },
  ]
  const rows = await readNerdsRows(
    page,
    players.map((p) => ({ id: String(p.id), name: p.firstName + ' ' + p.lastName })),
  )
  const metadata = {
    valueSet: 'DynastyGM',
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    leagues: [
      {
        id: 273947,
        extId: '1378427936817815552',
        name: 'Fixture League',
        scoringType: 'ppr',
        fantasyType: 'dynasty',
        number_of_teams: 12,
        number_of_starters: 8,
        rosterPositions: ['QB', 'WR'],
        teams: [
          {
            id: 2982100,
            name: 'Example Team',
            sleeperUsername: 'Example',
            owned: true,
            starters: [1],
            bench: [2],
            taxi: [],
            ir: [],
          },
        ],
      },
    ],
  }
  const result = parseNerdsRows(rows, metadata, '273947')
  expect(result.records.map((r) => r.value)).toEqual([2624, 0])
  expect(() => parseNerdsRows(rows.slice(0, 1), metadata, '273947')).toThrow('incomplete')
})

test('Dynasty GM captures the owned roster when the account also holds an incomplete league', async ({
  page,
}) => {
  // Every request outside the routed fixture site is aborted, so this never reaches Dynasty GM.
  const unexpected: string[] = []
  await page.context().route('**/*', (route) => {
    unexpected.push(new URL(route.request().url()).host)
    return route.abort()
  })
  const teamId = Number(process.env.DYNASTY_NERDS_TEAM_ID || 2982100)
  const init = {
    valueSet: 'DynastyGM',
    players: {
      '1': {
        id: 1,
        firstName: 'Fixture',
        lastName: 'Quarterback',
        pos: 'QB',
        team: 'LAC',
        dob: '1999-02-03',
        draftYear: 2021,
      },
      '2': { id: 2, firstName: 'Fixture', lastName: 'Receiver', pos: 'WR', team: null },
      // Not on the team: the catalog still carries it, along with odd values from the live site.
      '3': {
        id: 3,
        firstName: 'Fixture',
        lastName: 'Kicker',
        pos: 'K',
        team: null,
        dob: 'NaN-NaN-NaN',
      },
    },
    leagues: [
      {
        id: 273947,
        extId: sleeperLeagueId,
        name: 'Fixture League',
        scoringType: 'ppr',
        fantasyType: 'dynasty',
        number_of_teams: 12,
        number_of_starters: 8,
        rosterPositions: ['QB', 'WR'],
        teams: [
          {
            id: teamId,
            name: 'Fixture Team',
            owned: true,
            sleeperUsername: 'FixtureOwner',
            starters: [1],
            bench: [2],
            taxi: [],
            ir: [],
          },
          {
            id: 99,
            name: 'Orphan',
            sleeperUsername: null,
            starters: [],
            bench: [],
            taxi: [],
            ir: [],
          },
        ],
      },
      // The shape that broke live capture on 2026-09-13: null counts, positions, and usernames.
      {
        id: 147139,
        extId: 'other-league',
        name: 'Other League',
        scoringType: 'ppr',
        fantasyType: 'dynasty',
        number_of_teams: null,
        number_of_starters: null,
        rosterPositions: null,
        teams: [
          {
            id: 1,
            name: 'Other',
            sleeperUsername: null,
            starters: [],
            bench: [],
            taxi: [],
            ir: [],
          },
        ],
      },
    ],
  }
  await page.route('https://gm3.dynastynerds.com/api/gm/init-2', (route) =>
    route.fulfill({
      json: init,
      headers: { 'access-control-allow-origin': 'https://app.dynastynerds.com' },
    }),
  )
  await page.route('https://app.dynastynerds.com/analyzer/273947', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><main id="app">Loading</main><script>
        fetch('https://gm3.dynastynerds.com/api/gm/init-2').then((r) => r.json()).then(() => {
          const app = document.getElementById('app')
          app.innerHTML = '<div>Dynasty GM</div><div>League</div><button>FixtureOwner</button>'
          app.querySelector('button').addEventListener('click', () => {
            app.insertAdjacentHTML('beforeend', '<h2>Quarterbacks</h2>' +
              '<div><div dir="auto">Fixture Quarterback</div><div dir="auto">(LAC)</div><div dir="auto">2,624</div><div dir="auto">(QB7)</div></div>' +
              '<div><div dir="auto">Fixture Receiver</div><div dir="auto">(FA)</div><div dir="auto">310</div><div dir="auto">(WR40)</div></div>')
          })
        })
      </script>`,
    }),
  )

  const result = await captureNerdsPage(page, '273947', [
    { sleeperId: '101', name: 'Fixture Quarterback', position: 'QB', team: 'LAC' },
    { sleeperId: '102', name: 'Fixture Receiver', position: 'WR' },
  ])
  expect(result.records.map((r) => [r.sleeperId, r.value])).toEqual([
    ['101', 2624],
    ['102', 310],
  ])
  expect(result.warnings).toBeUndefined()
  // The same response's full player list comes back for the Dynasty GM player table.
  expect(result.catalog).toMatchObject({
    source: 'dynasty-nerds',
    players: expect.arrayContaining([
      expect.objectContaining({ id: 1, dob: '1999-02-03', draftYear: 2021 }),
      expect.objectContaining({ id: 3, pos: 'K', dob: 'NaN-NaN-NaN' }),
    ]),
  })
  expect(unexpected).toEqual([])
})

test('DTC selects and verifies half-PPR before downloading every position export', async ({
  page,
}) => {
  await page.goto('/')
  await page.setContent(`
    <div class="sizes">
      <a class="dtc-top-team-size active" data-id="10">10</a>
      <a class="dtc-top-team-size" data-id="12">12</a>
    </div>
    <div class="scoring">
      <a class="dtc-top-team-type active" data-id="ppr">PPR</a>
      <a class="dtc-top-team-type" data-id="half_ppr">.5 PPR</a>
      <a class="dtc-top-team-type" data-id="nonppr">Standard scoring</a>
    </div>
    <div class="formats">
      <a class="dtc-top-team-format" data-id="standard">Standard</a>
      <a class="dtc-top-team-format active" data-id="sf">Superflex</a>
    </div>
    <a class="dtc-top-extra" data-id="top-offense-format-field">Offense</a>
    <a class="dtc-top-extra active" data-id="top-idp-format-field">IDP</a>
    <a class="dtc-top-extra active" data-id="top-devy-format-field">Devy</a>
    <a class="dtc-top-extra active" data-id="top-tepre-format-field">TE Prem</a>
    <a class="dtc-top-extra active" data-id="top-rbppc-format-field">RB PPC</a>
    <div class="ranking-tabs">
      <a class="rank-tab-button" data-id="QB">QB</a>
      <a class="rank-tab-button" data-id="QB">Rookie QB</a>
      <a class="rank-tab-button" data-id="RB">RB</a>
      <a class="rank-tab-button" data-id="WR">WR</a>
      <a class="rank-tab-button" data-id="TE">TE</a>
    </div>
    <a class="dtc-top-export-excel" download="rankings.csv">Export</a>`)
  await page.evaluate(() => {
    ;(window as typeof window & { halfPprClicks: number }).halfPprClicks = 0
    for (const selector of ['.sizes', '.scoring', '.formats', '.ranking-tabs']) {
      const group = document.querySelector(selector)!
      for (const control of group.children) {
        control.addEventListener('click', () => {
          for (const peer of group.children) peer.classList.remove('active')
          control.classList.add('active')
          if (control.getAttribute('data-id') === 'half_ppr')
            (window as typeof window & { halfPprClicks: number }).halfPprClicks++
        })
      }
    }
    for (const control of document.querySelectorAll('.dtc-top-extra'))
      control.addEventListener('click', () => control.classList.toggle('active'))
    document.querySelector('.dtc-top-export-excel')!.addEventListener('click', function () {
      const position = document.querySelector('.ranking-tabs .active')!.getAttribute('data-id')!
      const csv = `"Rank","Name","Team","Pos","Age","Value"\n"1","Fixture ${position}","FA","${position}","24","0.0"`
      this.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`)
    })
  })

  await configureDtcRankingSettings(page)
  await verifyDtcRankingSettings(page)
  expect(
    await page.evaluate(() => (window as typeof window & { halfPprClicks: number }).halfPprClicks),
  ).toBe(1)
  await expect(page.locator('.dtc-top-team-type[data-id="ppr"]')).not.toHaveClass(/active/)
  await expect(page.getByText('.5 PPR', { exact: true })).toHaveClass(/active/)

  const rows = await downloadDtcRankingExports(page)
  expect(rows.map((row) => [row.playerName, row.position, row.value])).toEqual([
    ['Fixture QB', 'QB', 0],
    ['Fixture RB', 'RB', 0],
    ['Fixture WR', 'WR', 0],
    ['Fixture TE', 'TE', 0],
  ])
  await expect(page.getByText('Rookie QB', { exact: true })).not.toHaveClass(/active/)
})
