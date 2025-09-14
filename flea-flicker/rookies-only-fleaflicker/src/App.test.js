import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import App from "./App";

describe("App Component", () => {
  const mock = new MockAdapter(axios);

  beforeEach(() => {
    mock.reset();
  });

  it("fetches and displays roster names", async () => {
    // Mock the API call
    mock
      .onGet("http://localhost:3001/api/league-rosters", {
        params: { sport: "NFL", league_id: 343168, season: 2023 },
      })
      .reply(200, {
        rosters: [
          {
            team: { name: "Team One" },
            players: [{ proPlayer: { name: "Player One" } }],
          },
          { team: { name: "Team Two" } },
          { team: { name: "Team Three" } },
          { team: { name: "Team Four" } },
        ],
      });

    const { getByText } = render(<App />);

    // Check for the loading state before data is fetched
    expect(getByText(/Loading.../i)).toBeInTheDocument();

    // Await for async actions and effects to finish
    await waitFor(() => {
      expect(getByText("Team One")).toBeInTheDocument();
      expect(getByText("Team Two")).toBeInTheDocument();
      expect(getByText("Team Three")).toBeInTheDocument();
      expect(getByText("Team Four")).toBeInTheDocument();
      expect(getByText("Player One")).toBeInTheDocument(); // Verifying the first player of the first team is shown
    });
  });

  it("displays error message on API failure", async () => {
    // Mock the API fail scenario
    mock.onGet("http://localhost:3001/api/league-rosters").networkError();

    const { getByText } = render(<App />);

    await waitFor(() => {
      expect(getByText(/Error fetching rosters/i)).toBeInTheDocument();
    });
  });
});
