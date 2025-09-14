import { dynastyNerdsProvider } from '@server/providers/dynastyNerds.js'
import { dynastyCalculatorProvider } from '@server/providers/dynastyCalculator.js'

// Mock playwright chromium
jest.mock('playwright', () => {
  const sampleTable = `
    <table id="values">
      <tr><td class="player">Mock One</td><td class="value">111</td></tr>
      <tr><td class="player">Mock Two</td><td class="value">222</td></tr>
    </table>
  `
  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    keyboard: { press: jest.fn().mockResolvedValue(undefined) },
    content: jest.fn().mockResolvedValue(sampleTable),
  }
  const context = { newPage: jest.fn().mockResolvedValue(page) }
  const browser = {
    newContext: jest.fn().mockResolvedValue(context),
    close: jest.fn().mockResolvedValue(undefined),
  }
  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(browser),
    },
  }
})

describe('providers run() (unit, mocked browser)', () => {
  const env = process.env
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...env,
      DYNASTY_NERDS_EMAIL: 'x@example.com', DYNASTY_NERDS_PASSWORD: 'pw',
      DYNASTY_CALC_EMAIL: 'y@example.com', DYNASTY_CALC_PASSWORD: 'pw',
    }
  })
  afterAll(() => { process.env = env })

  it('dynasty-nerds run returns valuations', async () => {
    const vals = await dynastyNerdsProvider.run({ headless: true })
    expect(vals.length).toBeGreaterThanOrEqual(2)
    expect(vals[0]).toEqual(expect.objectContaining({ source: 'dynasty-nerds' }))
  })

  it('dynasty-calculator run returns valuations', async () => {
    const vals = await dynastyCalculatorProvider.run({ headless: true })
    expect(vals[0]).toEqual(expect.objectContaining({ source: 'dynasty-calculator' }))
  })
})

