import re


def clean_team_name(name: str) -> str:
    """
    Remove any non-ASCII characters from a team name and strip leading/trailing whitespace.

    Args:
        name (str): The original team name.

    Returns:
        str: Cleaned team name, ASCII-only and stripped of whitespace.
    """
    # This regex pattern will match any character outside the regular ASCII range
    cleaned_name = re.sub(r'[^\x00-\x7F]+', '', name)
    return cleaned_name.strip()


# ------------------------------------------------------------------------------
# Step 1: Basic Data Extraction
# ------------------------------------------------------------------------------

def extract_teams_standings(league):
    """
    Retrieve all teams in order of their standings.

    Args:
        league (League): The league object.

    Returns:
        List[Team]: List of teams in order of standings.
    """
    return league.standings()


def extract_players_weekly_scores(league, week: int):
    """
    Retrieve all players and their weekly scores for a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        List[BoxScore]: Box scores containing player scores for the given week.
    """
    return league.box_scores(week)


def extract_recent_activities(league, size: int = 25, msg_type=None):
    """
    Retrieve recent league activities (e.g., free-agent additions, trades).

    Args:
        league (League): The league object.
        size (int, optional): Number of recent activities to fetch. Defaults to 25.
        msg_type (str, optional): Type of message ('FA', 'WAIVER', 'TRADED'). Defaults to None.

    Returns:
        List[Activity]: List of recent league activities.
    """
    return league.recent_activity(size=size, msg_type=msg_type)


def extract_match_results(league, week: int):
    """
    Retrieve match results for a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        List[Matchup]: Matchups for the given week.
    """
    return league.scoreboard(week)


# ------------------------------------------------------------------------------
# Step 2: Top/Bottom Stats
# ------------------------------------------------------------------------------

def top_three_teams(league):
    """
    Determine the top 3 teams based on the standings.

    Args:
        league (League): The league object.

    Returns:
        List[Team]: The top 3 teams in the league.
    """
    standings = extract_teams_standings(league)
    return standings[:3]


def top_scorer_of_week(league, week: int):
    """
    Determine the top scoring player of a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        Tuple[Player, float]: Top scoring player and their score.
    """
    box_scores = extract_players_weekly_scores(league, week)
    max_score = float('-inf')
    top_player = None

    for box_score in box_scores:
        # Check players from both home and away lineups
        for player in box_score.home_lineup + box_score.away_lineup:
            if player.points > max_score:
                max_score = player.points
                top_player = player

    return top_player, max_score


def worst_scorer_of_week(league, week: int):
    """
    Determine the worst scoring (non-IR) player of a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        Tuple[Player, float]: Worst scoring player and their score.
    """
    box_scores = extract_players_weekly_scores(league, week)
    min_score = float('inf')
    worst_player = None

    for box_score in box_scores:
        for player in box_score.home_lineup + box_score.away_lineup:
            if player.slot_position == 'IR':
                continue  # Ignore IR slot players
            if player.points < min_score:
                min_score = player.points
                worst_player = player

    return worst_player, min_score


def top_scorer_of_season(league):
    """
    Determine the top scoring player of the season (based on total_points).

    Args:
        league (League): The league object.

    Returns:
        Tuple[Player, float]: Top scoring player and their total points for the season.
    """
    max_score = float('-inf')
    top_player = None

    # Check every player on every team’s roster
    for team in league.teams:
        for player in team.roster:
            if player.total_points > max_score:
                max_score = player.total_points
                top_player = player

    return top_player, max_score


def worst_scorer_of_season(league):
    """
    Determine the worst scoring player of the season (based on total_points).

    Args:
        league (League): The league object.

    Returns:
        Tuple[Player, float]: Worst scoring player and their total points for the season.
    """
    min_score = float('inf')
    worst_player = None

    for team in league.teams:
        for player in team.roster:
            if player.total_points < min_score:
                min_score = player.total_points
                worst_player = player

    return worst_player, min_score


# ------------------------------------------------------------------------------
# Step 3: Team-Specific Stats
# ------------------------------------------------------------------------------

