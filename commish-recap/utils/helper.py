import pytz
from datetime import datetime
from typing import Tuple, Optional


def check_availability() -> Tuple[bool, str]:
    """
    Determine if the current time (Eastern Time) falls within a specific availability window:
      - Tuesday 4 AM (EST) onward, all day Wednesday (EST), all day Thursday (EST) until 7 PM.

    Returns:
        tuple:
            - bool: True if within the availability window, False otherwise.
            - str: The name of the current day (e.g., 'Tuesday').
    """
    est = pytz.timezone("US/Eastern")
    now_est = datetime.now(est)
    current_hour = now_est.hour
    current_day = now_est.weekday()  # Monday=0, Tuesday=1, etc.

    # Tuesday 4 AM (weekday==1, hour >=4)
    if current_day == 1 and current_hour >= 4:
        return True, now_est.strftime("%A")

    # Wednesday (weekday==2) or Thursday (weekday==3) all day
    elif 1 < current_day < 4:
        return True, now_est.strftime("%A")

    # Friday (weekday==4) until 7 PM
    elif current_day == 4 and current_hour < 19:
        return True, now_est.strftime("%A")

    # Otherwise, not available
    return False, now_est.strftime("%A")


def get_current_week(
    current_date: datetime,
    date_week_dict: Optional[dict] = None
) -> Optional[int]:
    """
    Determine the current NFL week based on a provided date.

    By default, this uses a dictionary of key dates for the 2024 season. You can pass a
    custom dictionary to handle future seasons. Each key in the dictionary should be a string
    in 'MM/DD/YYYY' format, and each value should be the corresponding week number.

    The function will find the latest date in the dictionary that is <= current_date
    and return its associated week.

    Args:
        current_date (datetime): The date to evaluate for determining the current week.
        date_week_dict (dict, optional): Custom dictionary mapping string dates ('MM/DD/YYYY')
                                         to week numbers. Defaults to a 2024 NFL schedule.

    Returns:
        int or None: The current NFL week number if found, otherwise None.
    """
    if date_week_dict is None:
        # Default mapping for the 2024 season
        date_week_dict = {
            "9/10/2024": 1, "9/17/2024": 2, "9/24/2024": 3, "10/1/2024": 4,
            "10/8/2024": 5, "10/15/2024": 6, "10/22/2024": 7, "10/29/2024": 8,
            "11/5/2024": 9, "11/12/2024": 10, "11/19/2024": 11, "11/26/2024": 12,
            "12/3/2024": 13, "12/10/2024": 14, "12/17/2024": 15, "12/24/2024": 16
        }

    # Convert string dates to datetime objects
    date_week_converted = {
        datetime.strptime(date_str, "%m/%d/%Y"): week
        for date_str, week in date_week_dict.items()
    }

    # Sort dates in descending order
    sorted_dates = sorted(date_week_converted.keys(), reverse=True)

    # Find the most recent date that is <= current_date
    for dt in sorted_dates:
        if current_date >= dt:
            return date_week_converted[dt]

    return None
