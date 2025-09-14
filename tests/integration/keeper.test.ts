import nock from 'nock'
import request from 'supertest'
import { app } from '@server/app.js'

describe('GET /api/sleeper-tools/keeper-data', () => {
  const base = 'https://api.sleeper.app'
  const username = 'crockett'
  const userId = 'user123'
  const year = new Date().getFullYear().toString()
  const leagueId = 'league456'

  beforeAll(() => {
    nock.disableNetConnect()
    nock.enableNetConnect('127.0.0.1')
  })
  afterAll(() => {
    nock.enableNetConnect()
  })
  afterEach(() => {
    nock.cleanAll()
  })

  it('assembles keeper data from Sleeper endpoints', async () => {
    // user
    nock(base).get(`/v1/user/${username}`).reply(200, {
      user_id: userId,
      username,
      display_name: 'Crockett',
    })
    // leagues
    nock(base)
      .get(`/v1/user/${userId}/leagues/nfl/${year}`)
      .reply(200, [
        { league_id: leagueId, name: 'Grundle League', season: year },
      ])
    // rosters
    nock(base)
      .get(`/v1/league/${leagueId}/rosters`)
      .reply(200, [
        { owner_id: 'owner1', players: ['ply1', 'ply2'] },
      ])
    // users in league
    nock(base)
      .get(`/v1/league/${leagueId}/users`)
      .reply(200, [
        { user_id: 'owner1', username: 'owner1', display_name: 'Owner One' },
      ])
    // players map
    nock(base)
      .get(`/v1/players/nfl`)
      .reply(200, {
        ply1: { full_name: 'Player One', position: 'RB', team: 'SF' },
        ply2: { full_name: 'Player Two', position: 'DL', fantasy_positions: ['EDGE'], team: 'DAL' },
      })

    const res = await request(app)
      .get('/api/sleeper-tools/keeper-data')
      .expect(200)

    expect(res.body.league_name).toEqual('Grundle League')
    expect(res.body.teams[0].owner_name).toEqual('Owner One')
    expect(res.body.teams[0].players[0]).toEqual(
      expect.objectContaining({ name: 'Player One', position: 'RB' })
    )
    // IDP position normalized from DL -> fantasy_positions[0]
    expect(res.body.teams[0].players[1]).toEqual(
      expect.objectContaining({ name: 'Player Two', position: 'EDGE' })
    )
  })
})
