import { mapSleeperPlayers } from '@server/services/players.js'

describe('mapSleeperPlayers', () => {
  it('maps basic fields and falls back to first/last name', () => {
    const input = {
      p1: { full_name: 'John Doe', position: 'RB', team: 'SF', birth_date: '1999-04-01' },
      p2: { first_name: 'Jane', last_name: 'Smith', fantasy_positions: ['WR'] },
      p3: { last_name: 'Solo' },
    }
    const out = mapSleeperPlayers(input)
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sleeperId: 'p1',
          name: 'John Doe',
          position: 'RB',
          team: 'SF',
          birthDate: '1999-04-01',
        }),
        // A missing or malformed birth date is stored as unknown, never guessed.
        expect.objectContaining({
          sleeperId: 'p2',
          name: 'Jane Smith',
          position: 'WR',
          birthDate: null,
        }),
        expect.objectContaining({ sleeperId: 'p3', name: 'Solo' }),
      ]),
    )
  })
})
