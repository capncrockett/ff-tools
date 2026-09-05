import type { HistoryPoint } from '../../shared/tracker'

export default function HistoryChart({ points, label }: { points: HistoryPoint[]; label: string }) {
  if (points.length < 2)
    return (
      <div className="empty-chart">
        <span className="text-3xl">1</span>
        <p>First observation saved.</p>
        <p className="text-sm opacity-60">
          Your next capture starts the trend. Earlier values are unknown.
        </p>
      </div>
    )
  const times = points.map((p) => Date.parse(p.capturedAt)),
    values = points.map((p) => p.value)
  const min = Math.min(...values),
    max = Math.max(...values),
    spread = Math.max(max - min, 1)
  const x = (t: number) =>
    45 + ((t - times[0]) / Math.max(times[times.length - 1] - times[0], 1)) * 610
  const y = (v: number) => 180 - ((v - min) / spread) * 140
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i])},${y(p.value)}`).join(' ')
  return (
    <figure className="chart">
      <svg
        viewBox="0 0 700 230"
        role="img"
        aria-label={`${label}: ${points.length} observations, ${values[0]} to ${values[values.length - 1]}`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="45"
              x2="655"
              y1={40 + t * 140}
              y2={40 + t * 140}
              stroke="currentColor"
              opacity=".12"
            />
            <text x="40" y={44 + t * 140} textAnchor="end" fontSize="11" fill="currentColor">
              {Math.round(max - t * (max - min)).toLocaleString()}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--tracker-accent)" strokeWidth="3" />
        {points.map((p, i) => (
          <circle
            key={`${p.capturedAt}-${i}`}
            cx={x(times[i])}
            cy={y(p.value)}
            r="4"
            fill="var(--tracker-accent)"
          >
            <title>
              {new Date(p.capturedAt).toLocaleString()}: {p.value.toLocaleString()}
            </title>
          </circle>
        ))}
        <text x="45" y="214" fontSize="12" fill="currentColor">
          {new Date(times[0]).toLocaleDateString()}
        </text>
        <text x="655" y="214" fontSize="12" textAnchor="end" fill="currentColor">
          {new Date(times[times.length - 1]).toLocaleDateString()}
        </text>
      </svg>
      <figcaption className="text-xs opacity-60">
        Captured observations only. Lines connect captures; values between them are unknown.
      </figcaption>
    </figure>
  )
}
