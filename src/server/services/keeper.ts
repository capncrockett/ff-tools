import axios from 'axios'

type SleeperUser = { user_id: string; username: string; display_name: string }
type League = { league_id: string; name: string; season: string }
type Roster = { owner_id?: string; players?: string[] }
type PlayerMap = Record<string, { full_name?: string; position?: string; team?: string; fantasy_positions?: string[] }>

export async function getKeeperData() {
  const username = process.env.SLEEPER_USERNAME || 'crockett'
  // Get user
  const user = await axios
    .get<SleeperUser>(`https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`)
    .then((r) => r.data)

  // Get leagues (current season first)
  const currentYear = new Date().getFullYear().toString()
  const leagues = await axios
    .get<League[]>(`https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${currentYear}`)
    .then((r) => r.data)

  const league = leagues.find((l) => /grundle/i.test(l.name)) || leagues[0]
  if (!league) return { league_name: 'No Leagues Found', teams: [] }

  const [rosters, users, players] = await Promise.all([
    axios.get<Roster[]>(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`).then((r) => r.data),
    axios.get<SleeperUser[]>(`https://api.sleeper.app/v1/league/${league.league_id}/users`).then((r) => r.data),
    axios.get<PlayerMap>('https://api.sleeper.app/v1/players/nfl').then((r) => r.data)
  ])

  const userMap = Object.fromEntries(users.map((u) => [u.user_id, u.display_name || u.username]))

  const teams = rosters
    .filter((r) => !!r.owner_id && Array.isArray(r.players) && r.players!.length > 0)
    .map((r) => {
      const playersDetailed = (r.players || []).map((pid) => {
        const info = players[pid] || {}
        let pos = info.position || 'N/A'
        if (['DL', 'LB', 'DB'].includes(pos) && Array.isArray(info.fantasy_positions) && info.fantasy_positions.length) {
          pos = info.fantasy_positions[0]!
        }
        return {
          id: pid,
          name: info.full_name || pid,
          position: pos,
          draft_round: 'N/A',
          draft_pick: 'N/A',
          team: info.team || 'FA'
        }
      })
      return {
        owner_id: r.owner_id!,
        owner_name: userMap[r.owner_id!] || 'Unknown Owner',
        players: playersDetailed
      }
    })

  return {
    league_name: league.name,
    teams
  }
}

