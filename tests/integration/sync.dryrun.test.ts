import request from 'supertest'
import { app } from '@server/app.js'

describe('POST /api/sync/:source (dry run)', () => {
  it('returns sample valuations for dynasty-nerds', async () => {
    const res = await request(app).post('/api/sync/dynasty-nerds?dry_run=1').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toEqual(
      expect.objectContaining({ source: 'dynasty-nerds', playerName: expect.any(String), value: expect.any(Number) })
    )
  })

  it('returns sample valuations for dynasty-calculator', async () => {
    const res = await request(app).post('/api/sync/dynasty-calculator?dry_run=1').expect(200)
    expect(res.body[0]).toEqual(
      expect.objectContaining({ source: 'dynasty-calculator', value: expect.any(Number) })
    )
  })
})

