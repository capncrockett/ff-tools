import datetime

import streamlit as st
from streamlit.logger import get_logger
from espn_api.football import League
from yfpy.query import YahooFantasySportsQuery
from sleeper_wrapper import League as SleeperLeague

from utils import espn_helper, yahoo_helper, sleeper_helper, helper

LOGGER = get_logger(__name__)


def moderate_text(client, text: str) -> bool:
    """
    Send a moderation request to the given client to evaluate the text.

    Args:
        client: The moderation client (e.g., OpenAI client).
        text (str): The text to be moderated.

    Returns:
        bool: True if text is approved (not flagged), False otherwise.
    """
    try:
        response = client.moderations.create(
            input=text,
            model="text-moderation-latest"  # Use the latest moderation model
        )
        result = response["results"][0]
        if result["flagged"]:
            flagged_categories = [
                category
                for category, flagged in result["categories"].items()
                if flagged
            ]
            LOGGER.warning(
                f"Moderation flagged the following categories: {', '.join(flagged_categories)}"
            )
            return False
        return True
    except Exception as e:
        LOGGER.error(f"An error occurred during moderation: {e}")
        # Assume text is inappropriate in case of an error
        return False


def generate_gpt4_summary_streaming(client, summary: str, character_choice: str, trash_talk_level: int):
    """
    Generate a GPT-4 style summary of fantasy football data using streaming responses.

    Args:
        client: The GPT-4 client.
        summary (str): Summary containing the most recent weekly stats.
        character_choice (str): The style or persona in which to generate the recap.
        trash_talk_level (int): Trash talk intensity on a scale of 1-10.

    Yields:
        str: Portions of the GPT-4 generated summary, streamed in chunks.
    """
    instruction = (
        f"You will be provided a summary below containing the most recent weekly stats "
        f"for a fantasy football league. Create a weekly recap in the style of "
        f"{character_choice}. Do not simply repeat every single stat verbatim - be creative "
        f"while calling out stats and being on theme. You should include trash talk with a level "
        f"of {trash_talk_level} on a scale of 1-10 (1=no trash talk, 10=hardcore trash talk). "
        f"Feel free to make fun of or praise team names and performances, and add humor "
        f"related to the chosen character. Keep your summary concise (under 800 characters) so as "
        f"not to overwhelm the user, but still engaging, funny, thematic, and insightful. "
        f"You can sprinkle in a few emojis if they are thematic. Only respond in character, "
        f"and do not reply with anything other than your recap. Begin by introducing your character. "
        f"Here is the provided weekly fantasy summary: {summary}"
    )

    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": instruction}
    ]

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Replace with the appropriate model name
            messages=messages,
            max_tokens=1600,
            stream=True
        )

        for chunk in response:
            # Access 'content' if present in the chunk
            if hasattr(chunk.choices[0].delta, "content"):
                yield chunk.choices[0].delta.content

    except Exception as e:
        yield f"Error details: {e}"


