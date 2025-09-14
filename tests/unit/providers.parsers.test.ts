import { parseDynastyNerdsHTML } from '@server/providers/dynastyNerds.js'
import { parseDynastyCalcHTML } from '@server/providers/dynastyCalculator.js'

const sampleTable = `
  <table id="values">
    <tr><td class="player">John Doe</td><td class="value">101.5</td></tr>
    <tr><td class="player">Jane RB</td><td class="value">  88 </td></tr>
  </table>
`

describe('provider parsers (unit)', () => {
  it('parses Dynasty Nerds-like table', () => {
    const out = parseDynastyNerdsHTML(sampleTable, new Date('2024-01-01T00:00:00Z'))
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(
      expect.objectContaining({ playerName: 'John Doe', value: 101.5, source: 'dynasty-nerds' })
    )
    expect(out[1].playerName).toBe('Jane RB')
  })

  it('parses Dynasty Calculator-like table', () => {
    const out = parseDynastyCalcHTML(sampleTable, new Date('2024-01-01T00:00:00Z'))
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(
      expect.objectContaining({ playerName: 'John Doe', value: 101.5, source: 'dynasty-calculator' })
    )
  })
})

