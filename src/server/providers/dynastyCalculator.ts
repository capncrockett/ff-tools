import type { AxiosInstance } from 'axios'
import axios from 'axios'
import type { Download, Locator, Page } from 'playwright'
import { z } from 'zod'
import { sleeperLeagueId, sleeperLeagueName, sleeperOwnerId } from '../config.js'
import { loadSleeperPlayers, type CanonicalPlayer } from '../services/players.js'
import { checkAccess, credentials, withProviderPage } from './browser.js'
import { ProviderError, type ProviderSnapshot, type ValueProvider } from './types.js'

const supportedPositions = ['QB', 'RB', 'WR', 'TE'] as const
type SupportedPosition = (typeof supportedPositions)[number]

export type DtcRankingRow = {
  rank: number
  playerName: string
  team: string
  position: SupportedPosition
  age: string
  value: number
}

const sleeperRostersSchema = z.array(
  z
    .object({
      owner_id: z.string(),
      players: z.array(z.string()).nullable().optional(),
    })
    .passthrough(),
)

function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field.length === 0) quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      if (row.some((cell) => cell.length)) rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (quoted) throw new ProviderError('format', 'DTC rankings export contains invalid CSV.')
  row.push(field)
  if (row.some((cell) => cell.length)) rows.push(row)
  return rows
}

export function parseDtcRankingsCsv(
  text: string,
  expectedPosition: SupportedPosition,
): DtcRankingRow[] {
  if (Buffer.byteLength(text, 'utf8') > 1_000_000)
    throw new ProviderError('format', 'DTC rankings export is unexpectedly large.')
  const [header, ...rows] = csvRows(text)
  if (!header || header.join(',') !== 'Rank,Name,Team,Pos,Age,Value')
    throw new ProviderError('format', 'DTC rankings export columns changed. No snapshot saved.')
  const parsed = rows.map((row) => {
    if (row.length !== header.length)
      throw new ProviderError('format', 'DTC rankings export contains an invalid row.')
    const [rankText, playerName, team, position, age, valueText] = row
    const rank = Number(rankText)
    const value = Number(valueText)
    if (
      !Number.isInteger(rank) ||
      rank < 1 ||
      playerName.trim().length < 2 ||
      position !== expectedPosition ||
      !/^\d+(?:\.\d+)?$/.test(valueText) ||
      !Number.isFinite(value) ||
      value < 0
    )
      throw new ProviderError('format', 'DTC rankings export contains an invalid player row.')
    return {
      rank,
      playerName: playerName.trim(),
      team: team.trim(),
      position,
      age: age.trim(),
      value,
    }
  })
  if (!parsed.length)
    throw new ProviderError('format', `DTC ${expectedPosition} rankings export is empty.`)
  if (new Set(parsed.map((row) => row.rank)).size !== parsed.length)
    throw new ProviderError('format', `DTC ${expectedPosition} rankings contain duplicate ranks.`)
  return parsed
}

function normalizeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeNameWithoutSuffix(name: string) {
  return normalizeName(name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, ''))
}

function playerKey(name: string, position: string, removeSuffix = false) {
  const normalized = removeSuffix ? normalizeNameWithoutSuffix(name) : normalizeName(name)
  return `${normalized}:${position}`
}

export function parseDtcAllowedMissingIds(raw = ''): string[] {
  if (!raw.trim()) return []
  const ids = raw.split(',').map((id) => id.trim())
  if (ids.length > 10 || ids.some((id) => !/^\d+$/.test(id)))
    throw new ProviderError(
      'configuration',
      'DTC_ALLOWED_MISSING_SLEEPER_IDS must contain at most 10 comma-separated numeric Sleeper IDs.',
    )
  return [...new Set(ids)]
}

