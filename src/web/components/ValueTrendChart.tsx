import type { MarketRow } from '../../shared/tracker'

const colors = [
  '#247760',
  '#a75d73',
  '#5572ad',
  '#a17628',
  '#7c5aa6',
  '#b45843',
  '#397d91',
  '#64753a',
]

function seriesColor(playerId: number) {
  return colors[Math.abs(playerId) % colors.length]
}

export default function ValueTrendChart({
  series,
  sourceLabel,
  onSelect,
}: {
  series: MarketRow[]
  sourceLabel: string
  onSelect: (row: MarketRow) => void
}) {
  if (!series.length)
    return (
      <div className="empty-chart">
        <p className="font-semibold">No saved values match these filters.</p>
        <p className="text-sm opacity-60">Choose another position, source, or format.</p>
      </div>
    )

  const allPoints = series.flatMap((row) => row.history)
  const times = allPoints.map((point) => Date.parse(point.capturedAt))
  const values = allPoints.map((point) => point.value)
  const firstTime = Math.min(...times)
  const lastTime = Math.max(...times)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueSpread = Math.max(maxValue - minValue, 1)
  const x = (time: number) => 58 + ((time - firstTime) / Math.max(lastTime - firstTime, 1)) * 682
  const y = (value: number) => 270 - ((value - minValue) / valueSpread) * 220
  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <figure className="trend-chart">
      <div className="trend-chart-frame">
        <svg
          viewBox="0 0 770 320"
          role="img"
          aria-label={`${sourceLabel} value trends for ${series.length} ${series.length === 1 ? 'player' : 'players'}`}
        >
          {yTicks.map((tick) => {
            const value = maxValue - tick * (maxValue - minValue)
            const chartY = 50 + tick * 220
            return (
              <g key={tick}>
                <line x1="58" x2="740" y1={chartY} y2={chartY} stroke="currentColor" opacity=".1" />
                <text x="51" y={chartY + 4} textAnchor="end" fontSize="11" fill="currentColor">
                  {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </text>
              </g>
            )
          })}
          {series.map((row) => {
            const color = seriesColor(row.playerId)
            const path = row.history
              .map((point, index) => {
                const chartX = x(Date.parse(point.capturedAt))
                return `${index ? 'L' : 'M'}${chartX},${y(point.value)}`
              })
              .join(' ')
            return (
              <g key={row.playerId} data-trend-line={row.playerName}>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                {row.history.map((point) => (
                  <circle
                    key={point.capturedAt}
                    cx={x(Date.parse(point.capturedAt))}
                    cy={y(point.value)}
                    r="3.5"
                    fill={color}
                  >
                    <title>
                      {row.playerName} - {new Date(point.capturedAt).toLocaleString()}:{' '}
                      {point.value.toLocaleString()}
                    </title>
                  </circle>
                ))}
              </g>
            )
          })}
          <text x="58" y="303" fontSize="11" fill="currentColor">
            {new Date(firstTime).toLocaleDateString()}
          </text>
          <text x="740" y="303" textAnchor="end" fontSize="11" fill="currentColor">
            {new Date(lastTime).toLocaleDateString()}
          </text>
        </svg>
      </div>
      <div className="trend-legend" aria-label="Chart players">
        {series.map((row) => (
          <button
            type="button"
            key={row.playerId}
            onClick={() => onSelect(row)}
            aria-label={`View ${row.playerName} history`}
          >
            <span className="trend-swatch" style={{ background: seriesColor(row.playerId) }} />
            <span>{row.playerName}</span>
          </button>
        ))}
      </div>
      <figcaption>
        Captured observations only. Each line uses this provider and format; values between captures
        are unknown.
      </figcaption>
    </figure>
  )
}
