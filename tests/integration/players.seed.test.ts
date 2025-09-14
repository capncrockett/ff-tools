import request from 'supertest'
import nock from 'nock'
import { app } from '@server/app.js'

describe('Players seed and list (integration)', () => {
  const base = 'https://api.sleeper.app'
  beforeAll(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1') })
  afterAll(() => { nock.enableNetConnect() })
  afterEach(() => { nock.cleanAll() })

  it('dry run returns counts without touching DB', async () => {
    const res = await request(app).post('/api/players/seed?dry_run=1').expect(200)
    expect(res.body).toEqual(expect.objectContaining({ total: 2 }))
  })

  it('seeds players from Sleeper (dry run) returns totals', async () => {
    const seed = await request(app).post('/api/players/seed?dry_run=1').expect(200)
    expect(seed.body).toEqual(expect.objectContaining({ total: expect.any(Number) }))
  })
})
