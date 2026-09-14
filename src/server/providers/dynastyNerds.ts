import type { Page } from 'playwright'
import { z } from 'zod'
import type { Observation } from '../../shared/tracker.js'
import { playerIdentityKey } from '../../shared/playerIdentity.js'
import type { CanonicalPlayer } from '../services/players.js'
import { sleeperLeagueId } from '../config.js'
import { checkAccess, credentials, withProviderPage } from './browser.js'
import { ProviderError, type ProviderSnapshot, type ValueProvider } from './types.js'

const playerSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  pos: z.string(),
  team: z.string().nullable(),
})
const teamSchema = z.object({
  id: z.number(),
  name: z.string(),
  owned: z.boolean().optional(),
  sleeperUsername: z.string(),
  starters: z.array(z.number()),
  bench: z.array(z.number()),
  taxi: z.array(z.number()),
  ir: z.array(z.number()),
})
const leagueSchema = z.object({
  id: z.number(),
  extId: z.string(),
  name: z.string(),
  scoringType: z.string(),
  fantasyType: z.string(),
  number_of_teams: z.number(),
  number_of_starters: z.number(),
  rosterPositions: z.array(z.string()),
  teams: z.array(z.object({ id: z.number(), owned: z.boolean().optional() }).passthrough()),
})
// The account can hold other leagues, and a league can hold orphaned teams, with incomplete
// metadata (null team counts or usernames). Only the configured league and team are validated
// strictly. The player catalog stays strict, because it decides whether an unmatched Sleeper player
// is a stale mirror or a name mismatch.
const initSchema = z.object({
  players: z.record(playerSchema),
  valueSet: z.string(),
  leagues: z.array(z.object({ id: z.number() }).passthrough()),
})
export type NerdsInit = z.infer<typeof initSchema>
export type NerdsRow = { sourceKey: string; text: string }

function configuredTeam(init: NerdsInit, leagueId: string) {
  const raw = init.leagues.find((l) => String(l.id) === leagueId)
  if (!raw)
    throw new ProviderError(
      'configuration',
      'Configured Dynasty GM league is not available to this account.',
    )
  const parsedLeague = leagueSchema.safeParse(raw)
  if (!parsedLeague.success)
    throw new ProviderError('format', 'Dynasty GM league metadata changed. No snapshot saved.')
  const league = parsedLeague.data
  const teams = league.teams.filter((t) =>
    process.env.DYNASTY_NERDS_TEAM_ID
      ? String(t.id) === process.env.DYNASTY_NERDS_TEAM_ID
      : t.owned,
  )
  if (teams.length !== 1)
    throw new ProviderError(
      'configuration',
      'Select exactly one owned Dynasty GM team with DYNASTY_NERDS_TEAM_ID.',
    )
  const team = teamSchema.safeParse(teams[0])
  if (!team.success)
    throw new ProviderError('format', 'Dynasty GM team metadata changed. No snapshot saved.')
  return { league, team: team.data }
}

export async function readNerdsRows(
  page: Page,
  candidates: { id: string; name: string }[],
): Promise<NerdsRow[]> {
  // Some players render initials instead of a headshot. The name and four-line value row are consistent.
  return page.locator('div[dir="auto"]').evaluateAll((elements, players) => {
    const found = new Map<string, { sourceKey: string; text: string }>()
    for (const element of elements) {
      const matches = players.filter((p) => p.name === element.textContent?.trim())
      // A duplicate display name is ambiguous, so leave it for the completeness guard to reject.
      if (matches.length !== 1) continue
      let row: HTMLElement | null = element as HTMLElement
      for (let i = 0; row && i < 7; i++, row = row.parentElement) {
        const text = row.innerText.trim()
        if (text.split('\n').length === 4 && /\((?:[A-Z]+\d+|NR)\)$/.test(text)) {
          found.set(matches[0].id, { sourceKey: matches[0].id, text })
          break
        }
      }
    }
    return [...found.values()]
  }, candidates)
}

