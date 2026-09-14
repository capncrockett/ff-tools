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
// strictly. The player catalog stays strict: an unreadable entry must never look like an
// unlisted player worth zero.
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

  // A player missing from a rendered roster is not necessarily absent from the platform.
  // Only apply the user's zero rule when the validated player catalog has no match.
  const missing: CanonicalPlayer[] = []
  const catalog = Object.values(init.players)
  const matchedIds = new Set<number>()
  for (const player of sleeperRoster ?? []) {
    if (!['QB', 'RB', 'WR', 'TE'].includes(player.position ?? '')) continue
    const candidatesFor = (removeSuffix: boolean) =>
      catalog.filter(
        (candidate) =>
          playerIdentityKey(
            `${candidate.firstName} ${candidate.lastName}`,
            candidate.pos,
            removeSuffix,
          ) === playerIdentityKey(player.name, player.position ?? '', removeSuffix),
      )
    const exact = candidatesFor(false)
    const candidates = exact.length ? exact : candidatesFor(true)
    if (candidates.length > 1 || (candidates[0] && matchedIds.has(candidates[0].id)))
      throw new ProviderError(
        'format',
        `Dynasty GM has an ambiguous match for ${player.name}. No snapshot saved.`,
      )
    const candidate = candidates[0]
    if (candidate) {
      matchedIds.add(candidate.id)
      const record = records.find((row) => row.sourceKey === String(candidate.id))
      // Dynasty GM mirrors the Sleeper league on its own schedule, so a prompt capture after a
      // roster move can see its older copy. That is temporary, not a parser failure.
      if (!record)
        throw new ProviderError(
          'unavailable',
          `Dynasty GM lists ${player.name}, but not on its copy of the owned roster yet. It may still be syncing a recent Sleeper move. No snapshot saved.`,
        )
      record.sleeperId = player.sleeperId
    } else {
      missing.push(player)
      records.push({
        sourceKey: `absent:sleeper:${player.sleeperId}`,
        sleeperId: player.sleeperId,
        playerName: player.name,
        position: player.position as Observation['position'],
        team: player.team ?? null,
        value: 0,
      })
    }
  }
  // A total miss signals changed catalog names, not a roster the platform stopped listing.
  if (missing.length && !matchedIds.size)
    throw new ProviderError(
      'format',
      `Dynasty GM catalog matched none of the ${missing.length} owned Sleeper players. No snapshot saved. Review player names before retrying.`,
    )
  // A player Dynasty GM still rosters but Sleeper does not is the other sign of a stale copy.
  // Saving here could also pair a zero for a new player with a value for a departed one.
  const departed = sleeperRoster ? records.filter((record) => !record.sleeperId) : []
  if (departed.length)
    throw new ProviderError(
      'unavailable',
      `Dynasty GM roster does not match Sleeper yet: ${departed.map((record) => record.playerName).join('; ')} ${departed.length === 1 ? 'is' : 'are'} not on the Sleeper roster. It may still be syncing a recent move; if this persists, check for a name or position difference. No snapshot saved.`,
    )
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
    ...(missing.length
      ? {
          warnings: [
            `Dynasty GM: ${missing.length} unlisted player${missing.length === 1 ? '' : 's'} valued at 0 by the tracker rule: ${missing.map((player) => `${player.name} (${player.position}, Sleeper ${player.sleeperId})`).join('; ')}.`,
          ],
        }
      : {}),
  }
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
