import { seedPlayersFromSleeper, listPlayers } from '../../src/server/services/players'
describe('players service', () => {
  it('seeds using SQLite-compatible upserts', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        data: {
          a1: { full_name: 'Alpha One', position: 'QB', team: 'KC' },
          b2: { first_name: 'Beta', last_name: 'Two', fantasy_positions: ['RB'] },
        },
      }),
    } as any
    const db = {
      player: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any
    expect(await seedPlayersFromSleeper({ http, prisma: db })).toMatchObject({
      created: 2,
      total: 2,
      upserts: 2,
    })
    expect(db.player.upsert).toHaveBeenCalledTimes(2)
  })
  it('lists players without unsupported SQLite mode filter', async () => {
    const db = {
      player: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ sleeperId: 'x', name: 'X Man', position: 'WR', team: 'DAL' }]),
      },
    } as any
    expect(await listPlayers({ prisma: db, search: 'x', position: 'WR', limit: 1 })).toEqual([
      { sleeperId: 'x', name: 'X Man', position: 'WR', team: 'DAL' },
    ])
    expect(db.player.findMany).toHaveBeenCalledWith({
      where: { name: { contains: 'x' }, position: 'WR' },
      take: 1,
      orderBy: { name: 'asc' },
    })
  })
})
