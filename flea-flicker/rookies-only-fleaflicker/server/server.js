// server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import config from "../config.js"; // Adjust the path as needed

const app = express();
app.use(cors()); // Enable CORS

// Cache for Sleeper player data to avoid frequent API calls
let sleeperPlayersCache = null;
let sleeperPlayersLastFetched = null;
let playerMatchingMap = null; // Will hold the mapping between Fleaflicker and Sleeper players

// Helper function to fetch Sleeper player data
const fetchSleeperPlayers = async () => {
  // Only fetch new data if cache is empty or older than 24 hours
  const now = new Date();
  if (
    sleeperPlayersCache &&
    sleeperPlayersLastFetched &&
    now - sleeperPlayersLastFetched < 24 * 60 * 60 * 1000
  ) {
    return sleeperPlayersCache;
  }

  try {
    console.log("Fetching Sleeper player data...");
    const response = await axios.get("https://api.sleeper.app/v1/players/nfl");
    sleeperPlayersCache = response.data;
    sleeperPlayersLastFetched = now;
    console.log("Sleeper player data fetched successfully");
    return response.data;
  } catch (error) {
    console.error("Error fetching from Sleeper API:", error.message);
    // If we have a cache, return it even if it's stale
    if (sleeperPlayersCache) return sleeperPlayersCache;
    throw error;
  }
};

// Get Sleeper player data
app.get("/api/sleeper-players", async (req, res) => {
  try {
    const players = await fetchSleeperPlayers();
    res.send(players);
  } catch (error) {
    console.error("Error fetching from Sleeper API:", error.message);
    res.status(500).send("Error fetching from Sleeper API: " + error.message);
  }
});

// Simple helper function to normalize player names for comparison
const normalizeName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\./g, "") // Remove periods
    .replace(/jr$|sr$|ii$|iii$|iv$/i, "") // Remove suffixes
    .trim();
};

// Helper function to match Fleaflicker player with Sleeper player
const findPlayerInSleeper = (playerNameFull, position, sleeperPlayers) => {
  if (!playerNameFull) return null;

  const normalizedName = normalizeName(playerNameFull);
  const positionLower = position?.toLowerCase() || "";

  // For debugging - only do this for first 5 players
  const shouldDebug = findPlayerInSleeper.debuggedPlayerCount < 5;
  if (shouldDebug) {
    findPlayerInSleeper.debuggedPlayerCount++;
    console.log(
      `Looking for match for: "${playerNameFull}" (normalized: "${normalizedName}")`
    );

    // Sample some Sleeper players that might be similar
    const potentialMatches = [];
    for (const [id, sleeperPlayer] of Object.entries(sleeperPlayers)) {
      if (!sleeperPlayer.first_name || !sleeperPlayer.last_name) continue;

      const fullName = `${sleeperPlayer.first_name} ${sleeperPlayer.last_name}`;
      if (
        fullName.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(fullName.toLowerCase())
      ) {
        potentialMatches.push({
          id,
          name: fullName,
          normalizedName: normalizeName(fullName),
          position: sleeperPlayer.position,
        });

        if (potentialMatches.length >= 3) break;
      }
    }

    if (potentialMatches.length > 0) {
      console.log(
        `Potential Sleeper matches for "${playerNameFull}":`,
        potentialMatches
      );
    } else {
      console.log(`No potential matches found for "${playerNameFull}"`);
    }
  }

  // First try exact match with position check
  for (const [id, sleeperPlayer] of Object.entries(sleeperPlayers)) {
    if (!sleeperPlayer.first_name || !sleeperPlayer.last_name) continue;

    const sleeperFullName = normalizeName(
      `${sleeperPlayer.first_name} ${sleeperPlayer.last_name}`
    );
    const sleeperPos = sleeperPlayer.position?.toLowerCase() || "";

    // Exact name match with position check
    if (
      normalizedName === sleeperFullName &&
      (!positionLower || !sleeperPos || positionLower === sleeperPos)
    ) {
      return {
        sleeper_id: id,
        years_exp: sleeperPlayer.years_exp,
        college: sleeperPlayer.college,
        team: sleeperPlayer.team,
        position: sleeperPlayer.position,
        draft_year: sleeperPlayer.draft_year,
        status: sleeperPlayer.status,
        match_type: "exact_match",
      };
    }
  }

  // If no exact match, try more flexible matching
  for (const [id, sleeperPlayer] of Object.entries(sleeperPlayers)) {
    if (!sleeperPlayer.first_name || !sleeperPlayer.last_name) continue;

    const sleeperFullName = normalizeName(
      `${sleeperPlayer.first_name} ${sleeperPlayer.last_name}`
    );
    const sleeperPos = sleeperPlayer.position?.toLowerCase() || "";

    // Skip if positions don't match (when both are specified)
    if (positionLower && sleeperPos && positionLower !== sleeperPos) continue;

    // Try partial name matching - player name contains sleeper name or vice versa
    if (
      normalizedName.includes(sleeperFullName) ||
      sleeperFullName.includes(normalizedName)
    ) {
      return {
        sleeper_id: id,
        years_exp: sleeperPlayer.years_exp,
        college: sleeperPlayer.college,
        team: sleeperPlayer.team,
        position: sleeperPlayer.position,
        draft_year: sleeperPlayer.draft_year,
        status: sleeperPlayer.status,
        match_type: "partial_name_match",
      };
    }

    // Try matching last name with position
    const sleeperLastName = normalizeName(sleeperPlayer.last_name);
    if (
      normalizedName.includes(sleeperLastName) &&
      sleeperPos === positionLower
    ) {
      return {
        sleeper_id: id,
        years_exp: sleeperPlayer.years_exp,
        college: sleeperPlayer.college,
        team: sleeperPlayer.team,
        position: sleeperPlayer.position,
        draft_year: sleeperPlayer.draft_year,
        status: sleeperPlayer.status,
        match_type: "last_name_position_match",
      };
    }
  }

  return null;
};

