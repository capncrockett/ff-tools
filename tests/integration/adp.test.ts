import fs from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { app } from '@server/app.js'

const dataDir = path.resolve(process.cwd(), 'data')
const adpPath = path.join(dataDir, 'adp.csv')

describe('GET /api/sleeper-tools/adp', () => {
  let original: string | null = null

  beforeAll(async () => {
    try {
      original = await fs.readFile(adpPath, 'utf8')
    } catch {
      await fs.mkdir(dataDir, { recursive: true })
    }
    const csv = [
      'player_name,average_pick,std_dev,times_drafted,earliest_pick,latest_pick,draft_percentage',
      'Josh Allen,10.2,1.1,5,8,12,100%',
      'Christian McCaffrey,1.2,0.5,5,1,2,100%',
    ].join('\n')
    await fs.writeFile(adpPath, csv, 'utf8')
  })

  afterAll(async () => {
    if (original !== null) {
      await fs.writeFile(adpPath, original, 'utf8')
    }
  })

  it('parses and returns numeric fields', async () => {
    const res = await request(app).get('/api/sleeper-tools/adp').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toEqual(
      expect.objectContaining({
        player_name: 'Josh Allen',
        average_pick: expect.any(Number),
        std_dev: expect.any(Number),
        times_drafted: expect.any(Number),
        earliest_pick: expect.any(Number),
        latest_pick: expect.any(Number),
        draft_percentage: expect.any(Number),
      })
    )
  })
})

