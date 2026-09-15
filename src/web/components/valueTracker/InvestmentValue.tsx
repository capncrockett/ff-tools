import type { HoldingView } from '../../../shared/tracker'
import { number, percent } from './format'

export default function InvestmentValue({ holdings }: { holdings: HoldingView[] }) {
  if (!holdings.length) return <span className="muted">No entry</span>

  return (
    <div className="investment-values">
      {holdings.map((holding) => {
        const shown = holding.closedAt ? holding.proceeds : holding.currentValue
        return (
          <div key={holding.id} className="investment-value">
            <strong>
              {number(holding.costBasis)} <span aria-hidden="true">-&gt;</span> {number(shown)}
            </strong>
            <span
              className={
                holding.gain === null ? 'muted' : holding.gain >= 0 ? 'positive' : 'negative'
              }
            >
              {holding.costBasis === 0 ? 'ROI undefined' : percent(holding.roi)}
            </span>
            <span className="text-xs muted">
              {holding.contextLabel} /{' '}
              {holding.targetValue === null
                ? 'absolute gain'
                : `${number(holding.targetValue)} target`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
