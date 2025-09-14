import requests


def map_player_to_team(player_id: str, rosters: list, users: list) -> str:
    """
    Find the team (user) name that rosters a given player based on a player ID.

    Args:
        player_id (str): The ID of the player.
        rosters (list): A list of roster dictionaries, each containing 'players' and 'owner_id'.
        users (list): A list of user dictionaries, each containing 'user_id' and 'display_name'.

    Returns:
        str: The name of the team (user display name) that rosters the given player,
             or 'Unknown Team' if no match is found.
    """
    for roster in rosters:
        if player_id in roster['players']:
            owner_id = roster['owner_id']
            for user in users:
                if user['user_id'] == owner_id:
                    return user['display_name']
    return "Unknown Team"


def map_roster_to_team(roster_id: int, rosters: list, users: list) -> str:
    """
    Find the team (user) name that corresponds to a given roster ID.

    Args:
        roster_id (int): The ID of the roster.
        rosters (list): A list of roster dictionaries, each containing 'roster_id' and 'owner_id'.
        users (list): A list of user dictionaries, each containing 'user_id' and 'display_name'.

    Returns:
        str: The name of the team (user display name) for the given roster ID,
             or 'Unknown Team' if no match is found.
    """
    for roster in rosters:
        if roster['roster_id'] == roster_id:
            owner_id = roster['owner_id']
            for user in users:
                if user['user_id'] == owner_id:
                    return user['display_name']
    return "Unknown Team"


def highest_scoring_team_of_week(scoreboards: dict) -> tuple[str, float]:
    """
    Determine the highest-scoring team for the week from a dictionary of scoreboards.

    Args:
        scoreboards (dict): A dict where keys are matchup IDs and values are lists of
                            (team_name, score) tuples.

    Returns:
        tuple[str, float]: A tuple of (team_name, highest_score).
    """
    highest_score = -1
    highest_scoring_team = "Unknown Team"

    for _, teams in scoreboards.items():
        for team_name, score in teams:
            if score > highest_score:
                highest_score = score
                highest_scoring_team = team_name

    return highest_scoring_team, highest_score


def top_3_teams(standings: list) -> list:
    """
    Return the top 3 teams based on standings.

    Args:
        standings (list): A list of tuples or lists formatted like (team, wins, losses, points).

    Returns:
        list: The top 3 teams sorted by wins (descending), then losses (descending),
              then points (descending).
    """
    sorted_teams = sorted(
        standings,
        key=lambda x: (-int(x[1]), -int(x[2]), -int(x[3]))
    )
    return sorted_teams[:3]


def load_player_data(url: str) -> dict | None:
    """
    Load player data from a given URL returning JSON.

    Args:
        url (str): The URL of the JSON data source.

    Returns:
        dict | None: The JSON response as a dictionary, or None if the request fails.
    """
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    return None