def team_with_most_transactions(league):
    """
    Identify the team with the most transactions (claims/trades) among recent activities.

    Args:
        league (League): The league object.

    Returns:
        Tuple[str, int, int]: The name of the team with the most transactions,
                              number of claims, and number of trades.
    """
    # Fetch recent league activities (limit to a certain size)
    activities = extract_recent_activities(league, size=100)

    # Define a mapping for action types
    action_types = {
        "FA ADDED": "Claims",
        "WAIVER ADDED": "Claims",
        "TRADED": "Trades"
    }

    transaction_counts = {}
    for activity in activities:
        for action in activity.actions:
            team = action[0]
            action_type = action[1]

            if team not in transaction_counts:
                transaction_counts[team] = {"Claims": 0, "Trades": 0}

            if action_type in action_types:
                transaction_counts[team][action_types[action_type]] += 1

    # Determine the team with the highest sum of claims + trades
    team_with_most = max(
        transaction_counts,
        key=lambda k: transaction_counts[k]["Claims"] +
        transaction_counts[k]["Trades"]
    )

    return (
        team_with_most,
        transaction_counts[team_with_most]["Claims"],
        transaction_counts[team_with_most]["Trades"]
    )


def team_with_most_injured_players(league):
    """
    Identify the team rostering the most injured players.

    Args:
        league (League): The league object.

    Returns:
        Tuple[Team, int, List[str]]:
            (Team object, count of injured players, list of injured player names).
    """
    injured_counts = {}

    for team in league.teams:
        injured_players = [p.name for p in team.roster if p.injured]
        injured_counts[team] = len(injured_players)

    # Identify the team with the most injured players
    team_with_most_injured = max(injured_counts, key=injured_counts.get)

    # Re-collect injured player names for the team
    team_injured_players = [
        p.name for p in team_with_most_injured.roster if p.injured
    ]

    return team_with_most_injured, injured_counts[team_with_most_injured], team_injured_players


# ------------------------------------------------------------------------------
# Step 4: Player Bench/Starting Stats
# ------------------------------------------------------------------------------

def highest_scoring_benched_player(league, current_week: int):
    """
    Identify the highest-scoring benched player for a given week and the team that rosters them.

    Args:
        league (League): The league object.
        current_week (int): The week number.

    Returns:
        Tuple[Player, Team]: The highest-scoring benched player and the team that rosters them.
    """
    box_scores = league.box_scores(current_week)
    highest_player = None
    highest_points = float('-inf')

    for box_score in box_scores:
        for player in box_score.home_lineup + box_score.away_lineup:
            if player.slot_position == 'BE' and player.points > highest_points:
                highest_points = player.points
                # Determine which team the player belongs to
                roster_team = box_score.home_team if player in box_score.home_lineup else box_score.away_team
                highest_player = (player, roster_team)

    return highest_player


def lowest_scoring_starting_player(league, current_week: int):
    """
    Identify the lowest-scoring starting player for a given week and the team that rosters them.

    Args:
        league (League): The league object.
        current_week (int): The week number.

    Returns:
        Tuple[Player, Team]: The lowest-scoring starting player and the team that rosters them.
    """
    box_scores = league.box_scores(current_week)
    lowest_player = None
    lowest_points = float('inf')

    for box_score in box_scores:
        for player in box_score.home_lineup + box_score.away_lineup:
            if player.slot_position != 'BE' and player.points < lowest_points:
                lowest_points = player.points
                roster_team = box_score.home_team if player in box_score.home_lineup else box_score.away_team
                lowest_player = (player, roster_team)

    return lowest_player


# ------------------------------------------------------------------------------
# Step 5: Match Stats
# ------------------------------------------------------------------------------

def biggest_blowout_match(league, week: int):
    """
    Identify the match with the largest score difference in a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        BoxScore | None: The match with the largest score difference, or None if none found.
    """
    box_scores = league.box_scores(week)
    max_diff = float('-inf')
    blowout_match = None

    for match in box_scores:
        diff = abs(match.home_score - match.away_score)
        if diff > max_diff:
            max_diff = diff
            blowout_match = match

    return blowout_match


def closest_game_match(league, week: int):
    """
    Identify the match with the smallest score difference in a given week.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        BoxScore | None: The match with the smallest score difference, or None if none found.
    """
    box_scores = league.box_scores(week)
    min_diff = float('inf')
    closest_match = None

    for match in box_scores:
        diff = abs(match.home_score - match.away_score)
        if diff < min_diff:
            min_diff = diff
            closest_match = match

    return closest_match


def highest_scoring_team(league, week: int) -> str:
    """
    Find the highest-scoring team for a given week and return a formatted string.

    Args:
        league (League): The league object.
        week (int): The week number.

    Returns:
        str: A string with the top team's name and their score in the format "Team Name (Score)".
    """
    matchups = league.scoreboard(week)
    max_score = float('-inf')
    top_team = None

    for matchup in matchups:
        if matchup.home_score > max_score:
            max_score = matchup.home_score
            top_team = matchup.home_team
        if matchup.away_score > max_score:
            max_score = matchup.away_score
            top_team = matchup.away_team

    if top_team:
        return f"{top_team.team_name} ({max_score})"
    return "No team found"
