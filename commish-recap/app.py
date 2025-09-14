import os
import json
import time
import shutil
import tempfile
import traceback

import requests
import streamlit as st
from requests.auth import HTTPBasicAuth
from openai import OpenAI
from streamlit.logger import get_logger

from utils import summary_generator
from utils.helper import check_availability

LOGGER = get_logger(__name__)

OPENAI_API_KEY = st.secrets["OPENAI_COMMISH_API_KEY"]
client = OpenAI(api_key=OPENAI_API_KEY)

st.set_page_config(
    page_title="Commish.ai",
    page_icon="🏈",
    layout="centered",
    initial_sidebar_state="expanded"
)


def main():
    """
    The primary function for running the Streamlit app.

    Workflow:
      1. Display instructions for the user.
      2. Show league options (ESPN, Yahoo, Sleeper) in the sidebar.
      3. Depending on the chosen league, prompt for relevant credentials.
      4. Perform optional Yahoo OAuth flow if needed.
      5. On submit, validate inputs and generate a fantasy league summary.
      6. Stream a GPT-4–style summary in real time.
    """
    st.write("""
    ## Instructions:

    1. **Select your league type** from the sidebar.
    2. **Fill out the required fields** based on your league selection:
        - **ESPN**:
            - *League ID*
            - *SWID*
            - *ESPN_S2*
        - **Yahoo**:
            - *League ID*
            - Follow OAuth steps to obtain an authorization code.
        - **Sleeper**:
            - *League ID*
    3. **Click "🤖 Generate AI Summary"** to get your weekly summary.
    """)

    with st.sidebar:
        st.sidebar.image("logo.png", use_container_width=True)
        is_available, today = check_availability()
        if is_available:
            st.success(
                f"Today is {today}. The most recent week is completed and a recap is available."
            )
        else:
            st.warning(
                "Recaps are best generated between Tuesday 4am EST and Thursday 7pm EST. "
                "Please come back during this window for the most accurate recap."
            )

        selected_league_type = st.selectbox(
            "Select League Type", ["Select", "ESPN", "Yahoo", "Sleeper"], key="league_type"
        )

    if selected_league_type != "Select":
        # Use a form to gather relevant inputs
        with st.sidebar.form(key="league_form"):
            if selected_league_type == "ESPN":
                st.text_input("LeagueID", key="LeagueID")
                st.text_input("SWID", key="SWID")
                st.text_input("ESPN_S2", key="ESPN2_Id")
            elif selected_league_type == "Yahoo":
                league_id = st.text_input("LeagueID", key="LeagueID")
                client_id = st.secrets["YAHOO_CLIENT_ID"]
                client_secret = st.secrets["YAHOO_CLIENT_SECRET"]

                if not client_id or not client_secret:
                    st.error(
                        "Yahoo Client ID or Secret not set. Please configure YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET."
                    )
                    st.stop()

                redirect_uri = "oob"
                auth_page = (
                    f"https://api.login.yahoo.com/oauth2/request_auth?client_id={client_id}"
                    f"&redirect_uri={redirect_uri}&response_type=code"
                )

                # Session state handling
                if "auth_code" not in st.session_state:
                    st.session_state["auth_code"] = ""
                if "access_token" not in st.session_state:
                    st.session_state["access_token"] = ""
                if "refresh_token" not in st.session_state:
                    st.session_state["refresh_token"] = ""

                st.write(
                    "1. [Click here to authenticate with Yahoo](" + auth_page + ")")
                st.write("2. Paste the authorization code below:")

                auth_code = st.text_input("Authorization Code")

                if auth_code:
                    st.session_state["auth_code"] = auth_code
                    st.success("Authorization code received!")

                if st.session_state["auth_code"] and not st.session_state["access_token"]:
                    # Exchange auth code for access token
                    basic_auth = HTTPBasicAuth(client_id, client_secret)
                    data = {
                        "redirect_uri": redirect_uri,
                        "code": st.session_state["auth_code"],
                        "grant_type": "authorization_code"
                    }
                    try:
                        resp = requests.post(
                            "https://api.login.yahoo.com/oauth2/get_token",
                            data=data,
                            auth=basic_auth
                        )
                        resp.raise_for_status()
                        token_data = resp.json()
                        st.session_state["access_token"] = token_data.get(
                            "access_token", "")
                        st.session_state["refresh_token"] = token_data.get(
                            "refresh_token", "")
                        st.session_state["token_time"] = time.time()
                        st.success("Access token received!")
                    except requests.exceptions.HTTPError as err:
                        st.error(f"HTTP error occurred: {err}")
                    except Exception as err:
                        st.error(f"An error occurred: {err}")

                # If we have an access token, create token/private files
                temp_dir = None
                if st.session_state["access_token"]:
                    temp_dir = tempfile.mkdtemp()
                    if league_id:
                        token_file_path = os.path.join(temp_dir, "token.json")
                        private_file_path = os.path.join(
                            temp_dir, "private.json")

                        # Build token.json
                        token_data = {
                            "access_token": st.session_state["access_token"],
                            "consumer_key": client_id,
                            "consumer_secret": client_secret,
                            "guid": None,
                            "refresh_token": st.session_state["refresh_token"],
                            "expires_in": 3600,
                            "token_time": st.session_state["token_time"],
                            "token_type": "bearer"
                        }
                        with open(token_file_path, "w") as f:
                            json.dump(token_data, f)

                        # Build private.json
                        private_data = {
                            "consumer_key": client_id,
                            "consumer_secret": client_secret
                        }
                        with open(private_file_path, "w") as f:
                            json.dump(private_data, f)

            elif selected_league_type == "Sleeper":
                st.text_input("LeagueID", key="LeagueID")

            st.text_input(
                "Character Description",
                key="Character Description",
                placeholder="Dwight Schrute",
                help="Describe a persona for the AI to adopt (e.g. 'Dwight Schrute', 'a drunk Captain Jack Sparrow')"
            )
            st.slider(
                "Trash Talk Level", 1, 10, 5,
                key="Trash Talk Level",
                help="Scale of 1 (friendly banter) to 10 (more extreme trash talk)"
            )
            submit_button = st.form_submit_button("🤖 Generate AI Summary")

        # Process the form submission
        if submit_button:
            try:
                progress = st.progress(0)
                progress.text("Starting...")
                progress.progress(0)

                required_fields = ["LeagueID",
                                   "Character Description", "Trash Talk Level"]
                if selected_league_type == "ESPN":
                    required_fields.extend(["SWID", "ESPN2_Id"])

                # Validate required fields
                progress.text("Validating credentials...")
                progress.progress(5)
                for field in required_fields:
                    value = st.session_state.get(field, None)
                    if not value:
                        st.error(f"{field} is required.")
                        return

                league_id = st.session_state.get("LeagueID", "Not provided")
                character_description = st.session_state.get(
                    "Character Description", "Not provided")
                trash_talk_level = st.session_state.get("Trash Talk Level", 5)
                swid = st.session_state.get("SWID", "Not provided")
                espn_s2 = st.session_state.get("ESPN2_Id", "Not provided")

                # (Optional) Moderate the character description
                progress.text("Validating character...")
                progress.progress(15)
                # if not summary_generator.moderate_text(client, character_description):
                #     st.error("Character description contains inappropriate content. Please try again.")
                #     return

                # Fetch the league summary
                progress.text("Fetching league summary...")
                progress.progress(30)
                if selected_league_type == "ESPN":
                    LOGGER.debug("Attempting ESPN summary generator...")
                    summary_text, debug_info = summary_generator.get_espn_league_summary(
                        league_id, espn_s2, swid
                    )
                    LOGGER.debug("~~ ESPN DEBUG INFO ~~")
                    LOGGER.debug(debug_info)
                    LOGGER.debug("~~ ESPN SUMMARY BELOW ~~")
                    LOGGER.debug(summary_text)

                elif selected_league_type == "Yahoo":
                    summary_text = summary_generator.get_yahoo_league_summary(
                        league_id, temp_dir
                    )
                    LOGGER.debug(summary_text)
                    st.write("Completed summary query, cleaning up temp files...")
                    if temp_dir:
                        shutil.rmtree(temp_dir)
                    st.write("Cleanup done! Creating AI summary now...")

                elif selected_league_type == "Sleeper":
                    summary_text = summary_generator.generate_sleeper_summary(
                        league_id)
                    LOGGER.debug(summary_text)
                    LOGGER.info(f"Sleeper Summary Generated:\n{summary_text}")
                    # For debugging or future dev, you might remove this line:
                    st.write(summary_text)

                # Generate the AI recap
                progress.text("Generating AI summary...")
                progress.progress(50)
                LOGGER.debug("Initializing GPT summary stream...")

                try:
                    gpt4_stream = summary_generator.generate_gpt4_summary_streaming(
                        client, summary_text, character_description, trash_talk_level
                    )
                    LOGGER.debug(
                        f"Generator object initialized: {gpt4_stream}")

                    with st.chat_message("Commish", avatar="🤖"):
                        message_placeholder = st.empty()
                        full_response = ""

                        for chunk in gpt4_stream:
                            if chunk is not None:
                                full_response += chunk
                                message_placeholder.markdown(
                                    full_response + "▌")
                                LOGGER.debug(f"Received chunk: {chunk}")

                        # Finalize response output
                        message_placeholder.markdown(full_response)

                    st.markdown(
                        "**Click the copy icon** 📋 on the right of the code block "
                        "to copy your summary."
                    )
                    st.code(full_response, language="")

                except Exception as e:
                    LOGGER.error(f"Error during GPT-4 streaming: {e}")
                    st.error(f"An error occurred: {str(e)}")
                    st.text(traceback.format_exc())

                # Wrap up
                progress.text("Done!")
                progress.progress(100)

            except Exception as e:
                st.error(f"An error occurred: {str(e)}")
                LOGGER.exception(e)
                st.text(traceback.format_exc())


if __name__ == "__main__":
    main()