// Initialize the debug counter
findPlayerInSleeper.debuggedPlayerCount = 0;

// Helper function to get a standardized experience label from years_exp
const getExperienceLabel = (yearsExp) => {
  if (yearsExp === null || yearsExp === undefined) return "Unknown";

  if (yearsExp === 0) return "Rookie";
  if (yearsExp === 1) return "Sophomore";
  if (yearsExp === 2) return "Third Year";
  if (yearsExp >= 3) return "Veteran";

  return "Unknown";
};

// Get Player List
app.get("/api/player-listing", async (req, res) => {
  // These params are for Fleaflicker API only, not needed for Sleeper
  const fleaflickerParams = {
    ...config.commonParams,
    "filter.free_agent_only": true,
    // Include additional parameters if needed
    ...req.query, // Allow overriding via query parameters
  };

  console.log("Fleaflicker API Request Params:", fleaflickerParams);

  try {
    // Fetch Sleeper player data first (no league ID needed for Sleeper API)
    let sleeperPlayers = null;
    try {
      sleeperPlayers = await fetchSleeperPlayers();
    } catch (error) {
      console.warn(
        "Could not fetch Sleeper data, continuing without it:",
        error.message
      );
    }

    // Fetch Fleaflicker data
    const { data } = await axios.get(
      `${config.apiBaseUrl}${config.endpoints.fetchPlayerListing}`,
      {
        params: fleaflickerParams,
      }
    );

    // Detailed debugging of Fleaflicker API response
    console.log(
      "Fleaflicker API response structure:",
      JSON.stringify(Object.keys(data), null, 2)
    );

    if (data && data.players && data.players.length > 0) {
      // Log the full structure of the first player object
      console.log(
        "First player object structure:",
        JSON.stringify(Object.keys(data.players[0]), null, 2)
      );

      // Log the detailed structure of player fields
      if (data.players[0].proPlayer) {
        console.log(
          "proPlayer fields:",
          JSON.stringify(Object.keys(data.players[0].proPlayer), null, 2)
        );
      } else {
        console.log("No proPlayer field found in player object");
      }

      // Log sample data from Fleaflicker to see player names
      console.log("Sample Fleaflicker players:");
      for (let i = 0; i < Math.min(5, data.players.length); i++) {
        const player = data.players[i];
        try {
          console.log(
            `Player ${i + 1}: ${player?.proPlayer?.nameFull || "Unknown"} (${
              player?.proPlayer?.position || "Unknown position"
            })`
          );
        } catch (error) {
          console.log(
            `Error accessing player ${i + 1} properties:`,
            error.message
          );
        }
      }
    } else {
      console.log(
        "No players found in Fleaflicker data or unexpected data format",
        data
      );
    }

    // If we have Sleeper data, augment Fleaflicker data with it
    if (sleeperPlayers && data && data.players) {
      console.log("Total Sleeper players:", Object.keys(sleeperPlayers).length);

      // Process each player to add Sleeper data
      let matchedCount = 0;
      data.players = data.players.map((player) => {
        if (player.proPlayer && player.proPlayer.nameFull) {
          const sleeperData = findPlayerInSleeper(
            player.proPlayer.nameFull,
            player.proPlayer.position,
            sleeperPlayers
          );

          if (sleeperData) {
            matchedCount++;
            player.sleeperData = {
              ...sleeperData,
              experience_label: getExperienceLabel(sleeperData.years_exp),
            };
          }
        }
        return player;
      });

      console.log(
        `Matched ${matchedCount} of ${data.players.length} players with Sleeper data`
      );

      // Log a sample player if any were matched
      if (matchedCount > 0) {
        const samplePlayer = data.players.find((p) => p.sleeperData);
        console.log("Sample matched player:", {
          name: samplePlayer.proPlayer.nameFull,
          sleeperData: samplePlayer.sleeperData,
        });
      }
    }

    res.send(data);
  } catch (error) {
    console.error("Error fetching player data:", error.message);
    res.status(500).send("Error fetching player data: " + error.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`); // Confirm server is running
});