export function parseNerdsRows(
  rows: NerdsRow[],
  rawInit: unknown,
  leagueId: string,
  now = new Date(),
  sleeperRoster?: CanonicalPlayer[],
): ProviderSnapshot {
  const parsedInit = initSchema.safeParse(rawInit)
  if (!parsedInit.success)
    throw new ProviderError('format', 'Dynasty GM player metadata changed. No snapshot saved.')
  const init = parsedInit.data
  const { league, team } = configuredTeam(init, leagueId)
  if (league.extId !== sleeperLeagueId)
    throw new ProviderError(
      'configuration',
      'Dynasty GM returned another Sleeper league. No snapshot saved.',
    )
  if (
    [...team.starters, ...team.bench, ...team.taxi, ...team.ir].some(
      (id) => !init.players[String(id)],
    )
  )
    throw new ProviderError(
      'format',
      'Dynasty GM player metadata is incomplete. No snapshot saved.',
    )
  const expected = new Set(
    [...team.starters, ...team.bench, ...team.taxi, ...team.ir].filter((id) =>
      ['QB', 'RB', 'WR', 'TE'].includes(init.players[String(id)]?.pos),
    ),
  )
  const records: Observation[] = []
  for (const row of rows) {
    if (!expected.has(Number(row.sourceKey))) continue
    const p = init.players[row.sourceKey]
    // The actual analyzer row displays name, NFL team, TRADE VALUE, then rank. Never read init.values as trade value.
    const match = row.text
      .trim()
      .match(/^(.+?)\s*\n\(([A-Za-z]+)\)\s*\n([\d,]+(?:\.\d+)?)\s*\n\((?:[A-Z]+\d+|NR)\)$/)
    if (!match)
      throw new ProviderError(
        'format',
        `Dynasty GM value row changed for ${p.firstName} ${p.lastName}. No snapshot saved.`,
      )
    records.push({
      sourceKey: row.sourceKey,
      playerName: `${p.firstName} ${p.lastName}`,
      position: p.pos as Observation['position'],
      team: p.team,
      value: Number(match[3].replaceAll(',', '')),
    })
  }
  if (
    !records.length ||
    records.length !== expected.size ||
    new Set(records.map((r) => r.sourceKey)).size !== expected.size
  )
    throw new ProviderError('format', 'Dynasty GM roster capture is incomplete. No snapshot saved.')

  if (sleeperRoster) matchSleeperRoster(records, init, sleeperRoster)
  return {
    source: 'dynasty-nerds',
    capturedAt: now.toISOString(),
    context: {
      label: `${league.name} / ${league.scoringType.toUpperCase()} / ${team.name}`,
      settings: {
        leagueId: league.extId,
        analyzerId: league.id,
        teamId: team.id,
        scoring: league.scoringType,
        fantasyType: league.fantasyType,
        teams: league.number_of_teams,
        starters: league.number_of_starters,
        roster: league.rosterPositions.join(','),
        valueSet: init.valueSet,
        scope: 'owned-roster',
        metric: 'displayed-trade-value',
      },
    },
    records,
  }
}

// Dynasty GM's owned team mirrors the Sleeper roster, so each Sleeper player is matched only among
// that team's players. The full catalog repeats names (16 shared name-and-position pairs on
// 2026-09-13), so it is used only to tell a stale mirror from a name mismatch. It covers the whole
// player pool, so a player it lacks is a matching failure, never a zero (user, 2026-09-13).
function matchSleeperRoster(
  records: Observation[],
  init: NerdsInit,
  sleeperRoster: CanonicalPlayer[],
) {
  const nameKey = (
    p: { firstName: string; lastName: string; pos: string },
    removeSuffix: boolean,
  ) => playerIdentityKey(`${p.firstName} ${p.lastName}`, p.pos, removeSuffix)
  const sleeperKey = (player: CanonicalPlayer, removeSuffix: boolean) =>
    playerIdentityKey(player.name, player.position ?? '', removeSuffix)
  const eligible = sleeperRoster.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position ?? ''))
  const unmatched: CanonicalPlayer[] = []
  for (const player of eligible) {
    const find = (removeSuffix: boolean) =>
      records.filter(
        (record) =>
          nameKey(init.players[record.sourceKey], removeSuffix) ===
          sleeperKey(player, removeSuffix),
      )
    const exact = find(false)
    const candidates = exact.length ? exact : find(true)
    if (candidates.length > 1 || candidates[0]?.sleeperId)
      throw new ProviderError(
        'format',
        `Dynasty GM has an ambiguous match for ${player.name} on the owned roster. No snapshot saved.`,
      )
    if (candidates[0]) candidates[0].sleeperId = player.sleeperId
    else unmatched.push(player)
  }
  const describe = (players: CanonicalPlayer[]) =>
    players.map((player) => `${player.name} (${player.position})`).join('; ')
  if (eligible.length && unmatched.length === eligible.length)
    throw new ProviderError(
      'format',
      `Dynasty GM's roster matched none of the ${eligible.length} owned Sleeper players. No snapshot saved. Review player names before retrying.`,
    )
  const catalog = Object.values(init.players)
  const mismatched = unmatched.filter(
    (player) =>
      !catalog.some((candidate) =>
        [false, true].some(
          (removeSuffix) => nameKey(candidate, removeSuffix) === sleeperKey(player, removeSuffix),
        ),
      ),
  )
  if (mismatched.length)
    throw new ProviderError(
      'format',
      `Dynasty GM has no player named like ${describe(mismatched)}. Its catalog covers the whole player pool, so the name or position differs from Sleeper and needs a matching fix. No snapshot saved.`,
    )
  // Otherwise the mirror is behind: a new Sleeper player is not on the team yet, or a departed one
  // still is. Dynasty GM syncs on its own schedule, so this is temporary, not a parser failure.
  const departed = records.filter((record) => !record.sleeperId)
  if (unmatched.length || departed.length)
    throw new ProviderError(
      'unavailable',
      `Dynasty GM's roster does not match Sleeper yet${unmatched.length ? `; not on its roster: ${describe(unmatched)}` : ''}${departed.length ? `; no longer on the Sleeper roster: ${departed.map((record) => `${record.playerName} (${record.position})`).join('; ')}` : ''}. It may still be syncing a recent move. No snapshot saved.`,
    )
}