def highest_scoring_player_of_week(
    matchups: list,
    players_data: dict,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> tuple[str | None, float | None, str]:
    """
    Determine the highest-scoring player of the week from matchup data.

    Args:
        matchups (list): A list of matchup dictionaries.
        players_data (dict): A dictionary of player data keyed by player ID.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        tuple[str | None, float | None, str]: (player_name, highest_score, team_name).
                                             Returns None values if no player is found.
    """
    highest_score = -1
    highest_scoring_player_id = None
    highest_scoring_player_team = "Unknown Team"

    for matchup in matchups:
        roster_id = matchup['roster_id']
        owner_id = roster_owner_mapping.get(roster_id)
        team_name = user_team_mapping.get(owner_id, "Unknown Team")

        for player_id, score in matchup['players_points'].items():
            if score > highest_score:
                highest_score = score
                highest_scoring_player_id = player_id
                highest_scoring_player_team = team_name

    if highest_scoring_player_id and highest_scoring_player_id in players_data:
        player_name = players_data[highest_scoring_player_id].get(
            'full_name', 'Unknown Player')
        return player_name, highest_score, highest_scoring_player_team

    return None, None, "Unknown Team"


def lowest_scoring_starter_of_week(
    matchups: list,
    players_data: dict,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> tuple[str | None, float | None, str]:
    """
    Determine the lowest-scoring starter of the week from matchup data.

    Args:
        matchups (list): A list of matchup dictionaries.
        players_data (dict): A dictionary of player data keyed by player ID.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        tuple[str | None, float | None, str]: (player_name, lowest_score, team_name).
                                             Returns None values if no player is found.
    """
    lowest_score = float('inf')
    lowest_scoring_player_id = None
    lowest_scoring_player_team = "Unknown Team"

    for matchup in matchups:
        roster_id = matchup['roster_id']
        owner_id = roster_owner_mapping.get(roster_id)
        team_name = user_team_mapping.get(owner_id, "Unknown Team")

        for player_id in matchup['starters']:
            score = matchup['players_points'].get(player_id, 0)
            if score < lowest_score:
                lowest_score = score
                lowest_scoring_player_id = player_id
                lowest_scoring_player_team = team_name

    if lowest_scoring_player_id and lowest_scoring_player_id in players_data:
        player_name = players_data[lowest_scoring_player_id].get(
            'full_name', 'Unknown Player')
        return player_name, lowest_score, lowest_scoring_player_team

    return None, None, "Unknown Team"


def highest_scoring_benched_player_of_week(
    matchups: list,
    players_data: dict,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> tuple[str | None, float | None, str]:
    """
    Determine the highest-scoring benched player of the week from matchup data.

    Args:
        matchups (list): A list of matchup dictionaries.
        players_data (dict): A dictionary of player data keyed by player ID.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        tuple[str | None, float | None, str]: (player_name, highest_score, team_name).
                                             Returns None values if no benched player is found.
    """
    highest_score = -1
    highest_scoring_player_id = None
    highest_scoring_player_team = "Unknown Team"

    for matchup in matchups:
        roster_id = matchup['roster_id']
        owner_id = roster_owner_mapping.get(roster_id)
        team_name = user_team_mapping.get(owner_id, "Unknown Team")

        for player_id, score in matchup['players_points'].items():
            if player_id not in matchup['starters'] and score > highest_score:
                highest_score = score
                highest_scoring_player_id = player_id
                highest_scoring_player_team = team_name

    if highest_scoring_player_id and highest_scoring_player_id in players_data:
        player_name = players_data[highest_scoring_player_id].get(
            'full_name', 'Unknown Player')
        return player_name, highest_score, highest_scoring_player_team

    return None, None, "Unknown Team"


def biggest_blowout_match_of_week(scoreboards: dict) -> tuple[tuple, float]:
    """
    Identify the matchup with the largest point differential (blowout).

    Args:
        scoreboards (dict): A dict where each key is a matchup ID, and each value is a
                            list of (team_name, score) tuples.

    Returns:
        tuple[tuple, float]: ((team1, score1), (team2, score2)) and the point differential.
                             If no blowout is found, returns (("No match","No match"), 0).
    """
    biggest_blowout = -1
    biggest_blowout_match = None

    for _, teams in scoreboards.items():
        # Expect at least 2 teams in each matchup
        if len(teams) < 2:
            continue
        point_diff = abs(teams[0][1] - teams[1][1])
        if point_diff > biggest_blowout:
            biggest_blowout = point_diff
            biggest_blowout_match = (teams[0], teams[1])

    if biggest_blowout_match is None:
        return ("No match", "No match"), 0

    return biggest_blowout_match, biggest_blowout


def closest_match_of_week(scoreboards: dict) -> tuple[tuple, float]:
    """
    Identify the matchup with the smallest point differential (closest match).

    Args:
        scoreboards (dict): A dict where each key is a matchup ID, and each value is a
                            list of (team_name, score) tuples.

    Returns:
        tuple[tuple, float]: ((team1, score1), (team2, score2)) and the point margin.
                             If no match is found, returns (("No match","No match"), 0).
    """
    smallest_margin = float('inf')
    closest_match = None

    for _, teams in scoreboards.items():
        if len(teams) < 2:
            continue
        point_diff = abs(teams[0][1] - teams[1][1])
        if point_diff < smallest_margin:
            smallest_margin = point_diff
            closest_match = (teams[0], teams[1])

    if closest_match is None:
        return ("No match", "No match"), 0

    return closest_match, smallest_margin


def team_with_most_moves(
    rosters: list,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> tuple[str, int]:
    """
    Identify the team with the highest number of moves (total_moves).

    Args:
        rosters (list): A list of roster dictionaries, each with 'roster_id' and 'settings'.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        tuple[str, int]: (team_name, most_moves).
    """
    most_moves = -1
    team_with_most = "Unknown Team"

    for roster in rosters:
        owner_id = roster_owner_mapping.get(roster['roster_id'])
        team_name = user_team_mapping.get(owner_id, "Unknown Team")
        total_moves = roster['settings'].get('total_moves', 0)

        if total_moves > most_moves:
            most_moves = total_moves
            team_with_most = team_name

    return team_with_most, most_moves


def team_on_hottest_streak(
    rosters: list,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> tuple[str, int]:
    """
    Identify the team with the longest winning streak.

    Args:
        rosters (list): A list of roster dictionaries, each with 'roster_id' and 'metadata'.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        tuple[str, int]: (team_name, longest_streak).
    """
    longest_streak = -1
    hottest_team = "Unknown Team"

    for roster in rosters:
        owner_id = roster_owner_mapping.get(roster['roster_id'])
        team_name = user_team_mapping.get(owner_id, "Unknown Team")
        streak_str = roster['metadata'].get('streak', '')

        # If there's a winning streak like '3W', extract the number as int.
        current_streak = int(streak_str.split(
            'W')[0]) if 'W' in streak_str else 0

        if current_streak > longest_streak:
            longest_streak = current_streak
            hottest_team = team_name

    return hottest_team, longest_streak


def calculate_scoreboards(
    matchups: list,
    user_team_mapping: dict,
    roster_owner_mapping: dict
) -> dict:
    """
    Calculate and return a dictionary of matchups and corresponding team scores.

    Args:
        matchups (list): A list of matchup dictionaries, each containing 'roster_id',
                         'points', and 'matchup_id'.
        user_team_mapping (dict): Maps owner IDs to team names.
        roster_owner_mapping (dict): Maps roster IDs to owner IDs.

    Returns:
        dict: { matchup_id: [(team_name, total_points), ...], ... }
              Sorted by total_points descending within each matchup.
    """
    matchups_dict = {}

    for matchup in matchups:
        roster_id = matchup.get('roster_id')
        owner_id = roster_owner_mapping.get(roster_id)
        team_name = user_team_mapping.get(owner_id, "Unknown Team")
        total_points = matchup.get('points', 0)
        matchup_id = matchup.get('matchup_id')

        if matchup_id not in matchups_dict:
            matchups_dict[matchup_id] = []
        matchups_dict[matchup_id].append((team_name, total_points))

    # Sort each matchup's teams by descending score
    for m_id in matchups_dict:
        matchups_dict[m_id].sort(key=lambda x: -x[1])

    return matchups_dict