def generate_espn_summary(league: League, current_week: int) -> str:
    """
    Generate a human-friendly summary of weekly ESPN Fantasy Football league stats.

    Args:
        league (League): The ESPN league object.
        current_week (int): The current week (e.g., `league.current_week - 1`).

    Returns:
        str: A formatted human-friendly summary of league stats.
    """
    start_time = datetime.datetime.now()
    top_teams = espn_helper.top_three_teams(league)
    LOGGER.info(
        f"Time for top_three_teams: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    top_scorer_week = espn_helper.top_scorer_of_week(league, current_week)
    LOGGER.info(
        f"Time for top_scorer_of_week: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    worst_scorer_week = espn_helper.worst_scorer_of_week(league, current_week)
    LOGGER.info(
        f"Time for worst_scorer_of_week: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    top_scorer_szn = espn_helper.top_scorer_of_season(league)
    LOGGER.info(
        f"Time for top_scorer_of_season: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    worst_scorer_szn = espn_helper.worst_scorer_of_season(league)
    LOGGER.info(
        f"Time for worst_scorer_of_season: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    most_trans = espn_helper.team_with_most_transactions(league)
    LOGGER.info(
        f"Time for team_with_most_transactions: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    most_injured = espn_helper.team_with_most_injured_players(league)
    LOGGER.info(
        f"Time for team_with_most_injured_players: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    highest_bench = espn_helper.highest_scoring_benched_player(
        league, current_week)
    LOGGER.info(
        f"Time for highest_scoring_benched_player: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    lowest_start = espn_helper.lowest_scoring_starting_player(
        league, current_week)
    LOGGER.info(
        f"Time for lowest_scoring_starting_player: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    biggest_blowout = espn_helper.biggest_blowout_match(league, current_week)
    LOGGER.info(
        f"Time for biggest_blowout_match: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    closest_game = espn_helper.closest_game_match(league, current_week)
    LOGGER.info(
        f"Time for closest_game_match: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    start_time = datetime.datetime.now()
    top_scoring_team_week = espn_helper.highest_scoring_team(
        league, current_week)
    LOGGER.info(
        f"Time for highest_scoring_team: {(datetime.datetime.now() - start_time).total_seconds()} seconds"
    )

    summary = f"""
    - Top scoring fantasy team this week: {top_scoring_team_week}
    - Top 3 fantasy teams:
      {espn_helper.clean_team_name(top_teams[0].team_name)},
      {espn_helper.clean_team_name(top_teams[1].team_name)},
      {espn_helper.clean_team_name(top_teams[2].team_name)}
    - Top scoring NFL player of the week: {top_scorer_week[0].name} with {top_scorer_week[1]} points.
    - Worst scoring NFL player of the week: {worst_scorer_week[0].name} with {worst_scorer_week[1]} points.
    - Top scoring NFL player of the season: {top_scorer_szn[0].name} with {top_scorer_szn[1]} points.
    - Worst scoring NFL player of the season: {worst_scorer_szn[0].name} with {worst_scorer_szn[1]} points.
    - Fantasy Team with the most transactions: {espn_helper.clean_team_name(most_trans[0].team_name)} ({most_trans[1]} transactions)
    - Fantasy Team with the most injured players:
      {espn_helper.clean_team_name(most_injured[0].team_name)}
      ({most_injured[1]} players: {', '.join(most_injured[2])})
    - Highest scoring benched player: {highest_bench[0].name} with {highest_bench[0].points} points
      (Rostered by {espn_helper.clean_team_name(highest_bench[1].team_name)})
    - Lowest scoring starting player of the week: {lowest_start[0].name} with {lowest_start[0].points} points
      (Rostered by {espn_helper.clean_team_name(lowest_start[1].team_name)})
    - Biggest blowout match of the week:
      {espn_helper.clean_team_name(biggest_blowout.home_team.team_name)} ({biggest_blowout.home_score} points)
      vs {espn_helper.clean_team_name(biggest_blowout.away_team.team_name)} ({biggest_blowout.away_score} points)
    - Closest game of the week:
      {espn_helper.clean_team_name(closest_game.home_team.team_name)} ({closest_game.home_score} points)
      vs {espn_helper.clean_team_name(closest_game.away_team.team_name)} ({closest_game.away_score} points)
    """
    return summary.strip()


@st.cache_data(ttl=3600)
def get_espn_league_summary(league_id: str, espn_s2: str, swid: str):
    """
    Fetch and compute ESPN Fantasy Football league data, then return a summary and debug info.

    Args:
        league_id (str): The ESPN league ID.
        espn_s2 (str): ESPN authentication token.
        swid (str): ESPN SWID (user ID).

    Returns:
        tuple: (summary (str), debug_info (str)) containing the league summary and debug info.
    """
    start_time_league_connect = datetime.datetime.now()

    year = 2024
    try:
        league = League(league_id=league_id, year=year,
                        espn_s2=espn_s2, swid=swid)
    except Exception as e:
        return str(e), "Error occurred during validation"

    end_time_league_connect = datetime.datetime.now()
    league_connect_duration = (
        end_time_league_connect - start_time_league_connect).total_seconds()

    # Use the previous week if current_week is not completed
    current_week = league.current_week - 1

    start_time_summary = datetime.datetime.now()
    summary = generate_espn_summary(league, current_week)
    end_time_summary = datetime.datetime.now()
    summary_duration = (end_time_summary - start_time_summary).total_seconds()

    debug_info = (
        f"Summary: {summary} ~~~Timings~~~ "
        f"League Connect Duration: {league_connect_duration} seconds "
        f"Summary Duration: {summary_duration} seconds "
    )
    return summary, debug_info


@st.cache_data(ttl=3600)
def get_yahoo_league_summary(league_id: str, auth_path: str) -> str:
    """
    Fetch and compute Yahoo Fantasy Football league data, then return a weekly recap.

    Args:
        league_id (str): The Yahoo league ID.
        auth_path (str): File path for Yahoo API authentication.

    Returns:
        str: The weekly recap string for the specified league.
    """
    LOGGER.info(f"Yahoo League ID: {league_id}")
    sc = YahooFantasySportsQuery(
        auth_dir=auth_path,
        league_id=league_id,
        game_code="nfl"
    )
    LOGGER.info(f"YahooFantasySportsQuery object created: {sc}")

    most_recent_week = yahoo_helper.get_most_recent_week(sc)
    recap = yahoo_helper.generate_weekly_recap(sc, week=most_recent_week)
    return recap


@st.cache_data(ttl=3600)
def generate_sleeper_summary(league_id: str) -> str:
    """
    Generate a human-friendly summary of weekly Sleeper Fantasy Football league stats.

    Args:
        league_id (str): The Sleeper league ID.

    Returns:
        str: A formatted human-friendly summary of the league's stats for the most recent week.
    """
    league = SleeperLeague(league_id)
    current_date_today = datetime.datetime.now()
    # Force always using the most recent completed week
    week = helper.get_current_week(current_date_today) - 1

    rosters = league.get_rosters()
    users = league.get_users()
    matchups = league.get_matchups(week)
    standings = league.get_standings(rosters, users)

    players_url = "https://raw.githubusercontent.com/jeisey/commish/main/players_data.json"
    players_data = sleeper_helper.load_player_data(players_url)

    user_team_mapping = league.map_users_to_team_name(users)
    roster_owner_mapping = league.map_rosterid_to_ownerid(rosters)

    scoreboards = sleeper_helper.calculate_scoreboards(
        matchups, user_team_mapping, roster_owner_mapping
    )

    highest_scoring_team_name, highest_scoring_team_score = sleeper_helper.highest_scoring_team_of_week(
        scoreboards
    )
    top_3_teams_result = sleeper_helper.top_3_teams(standings)
    highest_scoring_player_week, weekly_score, highest_scoring_player_team_week = (
        sleeper_helper.highest_scoring_player_of_week(
            matchups, players_data, user_team_mapping, roster_owner_mapping
        )
    )
    lowest_scoring_starter, lowest_starter_score, lowest_scoring_starter_team = (
        sleeper_helper.lowest_scoring_starter_of_week(
            matchups, players_data, user_team_mapping, roster_owner_mapping
        )
    )
    highest_scoring_benched_player, highest_benched_score, highest_scoring_benched_player_team = (
        sleeper_helper.highest_scoring_benched_player_of_week(
            matchups, players_data, user_team_mapping, roster_owner_mapping
        )
    )
    blowout_teams, point_differential_blowout = sleeper_helper.biggest_blowout_match_of_week(
        scoreboards
    )
    close_teams, point_differential_close = sleeper_helper.closest_match_of_week(
        scoreboards)
    hottest_streak_team, longest_streak = sleeper_helper.team_on_hottest_streak(
        rosters, user_team_mapping, roster_owner_mapping
    )

    summary = (
        f"The highest scoring team of the week: {highest_scoring_team_name} "
        f"with {round(highest_scoring_team_score, 2)} points\n"
        "Standings; Top 3 Teams:\n"
        f"  1. {top_3_teams_result[0][0]} - {top_3_teams_result[0][3]} points "
        f"({top_3_teams_result[0][1]}W-{top_3_teams_result[0][2]}L)\n"
        f"  2. {top_3_teams_result[1][0]} - {top_3_teams_result[1][3]} points "
        f"({top_3_teams_result[1][1]}W-{top_3_teams_result[1][2]}L)\n"
        f"  3. {top_3_teams_result[2][0]} - {top_3_teams_result[2][3]} points "
        f"({top_3_teams_result[2][1]}W-{top_3_teams_result[2][2]}L)\n"
        f"Highest scoring player of the week: {highest_scoring_player_week} "
        f"with {weekly_score} points (Team: {highest_scoring_player_team_week})\n"
        f"Lowest scoring player of the week that started: {lowest_scoring_starter} "
        f"with {lowest_starter_score} points (Team: {lowest_scoring_starter_team})\n"
        f"Highest scoring benched player of the week: {highest_scoring_benched_player} "
        f"with {highest_benched_score} points (Team: {highest_scoring_benched_player_team})\n"
        f"Biggest blowout match of the week: {blowout_teams[0]} vs {blowout_teams[1]} "
        f"(Point Differential: {round(point_differential_blowout, 2)})\n"
        f"Closest match of the week: {close_teams[0]} vs {close_teams[1]} "
        f"(Point Differential: {round(point_differential_close, 2)})\n"
        f"Team on the hottest streak: {hottest_streak_team} with a {longest_streak} game win streak"
    )

    LOGGER.info(f"Sleeper Summary Generated: \n{summary}")
    return summary