export function buildDtcSnapshot(
  rankings: DtcRankingRow[],
  roster: CanonicalPlayer[],
  now = new Date(),
  allowedMissingSleeperIds: readonly string[] = [],
): ProviderSnapshot {
  const eligibleRoster = roster.filter((player) =>
    supportedPositions.includes(player.position as SupportedPosition),
  )
  if (!eligibleRoster.length)
    throw new ProviderError('format', 'Sleeper returned no eligible players for the owned roster.')

  const rankingsByPlayer = new Map<string, DtcRankingRow[]>()
  const rankingsByPlayerWithoutSuffix = new Map<string, DtcRankingRow[]>()
  for (const row of rankings) {
    for (const [map, key] of [
      [rankingsByPlayer, playerKey(row.playerName, row.position)],
      [rankingsByPlayerWithoutSuffix, playerKey(row.playerName, row.position, true)],
    ] as const)
      map.set(key, [...(map.get(key) ?? []), row])
  }

  const matchedRows = new Set<DtcRankingRow>()
  const missing: CanonicalPlayer[] = []
  const records = eligibleRoster.flatMap((player) => {
    const exact = rankingsByPlayer.get(playerKey(player.name, player.position ?? '')) ?? []
    const candidates = exact.length
      ? exact
      : (rankingsByPlayerWithoutSuffix.get(playerKey(player.name, player.position ?? '', true)) ??
        [])
    if (candidates.length > 1)
      throw new ProviderError('format', `DTC has an ambiguous match for ${player.name}.`)
    const row = candidates[0]
    if (row && matchedRows.has(row))
      throw new ProviderError(
        'format',
        `DTC matched more than one roster player to ${row.playerName}.`,
      )
    if (row) matchedRows.add(row)
    else missing.push(player)
    return row
      ? [
          {
            sourceKey: `sleeper:${player.sleeperId}`,
            sleeperId: player.sleeperId,
            playerName: player.name,
            team: row.team || player.team || null,
            position: row.position,
            value: row.value,
          },
        ]
      : []
  })
  const allowed = new Set(allowedMissingSleeperIds)
  const unexpected = missing.filter((player) => !allowed.has(player.sleeperId))
  const describe = (players: CanonicalPlayer[]) =>
    players
      .map((player) => `${player.name} (${player.position}, Sleeper ${player.sleeperId})`)
      .join('; ')
  if (unexpected.length || !records.length)
    throw new ProviderError(
      'format',
      `DTC rankings matched ${records.length} of ${eligibleRoster.length} owned players. No snapshot saved. Missing: ${describe(missing)}. Review the export and player mapping before allowing a known absence.`,
    )

  return {
    source: 'dynasty-calculator',
    capturedAt: now.toISOString(),
    context: {
      label: `${sleeperLeagueName} / HALF_PPR / STANDARD`,
      settings: {
        leagueId: sleeperLeagueId,
        ownerId: sleeperOwnerId,
        team_size: '12',
        team_type: 'half_ppr',
        team_format: 'standard',
        tepre: 0,
        rbppc: 0,
        devy: 0,
        offense: 1,
        idp: 0,
        mode: 'normal',
        startup_rookie: 'no',
        scope: 'owned-roster',
        metric: 'displayed-trade-value',
      },
    },
    records,
    ...(missing.length
      ? {
          warnings: [
            `DTC coverage: ${records.length} of ${eligibleRoster.length} owned players. Missing DTC values (configured exceptions): ${describe(missing)}. No values were invented for these players.`,
          ],
        }
      : {}),
  }
}

async function waitForActive(control: Locator, expected: boolean) {
  await control.waitFor({ state: 'visible' })
  for (let attempt = 0; attempt < 20; attempt++) {
    const active = (await control.getAttribute('class'))?.split(/\s+/).includes('active') ?? false
    if (active === expected) return
    await control.page().waitForTimeout(100)
  }
  throw new ProviderError('format', 'DTC did not apply the requested ranking settings.')
}

async function setActive(control: Locator, expected: boolean) {
  await control.waitFor({ state: 'visible' })
  const active = (await control.getAttribute('class'))?.split(/\s+/).includes('active') ?? false
  if (active !== expected) await control.click()
  await waitForActive(control, expected)
}

async function verifyExclusive(page: Page, selector: string, expectedId: string) {
  const activeIds = await page
    .locator(`${selector}:visible`)
    .evaluateAll((controls) =>
      controls
        .filter((control) => control.classList.contains('active'))
        .map((control) => control.getAttribute('data-id')),
    )
  if (activeIds.length !== 1 || activeIds[0] !== expectedId)
    throw new ProviderError('format', 'DTC did not retain the requested ranking settings.')
}

export async function verifyDtcRankingSettings(page: Page) {
  await verifyExclusive(page, '.dtc-top-team-size', '12')
  await verifyExclusive(page, '.dtc-top-team-type', 'half_ppr')
  await verifyExclusive(page, '.dtc-top-team-format', 'standard')
  const extras = [
    ['top-offense-format-field', true],
    ['top-idp-format-field', false],
    ['top-devy-format-field', false],
    ['top-tepre-format-field', false],
    ['top-rbppc-format-field', false],
  ] as const
  for (const [id, expected] of extras) {
    const control = page.locator(`.dtc-top-extra[data-id="${id}"]:visible`).first()
    await waitForActive(control, expected)
  }
}

