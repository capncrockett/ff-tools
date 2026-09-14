import { mapSleeperPlayers } from '@server/services/players.js'

describe('mapSleeperPlayers', () => {
  it('keeps only players the league can roster and falls back to first/last name', () => {
    const input = {
      p1: { full_name: 'John Doe', position: 'RB', team: 'SF', birth_date: '1999-04-01' },
      p2: { first_name: 'Jane', last_name: 'Smith', fantasy_positions: ['WR'] },
      p3: { full_name: 'Full Back', position: 'FB', fantasy_positions: ['RB'] },
      // A League for All Seasons has no kickers, defenses, or linemen.
      k1: { full_name: 'Place Kicker', position: 'K', fantasy_positions: ['K'] },
      d1: { full_name: 'Edge Rusher', position: 'DL', fantasy_positions: ['DL'] },
      o1: { full_name: 'Left Tackle', position: 'OL' },
      x1: { last_name: 'No Position' },
    }
    const out = mapSleeperPlayers(input)
    expect(out.map((player) => player.sleeperId).sort()).toEqual(['p1', 'p2', 'p3'])
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
        // A fullback eligible at RB counts as an RB.
        expect.objectContaining({ sleeperId: 'p3', position: 'RB' }),
      ]),
    )
  })
})
