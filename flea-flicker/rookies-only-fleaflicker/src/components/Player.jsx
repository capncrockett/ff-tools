// Player.jsx
import React from "react";
import {
  Card,
  CardContent,
  ListItem,
  ListItemAvatar,
  Avatar,
  Typography,
  Box,
  IconButton,
  Grid,
  Divider,
  Chip,
} from "@mui/material";
import { SportsFootball, TrendingUp, Note } from "@mui/icons-material";

const Player = ({ player }) => {
  const {
    proPlayer,
    isInjured,
    isTrendingUp,
    hasNotes,
    age,
    draft_year,
    sleeperData,
  } = player;

  // Debug log to see what sleeperData contains
  console.log(
    `Player ${proPlayer?.nameFull || "unknown"} sleeperData:`,
    sleeperData ? sleeperData : "No Sleeper data"
  );

  // Function to get experience label from Sleeper years_exp
  const getSleeperExperienceLabel = (yearsExp) => {
    if (yearsExp === undefined || yearsExp === null) return null;

    if (yearsExp === 0) return "Rookie";
    if (yearsExp === 1) return "2nd Year";
    if (yearsExp === 2) return "3rd Year";
    if (yearsExp >= 3) return `${yearsExp + 1}th Year`;

    return null;
  };

  return (
    <>
      <Card variant="outlined" sx={{ marginBottom: 2 }}>
        <ListItem alignItems="flex-start">
          <ListItemAvatar>
            <Avatar alt={proPlayer.nameFull} src={proPlayer.headshotUrl} />
          </ListItemAvatar>
          <CardContent sx={{ flexGrow: 1 }}>
            {/* Player Details */}
            <Typography variant="h6">{proPlayer.nameFull}</Typography>
            <Typography variant="body2" color="text.secondary">
              {proPlayer.position} | {proPlayer.proTeamAbbreviation}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Age: {age || "N/A"} | Draft Year: {draft_year || "N/A"}
            </Typography>

            {/* Experience Information */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                mt: 1,
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              {sleeperData && (
                <Chip
                  size="small"
                  label={`Sleeper: ${
                    sleeperData.years_exp !== undefined
                      ? sleeperData.years_exp
                      : "N/A"
                  } years (${
                    sleeperData.experience_label ||
                    getSleeperExperienceLabel(sleeperData.years_exp)
                  })`}
                  color="primary"
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              )}
            </Box>

            {/* Additional Details */}
            <Grid container spacing={1} sx={{ marginTop: 1 }}>
              {/* Show additional Sleeper data if available */}
              {sleeperData && (
                <>
                  <Grid item xs={8}>
                    <Typography variant="body2">Sleeper Team</Typography>
                    <Typography variant="body1">
                      {sleeperData.team || "N/A"}
                    </Typography>
                  </Grid>
                </>
              )}
            </Grid>
          </CardContent>
          {/* Icons */}
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {isInjured && (
              <IconButton aria-label="injured" title="Injured">
                <SportsFootball sx={{ color: "red" }} />
              </IconButton>
            )}
            {isTrendingUp && (
              <IconButton aria-label="trending" title="Trending Up">
                <TrendingUp sx={{ color: "green" }} />
              </IconButton>
            )}
            {hasNotes && (
              <IconButton aria-label="notes" title="Has Notes">
                <Note sx={{ color: "orange" }} />
              </IconButton>
            )}
          </Box>
        </ListItem>
      </Card>
      <Divider component="li" />
    </>
  );
};

export default Player;
