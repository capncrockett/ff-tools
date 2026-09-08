import { test, expect } from '@playwright/test'
import { readNerdsRows, parseNerdsRows } from '../src/server/providers/dynastyNerds'
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