// The page flow, separate from browser launch and session storage so it can run against fixtures.
export async function captureNerdsPage(
  page: Page,
  leagueId: string,
  sleeperRoster?: CanonicalPlayer[],
): Promise<ProviderSnapshot> {
  let init: NerdsInit | undefined
  let initChanged = false
  const pending: Promise<void>[] = []
  page.on('response', (r) => {
    if (r.url().split('?')[0] !== 'https://gm3.dynastynerds.com/api/gm/init-2' || !r.ok()) return
    pending.push(
      (async () => {
        // The app can request this more than once; keep the latest readable response.
        const parsed = initSchema.safeParse(await r.json().catch(() => null))
        if (parsed.success) init = parsed.data
        else initChanged = true
      })(),
    )
  })
  await page.goto(`https://app.dynastynerds.com/analyzer/${leagueId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByText(/^dynasty gm$/i)
    .or(page.getByRole('button', { name: /^log in$/i }))
    .waitFor({ timeout: 30_000 })
  await checkAccess(page)
  if (page.url().includes('sign-in')) {
    const login = credentials('DYNASTY_NERDS')
    if (page.url().startsWith('https://app.dynastynerds.com/'))
      await page.getByRole('button', { name: /^log in$/i }).click()
    await page.getByText('Continue with Email', { exact: true }).click()
    await page.getByText('Use password instead', { exact: true }).click()
    await page.locator('input[type=email]').fill(login.email)
    await page.locator('input[type=password]').fill(login.password)
    await page.getByRole('button', { name: /^log in$/i }).click()
    await page
      .waitForURL('https://app.dynastynerds.com/home/**', { timeout: 30_000 })
      .catch(() => {})
    await checkAccess(page)
    if (
      !page.url().startsWith('https://app.dynastynerds.com/') ||
      /sign-in|callback/.test(page.url())
    )
      throw new ProviderError(
        'login',
        'Dynasty GM sign-in needs attention. Open the site and complete sign-in manually.',
      )
    await page.goto(`https://app.dynastynerds.com/analyzer/${leagueId}`, {
      waitUntil: 'domcontentloaded',
    })
  }
  await page.getByText(/^dynasty gm$/i).waitFor()
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('League') || document.body.innerText.includes('DYNASTY -'),
    {},
    { timeout: 20_000 },
  )
  await Promise.all(pending)
  const metadata = init as NerdsInit | undefined
  if (!metadata)
    throw new ProviderError(
      'format',
      initChanged
        ? 'Dynasty GM player metadata changed. No snapshot saved.'
        : 'Dynasty GM league metadata was unavailable. No snapshot saved.',
    )
  const { team } = configuredTeam(metadata, leagueId)
  if (!(await page.getByText(/^quarterbacks$/i).isVisible()))
    await page.getByText(team.sleeperUsername, { exact: true }).last().click()
  await page.getByText(/^quarterbacks$/i).waitFor()
  const candidates = [...new Set([...team.starters, ...team.bench, ...team.taxi, ...team.ir])]
    .map((id) => metadata.players[String(id)])
    .filter((p) => p && ['QB', 'RB', 'WR', 'TE'].includes(p.pos))
    .map((p) => ({ id: String(p.id), name: `${p.firstName} ${p.lastName}` }))
  const rows = await readNerdsRows(page, candidates)
  return parseNerdsRows(rows, metadata, leagueId, new Date(), sleeperRoster)
}

export const dynastyNerdsProvider: ValueProvider = {
  name: 'dynasty-nerds',
  tracksSleeperRoster: true,
  async run(options = {}) {
    const leagueId = process.env.DYNASTY_NERDS_LEAGUE_ID || '273947'
    if (!/^\d+$/.test(leagueId))
      throw new ProviderError(
        'configuration',
        'DYNASTY_NERDS_LEAGUE_ID must be a numeric analyzer ID.',
      )
    return withProviderPage('dynasty-nerds', options.headless !== false, (page) =>
      captureNerdsPage(page, leagueId, options.sleeperRoster),
    )
  },
}
