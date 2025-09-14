import request from 'supertest'
import { app } from '@server/app.js'

describe('GET /api/health', () => {
  it('returns ok true', async () => {
    const res = await request(app).get('/api/health').expect(200)
    expect(res.body).toEqual(
      expect.objectContaining({ ok: true, service: 'ff-tools' })
    )
    expect(typeof res.body.ts).toBe('number')
  })
})

