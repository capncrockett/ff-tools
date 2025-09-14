from streamlit.logger import get_logger

LOGGER = get_logger(__name__)


def get_most_recent_week(sc) -> int:
    """
    Retrieve the most recently completed week in the fantasy league.

    Args:
        sc: The YahooFantasySportsQuery object.

    Returns:
        int: The most recently completed week.
    """
    try:
        league_info = sc.get_league_info()
        completed_week = league_info.current_week - 1
        LOGGER.info(
            f"Most recent week retrieved successfully: {completed_week}")
        return completed_week
    except Exception as e:
        LOGGER.exception("Failed to get the most recent week.")
        raise e  # Reraise the exception after logging it


def extract_team_ids(teams: list) -> dict:
    """
    Extract team IDs and names from the provided teams data.

    Args:
        teams (list): A list of Team instances.

    Returns:
        dict: A dictionary mapping team IDs to team names.
    """
    try:
        return {team.team_id: team.name for team in teams}
    except Exception as e:
        LOGGER.exception("Failed to extract team IDs and names.")
        raise e


def find_extreme_scorers_and_banged_up_team(sc, team_ids: dict, week: int = 3) -> tuple:
    """
    Identify various extreme performers (e.g., highest/lowest scorers, bench stats) and
    find the team with the most 'banged up' (injured) players for a given week.

    Args:
        sc: The YahooFantasySportsQuery object.
        team_ids (dict): Mapping of team IDs to team names.
        week (int, optional): The week to analyze. Defaults to 3.

    Returns:
        tuple: A tuple containing:
            - highest_scorer (Player, str)
            - lowest_scorer (Player, str)
            - highest_scorer_bench (Player, str)
            - lowest_scorer_started (Player, str)
            - most_banged_up_team (str, int)
    """
    highest_scorer = None
    lowest_scorer = None
    highest_scorer_bench = None
    lowest_scorer_started = None
    most_banged_up_team = None
    most_banged_up_count = 0

    for team_id, team_name in team_ids.items():
        # Get player stats for the team
        players_stats = sc.get_team_roster_player_stats_by_week(
            team_id, chosen_week=week)
        banged_up_count = 0

        for player in players_stats:
            # 1. Highest Scorer
            if (highest_scorer is None) or (player.player_points.total > highest_scorer[0].player_points.total):
                highest_scorer = (player, team_name)

            # 2. Lowest Scorer
            if (lowest_scorer is None) or (player.player_points.total < lowest_scorer[0].player_points.total):
                lowest_scorer = (player, team_name)

            # 3. Highest Scorer on Bench
            if player.selected_position.position == "BN":
                if highest_scorer_bench is None or player.player_points.total > highest_scorer_bench[0].player_points.total:
                    highest_scorer_bench = (player, team_name)

            # 4. Lowest Scorer Started
            if player.selected_position.position != "BN":
                if lowest_scorer_started is None or player.player_points.total < lowest_scorer_started[0].player_points.total:
                    lowest_scorer_started = (player, team_name)

            # 5. Count 'Banged Up' Players
            if player.status in ["IR", "PUP", "O", "Q"]:
                banged_up_count += 1

        # Update the most banged-up team
        if banged_up_count > most_banged_up_count:
            most_banged_up_count = banged_up_count
            most_banged_up_team = (team_name, banged_up_count)

    return highest_scorer, lowest_scorer, highest_scorer_bench, lowest_scorer_started, most_banged_up_team


def team_with_most_moves(teams: list) -> str:
    """
    Identify the team with the greatest number of moves/transactions.

    Args:
        teams (list): A list of Team instances.

    Returns:
        str: A descriptive string about the team with the most moves.
    """
    most_moves = 0
    best_team_name = ""

    for team in teams:
        moves = int(team.number_of_moves)
        if moves > most_moves:
            most_moves = moves
            best_team_name = team.name

    return f"The team with the greatest number of moves/transactions is {best_team_name.decode('utf-8')} with {most_moves} moves!"


def analyze_weekly_performance(sc, chosen_week: int) -> dict:
    """
    Analyze weekly performance of teams and matches in the league.

    Args:
        sc: The YahooFantasySportsQuery object.
        chosen_week (int): The specific week to analyze.

    Returns:
        dict: Contains 'highest_scoring_team', 'biggest_blowout',
              'closest_match', and 'biggest_bust' data.
    """
    matchups = sc.get_league_matchups_by_week(chosen_week)

    highest_scoring_team = None
    biggest_blowout = {"teams": None, "point_diff": 0}
    closest_match = {"teams": None, "point_diff": float('inf')}
    biggest_bust = {"team": None, "point_diff": 0}

    for matchup in matchups:
        teams = matchup.teams

        # 1. Highest-Scoring Team
        for t in teams:
            if (highest_scoring_team is None) or (t.team_points.total > highest_scoring_team.team_points.total):
                highest_scoring_team = t

        # 2. Biggest Blowout
        point_diff = round(
            abs(teams[0].team_points.total - teams[1].team_points.total), 2)
        if point_diff > biggest_blowout["point_diff"]:
            biggest_blowout = {"teams": teams, "point_diff": point_diff}

        # 3. Closest Match
        if point_diff < closest_match["point_diff"]:
            closest_match = {"teams": teams, "point_diff": point_diff}

        # 4. Biggest Bust
        for t in teams:
            projected_diff = round(
                t.team_projected_points.total - t.team_points.total, 2)
            if projected_diff > biggest_bust["point_diff"]:
                biggest_bust = {"team": t, "point_diff": projected_diff}

    result = {
        "highest_scoring_team": {
            "name": highest_scoring_team.name.decode('utf-8'),
            "score": highest_scoring_team.team_points.total
        },
        "biggest_blowout": {
            "team_1_name": biggest_blowout["teams"][0].name.decode('utf-8'),
            "team_1_score": biggest_blowout["teams"][0].team_points.total,
            "team_2_name": biggest_blowout["teams"][1].name.decode('utf-8'),
            "team_2_score": biggest_blowout["teams"][1].team_points.total,
            "point_diff": biggest_blowout["point_diff"]
        },
        "closest_match": {
            "team_1_name": closest_match["teams"][0].name.decode('utf-8'),
            "team_1_score": closest_match["teams"][0].team_points.total,
            "team_2_name": closest_match["teams"][1].name.decode('utf-8'),
            "team_2_score": closest_match["teams"][1].team_points.total,
            "point_diff": closest_match["point_diff"]
        },
        "biggest_bust": {
            "name": biggest_bust["team"].name.decode('utf-8'),
            "point_diff": biggest_bust["point_diff"]
        }
    }

    return result


