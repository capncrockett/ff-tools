import type { Page } from 'playwright'
import { z } from 'zod'
import type { SnapshotInput } from '../../shared/tracker.js'
import { checkAccess, credentials, withProviderPage } from './browser.js'
import { ProviderError, type ValueProvider } from './types.js'

export const dtcRosterSchema = z.object({
  leagueId: z.string(),
  leagueName: z.string().min(1),
  ownerId: z.string().regex(/^\d+$/),
  rules: z.object({
    team_size: z.string(),
    team_type: z.string(),
    team_format: z.string(),
    tepre: z.number(),
    rbppc: z.number(),
    devy: z.number(),
    offense: z.number(),
    idp: z.number(),
    mode: z.string(),
    startup_rookie: z.string(),
  }),
  rows: z
    .array(
      z.object({
        sourceKey: z.string().regex(/^\d+$/),
        playerName: z.string().min(2),
        team: z.string(),
        position: z.enum(['QB', 'RB', 'WR', 'ZTE']),
        valueText: z.string().regex(/^\d+(\.\d+)?$/),
      }),
    )
    .min(1),
})
export type DtcRoster = z.infer<typeof dtcRosterSchema>
export function parseDtcRoster(raw: unknown, now = new Date()): SnapshotInput {
  const { leagueId, leagueName, ownerId, rules, rows } = dtcRosterSchema.parse(raw)
  if (leagueId !== (process.env.SLEEPER_LEAGUE_ID || '1378427936817815552'))
    throw new ProviderError('configuration', 'DTC returned another league. No snapshot saved.')
  if (ownerId !== (process.env.SLEEPER_USER_ID || '82289736559247360'))
    throw new ProviderError('configuration', 'DTC returned another owner. No snapshot saved.')
  if (
    !['10', '12', '14', '16'].includes(rules.team_size) ||
    !['ppr', 'half_ppr', 'nonppr'].includes(rules.team_type) ||
    !['standard', 'sf', '2qb'].includes(rules.team_format) ||
    rules.mode !== 'normal' ||
    rules.offense !== 1 ||
    rules.devy !== 0 ||
    rules.idp !== 0 ||
    ![rules.tepre, rules.rbppc].every((n) => n === 0 || n === 1)
  )
    throw new ProviderError('format', 'DTC scoring settings could not be verified.')
  if (new Set(rows.map((r) => r.sourceKey)).size !== rows.length)
    throw new ProviderError('format', 'DTC roster contains duplicate player IDs.')
  return {
    source: 'dynasty-calculator',
    capturedAt: now.toISOString(),
    context: {
      label: `${leagueName} / ${rules.team_type.toUpperCase()} / ${rules.team_format.toUpperCase()}`,
      settings: {
        leagueId,
        ownerId,
        ...rules,
        scope: 'owned-roster',
        metric: 'displayed-trade-value',
      },
    },
    records: rows.map((r) => ({
      sourceKey: r.sourceKey,
      playerName: r.playerName,
      team: r.team || null,
      position: r.position === 'ZTE' ? 'TE' : r.position,
      value: Number(r.valueText),
    })),
  }
}

export async function readDtcRoster(page: Page): Promise<DtcRoster> {
  await page
    .locator('.sleeper_api-import-team-one input[data-id="player"]')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
  return page.evaluate(() => {
    const active = (selector: string) =>
      document.querySelector(selector)?.getAttribute('data-id') ?? ''
    const enabled = (selector: string) => {
      const element = document.querySelector(selector)
      // The site's dtc_get_rules treats an existing premium control with no attribute as disabled.
      // A missing control still fails validation, rather than silently changing the format.
      return element ? Number(element.getAttribute('data-enabled') ?? 0) : NaN
    }
    const root = document.querySelector('.sleeper_api-import-team-one')!
    const rows = [...root.querySelectorAll('tbody tr')]
      .filter((r) => r.querySelector('input[data-id="player"]'))
      .map((row) => ({
        sourceKey: (row.querySelector('input') as HTMLInputElement).value,
        playerName: row.querySelector('.mfl-trade-table-player')?.textContent?.trim() ?? '',
        team: row.querySelector('.mfl-trade-table-team')?.textContent?.trim() ?? '',
        position: row.children[2]?.textContent?.trim() ?? '',
        valueText: row.children[3]?.textContent?.trim() ?? '',
      }))
    return {
      leagueId: localStorage.getItem('dtc_league_id') ?? '',
      leagueName: localStorage.getItem('dtc_league_name') ?? '',
      ownerId:
        document
          .querySelector('select[name=sleeper_api_league_id] option:checked')
          ?.getAttribute('data-my-team-id') ?? '',
      rules: {
        team_size: active('.dtc-leauge-size.filter-active'),
        team_type: active('.dtc-leauge-type.filter-active'),
        team_format: active('.dtc-leauge-format.filter-active'),
        tepre: enabled('.dtc-te-premium-actions'),
        rbppc: enabled('.dtc-rb-ppc-premium-actions'),
        devy: enabled('.dtc-devy-actions'),
        offense: enabled('.dtc-offense-actions'),
        idp: enabled('.dtc-idp-actions'),
        mode: active('.dtc-calculator-mode.filter-active'),
        startup_rookie: 'no',
      },
      rows,
    }
  }) as Promise<DtcRoster>
}
export const dynastyCalculatorProvider: ValueProvider = {
  name: 'dynasty-calculator',
  async run(options = {}) {
    const leagueId = process.env.SLEEPER_LEAGUE_ID || '1378427936817815552'
    if (!/^\d+$/.test(leagueId))
      throw new ProviderError('configuration', 'SLEEPER_LEAGUE_ID must be numeric.')
    return withProviderPage('dynasty-calculator', options.headless !== false, async (page) => {
      let stage = 'opening the calculator'
      try {
        await page.goto('https://dynastytradecalculator.com/calculator/', {
          waitUntil: 'domcontentloaded',
        })
        await checkAccess(page)
        if (
          /wp-login|pricing/.test(page.url()) ||
          (await page.locator('#user_login').isVisible())
        ) {
          stage = 'signing in'
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
          await page.goto('https://dynastytradecalculator.com/calculator/', {
            waitUntil: 'domcontentloaded',
          })
        }
        const announcement = page.locator('.pum-active .pum-close')
        if (await announcement.isVisible()) await announcement.click()
        // User explicitly approved this league connection and its hourly refresh on 2026-09-05.
        stage = 'opening Connect a League'
        await page.getByRole('button', { name: 'Connect a League', exact: true }).click()
        const modal = page.locator('[data-remodal-id="dtc-integration-modal"]')
        await modal.waitFor({ state: 'visible' })
        stage = 'selecting the Sleeper league'
        await modal.getByRole('link', { name: 'Sleeper', exact: true }).click()
        const select = modal.locator('select[name=sleeper_api_league_id]')
        await select.waitFor()
        await select.selectOption(leagueId)
        stage = 'importing the connected roster'
        await modal.getByRole('link', { name: 'Import League', exact: true }).click()
        await modal.waitFor({ state: 'hidden', timeout: 30_000 })
        await checkAccess(page)
        stage = 'validating the roster values and settings'
        return parseDtcRoster(await readDtcRoster(page))
      } catch (error) {
        if (error instanceof ProviderError) throw error
        // Never expose browser exceptions: they can contain session URLs or credential fields.
        throw new ProviderError(
          'format',
          `DTC stopped while ${stage}. No snapshot saved; existing history is still available.`,
        )
      }
    })
  },
}
