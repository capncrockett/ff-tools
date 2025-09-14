import request from 'supertest'
import { app } from '@server/app.js'

describe('Valuations import (integration with mock prisma)', () => {
  it('imports CSV and returns saved count', async () => {
    const csv = [
      'player_name,value,captured_at',
      'Alpha One,100,2024-01-01T00:00:00Z',
      'Beta Two,90,2024-01-02T00:00:00Z',
    ].join('\n')
    const res = await request(app)
      .post('/api/valuations/import?source=test-source')
      .set('content-type', 'text/csv')
      .send(csv)
      .expect(200)
    expect(res.body.saved).toBe(2)
  })
})