def generate_weekly_recap(sc, week: int) -> str:
    """
    Generate a weekly recap string for the fantasy league.

    Args:
        sc: The YahooFantasySportsQuery object.
        week (int): The week to generate the recap for.

    Returns:
        str: The weekly recap string.
    """
    # Fetch league data
    teams = sc.get_league_teams()
    team_ids = extract_team_ids(teams)
    (
        highest_scorer,
        lowest_scorer,
        highest_scorer_bench,
        lowest_scorer_started,
        most_banged_up_team
    ) = find_extreme_scorers_and_banged_up_team(sc, team_ids, week)

    analysis_result = analyze_weekly_performance(sc, week)

    recap = (
        f"Highest Scoring Team: {analysis_result['highest_scoring_team']['name']} "
        f"with {analysis_result['highest_scoring_team']['score']} points\n"
        f"Current Standings: {get_top_teams_string(sc)}\n"
        f"Highest Scoring Player: {highest_scorer[0].name.full} "
        f"(rostered by: {highest_scorer[1].decode('utf-8')}) "
        f"with {highest_scorer[0].player_points.total} points\n"
        f"Lowest Scoring Player: {lowest_scorer[0].name.full} "
        f"(rostered by: {lowest_scorer[1].decode('utf-8')}) "
        f"with {lowest_scorer[0].player_points.total} points\n"
        f"Highest Scoring Player on Bench: {highest_scorer_bench[0].name.full} "
        f"(rostered by: {highest_scorer_bench[1].decode('utf-8')}) "
        f"with {highest_scorer_bench[0].player_points.total} points\n"
        f"Lowest Scoring Player that Started: {lowest_scorer_started[0].name.full} "
        f"(rostered by: {lowest_scorer_started[1].decode('utf-8')}) "
        f"with {lowest_scorer_started[0].player_points.total} points\n"
        f"Most Banged Up Team: {most_banged_up_team[0].decode('utf-8')} "
        f"with {most_banged_up_team[1]} injured players\n"
        f"{team_with_most_moves(teams)}\n"
        f"Closest Match: {analysis_result['closest_match']['team_1_name']} "
        f"({analysis_result['closest_match']['team_1_score']} points) "
        f"vs {analysis_result['closest_match']['team_2_name']} "
        f"({analysis_result['closest_match']['team_2_score']} points) "
        f"with a point differential of {analysis_result['closest_match']['point_diff']}\n"
        f"Biggest Blowout Match: {analysis_result['biggest_blowout']['team_1_name']} "
        f"({analysis_result['biggest_blowout']['team_1_score']} points) "
        f"vs {analysis_result['biggest_blowout']['team_2_name']} "
        f"({analysis_result['biggest_blowout']['team_2_score']} points) "
        f"with a point differential of {analysis_result['biggest_blowout']['point_diff']}\n"
        f"Biggest Team Bust: {analysis_result['biggest_bust']['name']} "
        f"underperformed by {analysis_result['biggest_bust']['point_diff']} "
        f"points compared to projections"
    )

    return recap


def get_top_teams_string(sc) -> str:
    """
    Retrieve the top 3 teams from the league standings and return a formatted string.

    Args:
        sc: The YahooFantasySportsQuery object.

    Returns:
        str: A formatted string listing the top 3 teams with place, points, etc.
    """
    standings_data = sc.get_league_standings()
    top_3_teams = sorted(standings_data.teams,
                         key=lambda x: x.team_standings.rank)[:3]
    top_teams_str = ", ".join([
        f"{team.name.decode('utf-8')} "
        f"({ordinal(team.team_standings.rank)} place - {team.team_points.total} points)"
        for team in top_3_teams
    ])
    return top_teams_str


def ordinal(n: int) -> str:
    """
    Convert an integer into its ordinal string representation (e.g., 1 -> 1st).

    Args:
        n (int): The integer to convert.

    Returns:
        str: The ordinal representation (e.g., '1st', '2nd', '3rd', etc.).
    """
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"
