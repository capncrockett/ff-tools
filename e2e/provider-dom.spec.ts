import { test, expect } from '@playwright/test'
import { readNerdsRows, parseNerdsRows } from '../src/server/providers/dynastyNerds'
import {
  openDtcLeagueModal,
  readDtcRoster,
  parseDtcRoster,
} from '../src/server/providers/dynastyCalculator'

for (const connected of [false, true]) {
  test(`DTC opens league settings with ${connected ? 'an existing connection and hidden Connect button' : 'no existing connection'}`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.setContent(`
      <div id="league_info_area">
        <div id="league_connect" ${connected ? 'hidden' : ''}>
          <a href="#dtc-integration-modal"><button>Connect a League</button></a>
        </div>
        <div id="edit_league_button" ${connected ? '' : 'hidden'}>
          <a id="edit_league_click" href="#dtc-integration-modal"><span aria-hidden="true">*</span></a>
        </div>
      </div>
      <section data-remodal-id="dtc-integration-modal" hidden><h2>League settings</h2></section>`)
    await page.evaluate(() => {
      for (const link of document.querySelectorAll('a[href="#dtc-integration-modal"]')) {
        link.addEventListener('click', (event) => {
          event.preventDefault()
          // The real site's modal opens after its animation and event handler run.
          setTimeout(() => {
            document.querySelector<HTMLElement>(
              '[data-remodal-id="dtc-integration-modal"]',
            )!.hidden = false
          }, 50)
        })
      }
    })
    if (connected)
      await expect(page.getByRole('button', { name: 'Connect a League', exact: true })).toBeHidden()
    const modal = await openDtcLeagueModal(page)
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading')).toHaveText('League settings')
  })
}

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

test('DTC reads a hidden import table, ignores picks, and fails on unverified scoring', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('dtc_league_id', '1378427936817815552')
    localStorage.setItem('dtc_league_name', 'Fixture League')
  })
  await page.setContent(`
    <select name="sleeper_api_league_id"><option selected value="1378427936817815552" data-my-team-id="82289736559247360">Fixture League - Team</option></select>
    <a class="dtc-leauge-size filter-active" data-id="12"></a>
    <a class="dtc-leauge-type filter-active" data-id="half_ppr"></a>
    <a class="dtc-leauge-format filter-active" data-id="standard"></a>
    <a class="dtc-calculator-mode filter-active" data-id="normal"></a>
    <a class="dtc-te-premium-actions">TE Prem</a>
    <a class="dtc-rb-ppc-premium-actions">RB PPC</a>
    <div class="dtc-devy-actions" data-enabled="0"></div>
    <div class="dtc-offense-actions" data-enabled="1"></div>
    <div class="dtc-idp-actions" data-enabled="0"></div>
    <div hidden class="sleeper_api-import-team-one"><table><tbody>
      <tr><th></th><th>Player</th><th>Pos</th><th>Value</th></tr>
      <tr><td><input data-id="player" value="42"></td><td><span class="mfl-trade-table-player">Example Tight End</span> <span class="mfl-trade-table-team">CHI</span></td><td>ZTE</td><td>0.0</td></tr>
      <tr><td><input data-id="pick" value="pick1"></td><td>2027 1st</td><td>PICK</td><td>40</td></tr>
    </tbody></table></div>`)
  const raw = await readDtcRoster(page)
  expect(parseDtcRoster(raw).records).toEqual([
    { sourceKey: '42', playerName: 'Example Tight End', team: 'CHI', position: 'TE', value: 0 },
  ])
  await page.locator('.dtc-te-premium-actions').evaluate((el) => el.remove())
  expect(() => parseDtcRoster({ ...raw, rules: { ...raw.rules, tepre: NaN } })).toThrow()
  const missingSetting = await readDtcRoster(page)
  expect(() => parseDtcRoster(missingSetting)).toThrow()
})
