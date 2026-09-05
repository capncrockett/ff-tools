import { useState } from 'react'
import { calculateReturn, percentageChange } from '../../shared/tracker'

export default function TrackerGuide() {
  const [latest, setLatest] = useState('125')
  const value = latest.trim() === '' ? null : Number(latest)
  const valid = value !== null && Number.isFinite(value) && value >= 0
  const result = calculateReturn(100, valid ? value : null, 20)
  const percent = (n: number | null) =>
    n === null ? 'Enter a value' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
  return (
    <details className="tracker-guide">
      <summary>
        <span>How to use this tracker</span>
        <span className="guide-summary-note">Values, entry, then exit</span>
      </summary>
      <div className="guide-content">
        <ol className="guide-steps">
          <li>
            <strong>1. Watch your roster's value</strong>
            <p>
              Player values is your old roster sheet: a starting value, a current value, and
              percentage growth for each source. Click a player's name for dated history. A first
              capture sets the baseline; the next one can show movement.
            </p>
          </li>
          <li>
            <strong>2. Record an entry and target</strong>
            <p>
              Use Record entry to choose the value you are measuring return against and a start
              date. For a benchmark starting today, note that choice in Entry notes. My investments
              starts empty until you save an entry. The initial target is 20%, editable before
              saving.
            </p>
          </li>
          <li>
            <strong>3. Record an exit after a trade</strong>
            <p>
              A target reached is a reason to consider selling. After a completed trade, enter the
              value you actually received using the same provider's points. That records realized
              return. A hold/sell idea alone is not an exit.
            </p>
          </li>
        </ol>
        <div className="guide-example">
          <div>
            <strong>A small example</strong>
            <p>Starting value 100. Previous capture 110. Entry cost 100. Target 20%.</p>
            <label htmlFor="example-latest">Try a latest value (example only)</label>
            <input
              id="example-latest"
              type="number"
              min="0"
              max="1000000"
              step="any"
              className="input input-bordered input-sm"
              value={latest}
              onChange={(event) => setLatest(event.target.value)}
              aria-describedby="example-note"
            />
            <p id="example-note">
              This changes only the example. Your saved values and investments stay as they are.
            </p>
          </div>
          <dl aria-live="polite">
            <div>
              <dt>Since last capture</dt>
              <dd>{percent(valid ? percentageChange(value, 110) : null)}</dd>
            </div>
            <div>
              <dt>Since tracking began</dt>
              <dd>{percent(result.roi)}</dd>
            </div>
            <div>
              <dt>Target value</dt>
              <dd>120 points</dd>
            </div>
            <div>
              <dt>Signal</dt>
              <dd>
                {!valid
                  ? 'Enter a value'
                  : result.targetReached
                    ? 'Target reached, still unrealized'
                    : 'Below target'}
              </dd>
            </div>
          </dl>
          <p className="guide-example-exit">
            If you later trade out for 115 points, the realized return is (115 - 100) / 100 = +15%,
            whatever the latest quote says.
          </p>
        </div>
        <p className="guide-source-note">
          Two sources can produce two rows for the same player. Each uses its own points and scoring
          format: Dynasty GM uses PPR here; DTC uses half-PPR. Fantasy scoring points and calculator
          trade-value points are different measurements.
        </p>
      </div>
    </details>
  )
}
