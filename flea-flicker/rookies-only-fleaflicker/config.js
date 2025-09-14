// config.js
const API_BASE_URL = "https://www.fleaflicker.com/api";
const LEAGUE_ROSTERS_ENDPOINT = "/FetchLeagueRosters";
const ROSTER_ENDPOINT = "/FetchRoster";
const LEAGUE_RULES_ENDPOINT = "/FetchLeagueRules";
const FETCH_PLAYER_LISTING = "/FetchPlayerListing";

const config = {
  apiBaseUrl: API_BASE_URL,
  endpoints: {
    fetchPlayerListing: FETCH_PLAYER_LISTING,
    leagueRosters: LEAGUE_ROSTERS_ENDPOINT,
    roster: ROSTER_ENDPOINT,
    leagueRules: LEAGUE_RULES_ENDPOINT,
  },
  commonParams: {
    sport: "NFL",
    league_id: 343168,
    // Add other non-sensitive parameters here
  },
};

export default config;
