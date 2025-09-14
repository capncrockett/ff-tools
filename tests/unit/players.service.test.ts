import { seedPlayersFromSleeper, listPlayers } from '@server/services/players.js'

describe('players service (unit with DI)', () => {
  it('seedPlayersFromSleeper creates and upserts players', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({ data: {
        a1: { full_name: 'Alpha One', position: 'QB', team: 'KC' },
        b2: { first_name: 'Beta', last_name: 'Two', fantasy_positions: ['RB'] },
      } }),
    } as any

    const upserts: any[] = []
    const prisma = {
      player: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        upsert: jest.fn().mockImplementation(async (args: any) => { upserts.push(args); return {} }),
      }
    }

    const res = await seedPlayersFromSleeper({ http, prisma })
    expect(res).toEqual(expect.objectContaining({ created: 2, total: 2 }))
    expect(upserts.length).toBe(2)
  })

  it('listPlayers applies search/position/limit', async () => {
    const prisma = {
      player: {
        findMany: jest.fn().mockResolvedValue([
          { sleeperId: 'x', name: 'X Man', position: 'WR', team: 'DAL' },
        ]),
      },
    }
    const rows = await listPlayers({ prisma, search: 'x', position: 'WR', limit: 1 })
    expect(rows).toEqual([{ sleeperId: 'x', name: 'X Man', position: 'WR', team: 'DAL' }])
    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: { name: { contains: 'x', mode: 'insensitive' }, position: 'WR' },
      take: 1,
      orderBy: { name: 'asc' },
    })
  })
})

