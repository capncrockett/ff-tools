# Original tracker workbook review

Reviewed the user-provided `League for All Seasons - Original tracker - last update 10-2023.xlsx` on 2026-09-05. Read the workbook's underlying XML locally with Python's standard library, including formulas, cached cell values, sheet visibility, and chart definitions. No spreadsheet package or application dependency was needed. The original workbook was not modified or imported into the live database.

## What the workbook tells us

The main workflow is a roster investment ledger. `Roster` puts acquisition or starting values beside current values for DTC, Nerds dynasty, and Nerds contender scores, with separate percentage changes. Column E records acquisition route, column O holds a Hold/Trade judgment, and column P carries reasoning. Positional subtotals and roster totals show where value sits.

For example, `Roster!F3:H3` compares a DTC starting value of 4.1 with 19.5 using `(G3-F3)/F3`, approximately +375.6%. `I3:K3` independently compares Nerds dynasty values. These are historical workbook entries, not current provider quotes. They confirm the source-specific baseline/current calculation used in the app.

The workbook separates three different ideas: observed value growth, a decision to hold or trade, and possible trade packages. A Hold/Trade cell is intent, not proof of a completed exit. The current app's recorded proceeds remain necessary to establish realized return.

## All sheets reviewed

There are 21 sheets: 13 visible and 8 hidden. Counts below are rows containing a value or formula, not used-range sizes or player counts.

| Sheet                           | Visibility | Nonempty rows | Purpose observed                                                                                                                          |
| ------------------------------- | ---------- | ------------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Roster                          | Visible    |            37 | Player identities, acquisition route, three independent start/current value pairs, percentage growth, notes, positional and roster totals |
| Graphs                          | Visible    |             0 | No cell data; workbook contains DTC and Nerds positional-total charts                                                                     |
| Trade Targets                   | Visible    |            16 | Manager groupings, player ideas, and rough pick-price notes                                                                               |
| Picks                           | Visible    |             8 | Year/round-slot labels with separate starting/current values and percentage changes                                                       |
| Ballers                         | Visible    |            79 | Fantasy Footballers rankings and analyst opinions                                                                                         |
| Nerds Ranking 22                | Visible    |            94 | Rookie rankings, ranges, averages, and dispersion                                                                                         |
| dynasty-nerds-2021-rookies-ppr- | Visible    |            94 | Ranking export; name says 2021, but visible player rows overlap the 2022 sheet, so the name alone cannot date observations                |
| Nerds Ranking                   | Visible    |            76 | Another rookie ranking reference                                                                                                          |
| WR Nerd Score                   | Visible    |            31 | Receiver scouting grades, traits, and notes                                                                                               |
| RB Nerd Score                   | Visible    |            19 | Running back scouting grades, traits, and notes                                                                                           |
| 21 Draft                        | Visible    |             7 | Pick ownership by round/slot, plus counts by manager                                                                                      |
| 22 Draft                        | Visible    |             7 | Another year of pick ownership and counts                                                                                                 |
| Nerds 400-911                   | Hidden     |           402 | Rankings, analyst spread, and a side list of players                                                                                      |
| 2020 Rankings                   | Hidden     |            69 | Rookie ranking reference and notes                                                                                                        |
| Nerds 2020 Post-Draft           | Hidden     |            79 | Post-draft rookie reference                                                                                                               |
| Nerds 2020 Pre-Draft            | Hidden     |            43 | Pre-draft rookie reference and scouting notes                                                                                             |
| Rookie Rankings 2019            | Hidden     |            21 | Rookie reference and notes                                                                                                                |
| Rookie Rankings 2018            | Hidden     |            76 | Tiers, positions, and scouting notes                                                                                                      |
| Three Way                       | Hidden     |            32 | Proposed multi-team packages, asset values, and summed incoming/outgoing comparisons                                                      |
| ranking_export_20200911050949   | Hidden     |           367 | Rank, best/worst, average, and standard deviation export                                                                                  |
| Cas V Hog                       | Visible    |            32 | Weekly score comparison, separate from trade value                                                                                        |

The two chart definitions are titled `DTC Pos Totals` and `Nerds Pos Totals`. The review inspected chart metadata, not a rendered Excel view.

## Applied to this MVP

- Add a collapsible guide that maps Player values to the roster sheet and My investments to explicitly recorded entries/exits.
- Explain the starting value, previous capture, latest value, source scales, capture time, targets, and realized return beside the corresponding controls.
- Include an interactive example showing why change since the previous capture differs from growth since the baseline.
- Show one row per player with Dynasty GM and DTC values side by side, as the user clarified after this review. The 58 saved source series appear across 29 player rows; investment entries still require an explicitly saved cost or benchmark.
- Show the initial 20% target calculation and points still needed in the entry form. Preserve the distinction between historical cost and a deliberately chosen starting benchmark.
- The earlier DTC automatic-refresh issue was resolved by the official position-export flow and reverified with a guarded live capture on 2026-09-13. Capture is available. The user subsequently confirmed that players DTC does not list are worth zero there; saved capture status identifies that rule. Dynasty GM lists the whole player pool, so it gets no such zeros. See [current source behavior](sources.md#limits-and-failures).

## Preserve for later, without expanding this slice

Acquisition route, player-level Hold/Trade intent and notes, positional totals, pick identity, and package allocation are useful follow-up candidates. Nerds contender scores are a separate metric from dynasty value. Scouting grades, rankings, and weekly fantasy scores must not be imported as calculator trade values. Existing Grill Me answers keep whole-market scouting and historical reconstruction outside the immediate MVP.

The workbook is not a uniform historical snapshot. Headers mix acquisition values and benchmark dates; current columns say 10/11/23 while starting columns use other dates. `Roster!C3` uses `TODAY()` to calculate age, so recalculated formula results are not frozen in October 2023. A missing birthday produces an implausible age in `C32`. Values of 0.1 occur repeatedly, but the file does not establish whether every such value is a genuine provider quote or a placeholder. No missing value should be inferred from those cells.

Any later historical import needs confirmed source, metric, scoring format, dates, and player identities. Preserve the workbook as evidence and keep starting/current pairs source-specific; do not overwrite today's tracking baseline or treat draft/manager notes as completed trades.
