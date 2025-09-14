import React, { useState, useEffect } from "react";
import PlayersList from "./PlayersList";
import axios from "axios";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Stack from "@mui/material/Stack";

const PlayersContainer = () => {
  const [players, setPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All"); // Default filter

  useEffect(() => {
    axios
      .get("http://localhost:3001/api/player-listing", {
        params: {
          sport: "NFL",
          sort: "SORT_PROJECTIONS",
          league_id: 343168,
        },
      })
      .then((response) => {
        if (response.data && response.data.players) {
          setPlayers(response.data.players);
          setFilteredPlayers(response.data.players); // Set initial filtered list

          // Log player with Sleeper data for debugging
          const playersWithSleeperData = response.data.players.filter(
            (player) => player.sleeperData
          );
          console.log(
            `Found ${playersWithSleeperData.length} players with Sleeper data`
          );
          if (playersWithSleeperData.length > 0) {
            console.log(
              "Sample player with Sleeper data:",
              playersWithSleeperData[0]
            );
          }
        } else {
          console.error("No players found in the response");
          setPlayers([]);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        if (error.response) {
          console.error("Error response data:", error.response.data);
          console.error("Error response status:", error.response.status);
        }
        setLoading(false);
      });
  }, []);

  // Function to handle filtering based on experience
  const handleFilter = (experience) => {
    setFilter(experience);
    if (experience === "All") {
      setFilteredPlayers(players);
    } else {
      setFilteredPlayers(
        players.filter((player) => {
          if (experience === "Rookie") return player.proPlayer.is_rookie;
          if (experience === "Sophomore")
            return player.proPlayer.experience === 2; // Assuming experience level 2 is Sophomore
          if (experience === "Veteran") return player.proPlayer.experience > 2; // Veteran filter
          return false;
        })
      );
    }
  };

  if (loading) {
    return <Typography variant="h6">Loading players...</Typography>;
  }

  // Count players with Sleeper data for debugging
  const playersWithSleeperDataCount = players.filter(
    (player) => player.sleeperData
  ).length;

  return (
    <div>
      {/* Include a small debug indicator that Sleeper data is available */}
      <Typography variant="caption" sx={{ display: "block", marginBottom: 1 }}>
        Players with Sleeper data: {playersWithSleeperDataCount}
      </Typography>

      <Stack spacing={2} direction="row" sx={{ marginBottom: 2 }}>
        <ButtonGroup
          variant="contained"
          aria-label="outlined primary button group"
        >
          <Button onClick={() => handleFilter("All")}>All</Button>
          <Button onClick={() => handleFilter("Rookie")}>Rookie</Button>
          <Button onClick={() => handleFilter("Sophomore")}>Sophomore</Button>
          <Button onClick={() => handleFilter("Veteran")}>Veteran</Button>
        </ButtonGroup>
      </Stack>
      <PlayersList players={filteredPlayers} />
    </div>
  );
};

export default PlayersContainer;
