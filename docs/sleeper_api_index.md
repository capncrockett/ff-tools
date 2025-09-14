Sleeper API Cheat Sheet (LLM-friendly)

Base URL: https://api.sleeper.app

Core Endpoints
- GET /v1/user/{username}
- GET /v1/user/{user_id}/leagues/nfl/{season}
- GET /v1/league/{league_id}
- GET /v1/league/{league_id}/users
- GET /v1/league/{league_id}/rosters
- GET /v1/league/{league_id}/matchups/{week}
- GET /v1/players/nfl

Notes
- All endpoints are public (no auth) unless otherwise stated.
- Player objects are keyed by player_id; fields include full_name, position, team, fantasy_positions.
- League rosters contain player IDs; join on /players to resolve names.

Examples
- User: /v1/user/crockett
- Leagues: /v1/user/{user_id}/leagues/nfl/2024
- League rosters: /v1/league/{league_id}/rosters

Tips for Agents
- Prefer joining roster player IDs against /players locally to avoid repeated large downloads.
- Cache /players/nfl on disk; refresh weekly in-season.

