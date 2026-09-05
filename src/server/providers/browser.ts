import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from 'playwright'
import { localDir } from '../config.js'
import type { SourceName } from './types.js'
import { ProviderError } from './types.js'

export async function withProviderPage<T>(
  source: SourceName,
  headless: boolean,
  capture: (page: Page) => Promise<T>,
): Promise<T> {
  const statePath = path.join(localDir, 'sessions', `${source}.json`)
  const exists = await fs.access(statePath).then(
    () => true,
    () => false,
  )
  const browser = await chromium.launch({
    headless,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  })
  try {
    const context = await browser.newContext({
      storageState: exists ? statePath : undefined,
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    page.setDefaultNavigationTimeout(30_000)
    const result = await capture(page)
    await fs.mkdir(path.dirname(statePath), { recursive: true })
    await context.storageState({ path: statePath })
    return result
  } finally {
    await browser.close()
  }
}

export async function checkAccess(page: Page) {
  const text = (await page.locator('body').innerText()).slice(0, 20_000)
  if (
    /verify you are human|unusual traffic|just a moment|access denied|complete the captcha/i.test(
      text,
    )
  )
    throw new ProviderError(
      'challenge',
      'Provider requested a browser challenge. Open the site and resolve it manually before retrying.',
    )
  if (/too many requests|rate limit exceeded/i.test(text))
    throw new ProviderError(
      'rate-limit',
      'Provider rate limit reached. Capture stopped; retry later.',
    )
}

export function credentials(prefix: 'DYNASTY_NERDS' | 'DYNASTY_CALC') {
  const email = process.env[`${prefix}_EMAIL`],
    password = process.env[`${prefix}_PASSWORD`]
  if (!email || !password)
    throw new ProviderError(
      'configuration',
      'Sign in locally or configure provider credentials in .env.local.',
    )
  return { email, password }
}