export async function configureDtcRankingSettings(page: Page) {
  const choose = async (selector: string, id: string) => {
    const control = page.locator(`${selector}[data-id="${id}"]:visible`).first()
    await setActive(control, true)
  }
  await choose('.dtc-top-team-size', '12')
  await choose('.dtc-top-team-type', 'half_ppr')
  await choose('.dtc-top-team-format', 'standard')
  await setActive(
    page.locator('.dtc-top-extra[data-id="top-offense-format-field"]:visible').first(),
    true,
  )
  for (const id of [
    'top-idp-format-field',
    'top-devy-format-field',
    'top-tepre-format-field',
    'top-rbppc-format-field',
  ])
    await setActive(page.locator(`.dtc-top-extra[data-id="${id}"]:visible`).first(), false)
  await page.waitForTimeout(1_500)
  await verifyDtcRankingSettings(page)
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  if (!stream) throw new ProviderError('format', 'DTC rankings download was unavailable.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_000_000) {
      stream.destroy()
      throw new ProviderError('format', 'DTC rankings export is unexpectedly large.')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function downloadDtcRankingExports(page: Page): Promise<DtcRankingRow[]> {
  const rows: DtcRankingRow[] = []
  for (const position of supportedPositions) {
    const tab = page
      .locator(`.rank-tab-button[data-id="${position}"]:visible`)
      .filter({ hasText: new RegExp(`^\\s*${position}\\s*$`) })
      .first()
    await setActive(tab, true)
    await page.waitForTimeout(250)
    await verifyDtcRankingSettings(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.dtc-top-export-excel:visible').first().click(),
    ])
    rows.push(...parseDtcRankingsCsv(await downloadText(download), position))
  }
  return rows
}

export async function fetchOwnedSleeperRoster(
  leagueId: string,
  ownerId: string,
  options?: { http?: AxiosInstance; catalog?: CanonicalPlayer[] },
): Promise<CanonicalPlayer[]> {
  let raw: unknown
  try {
    raw = (
      await (options?.http ?? axios).get(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, {
        timeout: 20_000,
      })
    ).data
  } catch {
    throw new ProviderError('unavailable', 'Sleeper roster refresh failed. No snapshot saved.')
  }
  const parsed = sleeperRostersSchema.safeParse(raw)
  if (!parsed.success)
    throw new ProviderError('format', 'Sleeper roster response changed. No snapshot saved.')
  const playerIds = parsed.data.find((roster) => roster.owner_id === ownerId)?.players
  if (!playerIds?.length)
    throw new ProviderError('configuration', 'Sleeper did not return the configured owned roster.')
  let catalog = options?.catalog
  if (!catalog) {
    try {
      catalog = await loadSleeperPlayers()
    } catch {
      throw new ProviderError(
        'unavailable',
        'Sleeper player metadata refresh failed. No snapshot saved.',
      )
    }
  }
  const byId = new Map(catalog.map((player) => [player.sleeperId, player]))
  const players = playerIds.map((id) => byId.get(id)).filter(Boolean) as CanonicalPlayer[]
  if (players.length !== playerIds.length)
    throw new ProviderError('format', 'Sleeper player metadata is incomplete. No snapshot saved.')
  return players
}

async function signInIfNeeded(page: Page) {
  if (!/wp-login|pricing/.test(page.url()) && !(await page.locator('#user_login').isVisible()))
    return
  const login = credentials('DYNASTY_CALC')
  await page.goto('https://dynastytradecalculator.com/wp-login.php', {
    waitUntil: 'domcontentloaded',
  })
  await checkAccess(page)
  await page.locator('#user_login').fill(login.email)
  await page.locator('#user_pass').fill(login.password)
  await page.locator('#wp-submit').click()
  await page
    .waitForURL((url) => !url.pathname.includes('wp-login'), { timeout: 20_000 })
    .catch(() => {})
  if (page.url().includes('wp-login'))
    throw new ProviderError(
      'login',
      'DTC sign-in needs attention. Open the site and complete sign-in manually.',
    )
}

export const dynastyCalculatorProvider: ValueProvider = {
  name: 'dynasty-calculator',
  tracksSleeperRoster: true,
  needsSleeperRoster: true,
  async run(options = {}) {
    const allowedMissingIds = parseDtcAllowedMissingIds(process.env.DTC_ALLOWED_MISSING_SLEEPER_IDS)
    if (!/^\d+$/.test(sleeperLeagueId) || !/^\d+$/.test(sleeperOwnerId))
      throw new ProviderError('configuration', 'Sleeper league and owner IDs must be numeric.')
    const roster =
      options.sleeperRoster ?? (await fetchOwnedSleeperRoster(sleeperLeagueId, sleeperOwnerId))
    return withProviderPage('dynasty-calculator', options.headless !== false, async (page) => {
      let stage = 'opening the rankings page'
      try {
        await page.goto('https://dynastytradecalculator.com/dynasty-rankings-2/', {
          waitUntil: 'domcontentloaded',
        })
        await checkAccess(page)
        stage = 'signing in'
        await signInIfNeeded(page)
        if (!page.url().includes('/dynasty-rankings-2/')) {
          stage = 'opening the rankings page after sign-in'
          await page.goto('https://dynastytradecalculator.com/dynasty-rankings-2/', {
            waitUntil: 'domcontentloaded',
          })
        }
        await checkAccess(page)
        const announcement = page.locator('.pum-active .pum-close')
        if (await announcement.isVisible()) await announcement.click()
        stage = 'selecting 12-team half-PPR standard settings'
        await configureDtcRankingSettings(page)
        stage = 'downloading the position rankings'
        const rankings = await downloadDtcRankingExports(page)
        stage = 'matching rankings to the Sleeper roster'
        return buildDtcSnapshot(rankings, roster, new Date(), allowedMissingIds)
      } catch (error) {
        if (error instanceof ProviderError) throw error
        throw new ProviderError(
          'format',
          `DTC stopped while ${stage}. No snapshot saved; existing history is still available.`,
        )
      }
    })
  },
}
