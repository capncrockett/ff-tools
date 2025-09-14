import React, { useState, useEffect } from "react";
import axios from "axios";

const ScoringPeriodRange = () => {
  const [scoringPeriodRange, setScoringPeriodRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get("http://localhost:3001/api/league-rosters", {
        params: {
          sport: "NFL",
          league_id: 343168,
          season: 2024,
          // Add any other parameters
        },
      })
      .then((response) => {
        setScoringPeriodRange(response.data.rosters || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("There was an error!", error);
        setError(error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error fetching rosters: {error.message}</div>;
  }
  console.table(scoringPeriodRange);

  return (
    <div>
      {/* Render your scoring period range data here */}
      <h3>This should be the scoring div</h3>
      <p>{scoringPeriodRange.players}</p>
    </div>
  );
};

export default ScoringPeriodRange;
