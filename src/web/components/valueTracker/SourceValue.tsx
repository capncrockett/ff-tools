import { isTrackerValueFresh, sourceLabels, type MarketRow } from '../../../shared/tracker'
import { date, number, percent } from './format'

export default function SourceValue({
  row,
  onDetail,
}: {
  row: MarketRow
  onDetail: (row: MarketRow) => void
}) {
  return (
    <div className="source-value">
      <button
        className="value-number"
        onClick={() => onDetail(row)}
        aria-label={`View ${row.playerName} history from ${sourceLabels[row.source]}: ${row.contextLabel}`}
      >
        {number(row.value)}
      </button>
      <div
        className={`text-xs ${row.baselineChangePct === null ? 'muted' : row.baselineChangePct >= 0 ? 'positive' : 'negative'}`}
      >
        {row.baselineChangePct === null ? 'Growth unavailable' : percent(row.baselineChangePct)}{' '}
        <span className="muted">since start ({number(row.baselineValue)})</span>
      </div>
      <div className="context-label">{row.contextLabel}</div>
      <div className="source-capture text-xs muted">
        <time dateTime={row.capturedAt}>{date(row.capturedAt)}</time>
        {row.observations === 1 && <span> / First capture</span>}
      </div>
      {!isTrackerValueFresh(row.capturedAt) && (
        <div className="text-warning text-xs">Over 36 hours old</div>
      )}
    </div>
  )
}
