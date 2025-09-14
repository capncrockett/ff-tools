import { chromium } from 'playwright'
import type { ValuationRecord, ValueProvider } from './types.js'

export function parseDynastyNerdsHTML(html: string, now = new Date()): ValuationRecord[] {
  // Placeholder parser: look for a table with id "values" and rows of player/value
  // This keeps unit tests deterministic without relying on live HTML.
  const results: ValuationRecord[] = []
  const tableMatch = html.match(/<table[^>]*id=["']values["'][\s\S]*?<\/table>/i)
  if (!tableMatch) return results
  const table = tableMatch[0]
  const rowRegex = /<tr[\s\S]*?<td[^>]*class=["']player["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class=["']value["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRegex.exec(table))) {
    const name = m[1].replace(/<[^>]+>/g, '').trim()
    const val = Number(m[2].replace(/<[^>]+>/g, '').replace(/[^0-9.\-]/g, ''))
    if (!name || !Number.isFinite(val)) continue
    results.push({
      playerName: name,
      value: val,
      source: 'dynasty-nerds',
      capturedAt: now.toISOString(),
    })
  }
  return results
}

export const dynastyNerdsProvider: ValueProvider = {
  name: 'dynasty-nerds',
  async run(options = {}) {
    const email = process.env.DYNASTY_NERDS_EMAIL
    const password = process.env.DYNASTY_NERDS_PASSWORD
    if (!email || !password) {
      throw new Error('Dynasty Nerds credentials missing in .env')
    }

    const browser = await chromium.launch({ headless: options.headless !== false })
    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto('https://app.dynastynerds.com/sign-in/user')

      // Handle redirect to gm login
      // Fill credentials on whatever login form appears
      // These selectors are placeholders; you may need to update them when running locally.
      await page.waitForLoadState('domcontentloaded')

      // Try common selectors
      const emailSel = 'input[type=email], input[name=email], input#username'
      const passSel = 'input[type=password], input[name=password], input#password'
      await page.fill(emailSel, email)
      await page.fill(passSel, password)
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.keyboard.press('Enter'),
      ])

      // Navigate to leagues/home
      await page.goto('https://app.dynastynerds.com/home/leagues')
      await page.waitForLoadState('networkidle')

      // TODO: Navigate to the exact valuations view; for now, capture page content
      const html = await page.content()
      const vals = parseDynastyNerdsHTML(html)
      return vals
    } finally {
      await browser.close()
    }
  },
}

