// PlayersList.jsx
import * as React from "react";
import List from "@mui/material/List";
import Player from "./Player";

const PlayersList = ({ players }) => {
  if (!players || players.length === 0) {
    return <p>No players available</p>;
  }

  return (
    <List sx={{ width: "100%" }}>
      {players.map((player, index) => (
        <Player key={index} player={player} />
      ))}
    </List>
  );
};

export default PlayersList;
