export const trackerHelp = {
  players:
    'Each player appears once, with Dynasty GM and DTC values in separate columns. Previously captured players stay in history after leaving the roster.',
  investments:
    'Entries you have saved and have not exited. Capturing your roster does not create investment entries. One player can have separate entries for different sources or a later reacquisition.',
  targets:
    'Open entries whose latest value meets their chosen target, using the same source and format. Only observations from the last 36 hours count here. This is potential return, not a completed trade.',
  alerts:
    "Target alerts use each holding's configured return. Sharp moves mean at least 10% since the previous capture. Values become stale after 36 hours. Provider disagreement compares percentage movement from each provider's own baseline only when both are fresh; raw point scales are never compared.",
  exits:
    'Investment entries with a saved player-level exit value. Use the same provider and format as the entry. A later reacquisition creates a new entry.',
  source:
    'One row is one player, with a column for each provider. DTC and Dynasty GM use different value scales. Compare growth within a source. The Dynasty GM PPR approximation for this half-PPR league is intentional.',
  values:
    'Latest saved trade value, with growth since this source and format began tracking. Starting value is in parentheses, separate from entry cost. Click the value for dated history. Missing values are labeled; formats stay separate. Sorting uses the most recently captured format for that source.',
  trends:
    'One line per player using a single provider and scoring format. Filter by position to compare similar players. Click a player in the legend for exact dated observations. Provider scales are never combined.',
  latest:
    'The newest saved value for this player, source, and format. It is a calculator trade value, not fantasy points, dollars, or a guaranteed trade offer. A failed refresh leaves the last saved value available.',
  previous:
    'Growth from the preceding capture in this same series: (latest - previous) / previous x 100. First capture means there is no earlier observation. A zero previous value has no percentage comparison.',
  baseline:
    'Growth from the first dated observation saved for this source and format, like your roster sheet starting/current comparison: (latest - baseline) / baseline x 100. This is separate from entry cost. Importing earlier history moves this baseline earlier.',
  captured:
    'When this tool observed the value, not when the provider last changed it. Over 36 hours old is marked stale. A date on a saved value does not mean a refresh happened when you opened this page.',
  entry:
    'Record the cost or chosen starting benchmark for an investment in this source, with a date and notes. This does not trade, add, or remove a player in Sleeper. Choose the source whose points you want to use for return.',
  reload:
    'Reads history already saved on this computer. It does not visit either provider or consume the hourly capture allowance. Capture values is the separate action that requests a new observation.',
  capture:
    'Visits the selected provider and saves a dated observation of its supported roster values. There is at least one hour between attempts, even failures. Page loads and saved-data reloads do not capture values. Nightly collection is not enabled yet.',
  cost: 'Your recorded entry value and the latest saved quote in the same source and format. After an exit, this shows the saved player exit value instead. An observation from before your entry date cannot establish your current return.',
  roi: 'Return is (value - entry cost) / entry cost x 100. Open entries use the latest eligible quote; closed entries use the saved player exit value. A zero-cost entry has absolute gain but no percentage ROI.',
  target:
    'Entry cost x (1 + target percent / 100). At a cost of 100 and a 20% target, the target value is 120. Reaching it is an unrealized signal. Zero-cost entries show absolute gain instead.',
  status:
    'Holding means below target. Target reached means a recent quote meets the target. Needs fresh value means the quote is stale or no post-entry quote exists. Realized means you recorded an exit.',
} as const
