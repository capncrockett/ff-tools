import { chromium } from 'playwright'
import type { ValuationRecord, ValueProvider } from './types.js'

export function parseDynastyCalcHTML(html: string, now = new Date()): ValuationRecord[] {
  // Placeholder similar to Nerds: table#values with .player and .value cells
  const out: ValuationRecord[] = []
  const tableMatch = html.match(/<table[^>]*id=["']values["'][\s\S]*?<\/table>/i)
  if (!tableMatch) return out
  const rowRegex = /<tr[\s\S]*?<td[^>]*class=["']player["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class=["']value["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRegex.exec(tableMatch[0]))) {
    const name = m[1].replace(/<[^>]+>/g, '').trim()
    const value = Number(m[2].replace(/<[^>]+>/g, '').replace(/[^0-9.\-]/g, ''))
    if (!name || !Number.isFinite(value)) continue
    out.push({ playerName: name, value, source: 'dynasty-calculator', capturedAt: now.toISOString() })
  }
  return out
}

export const dynastyCalculatorProvider: ValueProvider = {
  name: 'dynasty-calculator',
  async run(options = {}) {
    const email = process.env.DYNASTY_CALC_EMAIL
    const password = process.env.DYNASTY_CALC_PASSWORD
    if (!email || !password) throw new Error('Dynasty Calculator credentials missing in .env')

    const browser = await chromium.launch({ headless: options.headless !== false })
    try {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto('https://dynastytradecalculator.com/wp-login.php')
      await page.waitForLoadState('domcontentloaded')
      await page.fill('input#user_login, input[name=log], input[type=email]', email)
      await page.fill('input#user_pass, input[name=pwd], input[type=password]', password)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('input#wp-submit, button[type=submit]'),
      ])
      await page.goto('https://dynastytradecalculator.com/calculator/')
      await page.waitForLoadState('networkidle')
      const html = await page.content()
      return parseDynastyCalcHTML(html)
    } finally {
      await browser.close()
    }
  },
}

