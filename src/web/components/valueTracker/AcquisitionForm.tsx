import { useState, type FormEvent } from 'react'
import { calculateReturn, sourceLabels, type MarketRow } from '../../../shared/tracker'
import { api } from '../../api'
import { trackerHelp } from '../../trackerHelp'
import HelpTip from '../HelpTip'
import Modal from '../Modal'
import { number, today } from './format'

type AcquisitionFormProps = {
  rows: MarketRow[]
  onClose: () => void
  onSaved: () => Promise<void>
}

export default function AcquisitionForm({ rows, onClose, onSaved }: AcquisitionFormProps) {
  const [selected, setSelected] = useState(`${rows[0].source}:${rows[0].contextKey}`)
  const row =
    rows.find((candidate) => `${candidate.source}:${candidate.contextKey}` === selected) ?? rows[0]
  const [cost, setCost] = useState(''),
    [target, setTarget] = useState('20'),
    [acquired, setAcquired] = useState(today()),
    [portfolio, setPortfolio] = useState('A League For All Seasons')
  const [notes, setNotes] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const result = cost !== '' ? calculateReturn(Number(cost), row.value, Number(target)) : null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/holdings', {
        playerId: row.playerId,
        sourceName: row.source,
        contextKey: row.contextKey,
        portfolio,
        acquiredAt: new Date(`${acquired}T00:00:00`).toISOString(),
        costBasis: Number(cost),
        targetRoi: Number(target),
        notes,
      })
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Record entry: ${row.playerName}`} onClose={onClose}>
      <p className="text-sm muted mb-4">
        {sourceLabels[row.source]} / {row.contextLabel}. Latest observed value: {number(row.value)}.
      </p>
      <p className="form-intro">
        This is the starting value for this investment. Your captured roster stays in Player values
        whether or not you record an entry.{' '}
        <HelpTip label="entry cost and starting benchmarks">{trackerHelp.entry}</HelpTip>
      </p>
      <form onSubmit={submit} className="tracker-form">
        <label>
          <span id="entry-source-label">Value source</span>
          <select
            className="select"
            aria-labelledby="entry-source-label"
            aria-describedby="entry-source-help"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value)
              setCost('')
            }}
          >
            {rows.map((candidate) => (
              <option
                key={`${candidate.source}:${candidate.contextKey}`}
                value={`${candidate.source}:${candidate.contextKey}`}
              >
                {sourceLabels[candidate.source]} / {candidate.contextLabel}
              </option>
            ))}
          </select>
          <span id="entry-source-help" className="field-hint">
            Choose the source for this entry's cost and return. Changing source clears the cost
            because the points use different scales.
          </span>
        </label>
        <label>
          Portfolio
          <input
            className="input"
            value={portfolio}
            onChange={(event) => setPortfolio(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <div className="form-grid">
          <label>
            Entry cost (provider points)
            <input
              autoFocus
              className="input"
              type="number"
              min="0"
              max="1000000000"
              step="any"
              placeholder="What you invested"
              value={cost}
              aria-describedby="entry-cost-help"
              onChange={(event) => setCost(event.target.value)}
              required
            />
            <span id="entry-cost-help" className="field-hint">
              Use this provider's points. If you choose a starting benchmark instead of historical
              cost, explain it in Entry notes.
            </span>
          </label>
          <label>
            Target ROI (%)
            <input
              className="input"
              type="number"
              min="0"
              max="10000"
              step="any"
              value={target}
              aria-describedby="entry-target-help"
              onChange={(event) => setTarget(event.target.value)}
              required
            />
            <span id="entry-target-help" className="field-hint">
              At 100 points, a 20% target means 120 points. You can change this percentage before
              saving.
            </span>
          </label>
        </div>
        <label>
          Acquisition date
          <input
            className="input"
            type="date"
            max={today()}
            value={acquired}
            onChange={(event) => setAcquired(event.target.value)}
            required
          />
        </label>
        <label>
          Entry notes
          <textarea
            className="textarea"
            placeholder="Trade details or how you allocated the cost"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
          />
        </label>
        {result && (
          <div className="calculation">
            <strong>
              {result.targetValue === null
                ? 'Zero cost: percentage ROI is undefined'
                : `Target value: ${number(result.targetValue)} points`}
            </strong>
            <p>
              {result.targetValue === null
                ? `Absolute gain at latest observation: ${number(result.gain)} points.`
                : `${number(Number(cost))} x (1 + ${target} / 100) = ${number(result.targetValue)}`}
            </p>
            <p className="text-xs">
              Your recorded cost stays separate from the first observed value. No earlier prices are
              inferred.
            </p>
            {result.targetValue !== null && (
              <p className="text-xs">
                At the latest quote:{' '}
                {result.targetReached
                  ? 'target reached, still unrealized'
                  : `${number(Math.max(0, result.targetValue - row.value))} more points to target`}
                .
              </p>
            )}
          </div>
        )}
        {error && (
          <p className="text-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save acquisition'}
        </button>
      </form>
    </Modal>
  )
}
