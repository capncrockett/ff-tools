import axios from 'axios'
import { getKeeperData } from '@server/services/keeper.js'

describe('keeper service (unit)', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('builds keeper payload and normalizes IDP positions', async () => {
    const username = 'crockett'
    const userId = 'user123'
    const year = new Date().getFullYear().toString()
    const leagueId = 'league456'

    // user
    const spy = jest.spyOn(axios, 'get')
    spy.mockResolvedValueOnce({ data: { user_id: userId, username, display_name: 'Crockett' } } as any)
    // leagues
    spy.mockResolvedValueOnce({ data: [ { league_id: leagueId, name: 'Grundle League', season: year } ] } as any)
    // rosters
    spy.mockResolvedValueOnce({ data: [ { owner_id: 'owner1', players: ['p1','p2'] } ] } as any)
    // users
    spy.mockResolvedValueOnce({ data: [ { user_id: 'owner1', username: 'owner1', display_name: 'Owner One' } ] } as any)
    // players map
    spy.mockResolvedValueOnce({ data: {
      p1: { full_name: 'Player One', position: 'RB', team: 'SF' },
      p2: { full_name: 'Player Two', position: 'DL', fantasy_positions: ['EDGE'], team: 'DAL' },
    } } as any)

    const res = await getKeeperData()
    expect(res.league_name).toBe('Grundle League')
    expect(res.teams).toHaveLength(1)
    expect(res.teams[0].owner_name).toBe('Owner One')
    expect(res.teams[0].players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Player One', position: 'RB' }),
        expect.objectContaining({ name: 'Player Two', position: 'EDGE' }),
      ])
    )
  })
})
