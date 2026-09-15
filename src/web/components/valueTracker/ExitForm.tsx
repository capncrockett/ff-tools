import { useState, type FormEvent } from 'react'
import { calculateReturn, sourceLabels, type HoldingView } from '../../../shared/tracker'
import { api } from '../../api'
import Modal from '../Modal'
import { number, percent, today } from './format'

type ExitFormProps = {
  holding: HoldingView
  onClose: () => void
  onSaved: () => Promise<void>
}

export default function ExitForm({ holding, onClose, onSaved }: ExitFormProps) {
  const [proceeds, setProceeds] = useState(''),
    [closed, setClosed] = useState(today()),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const result =
    proceeds !== '' ? calculateReturn(holding.costBasis, Number(proceeds), holding.targetRoi) : null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api(`/api/holdings/${holding.id}/exit`, {
        proceeds: Number(proceeds),
        closedAt: new Date(`${closed}T00:00:00`).toISOString(),
      })
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Record exit: ${holding.playerName}`} onClose={onClose}>
      <p className="text-sm muted mb-4">
        Enter this player's value when it left your roster, using {sourceLabels[holding.sourceName]}{' '}
        points in the entry format.
      </p>
      <form className="tracker-form" onSubmit={submit}>
        <label>
          Player exit value (provider points)
          <input
            autoFocus
            className="input"
            type="number"
            min="0"
            max="1000000000"
            step="any"
            value={proceeds}
            aria-describedby="exit-proceeds-help"
            onChange={(event) => setProceeds(event.target.value)}
            required
          />
          <span id="exit-proceeds-help" className="field-hint">
            This manual value is the fallback until Sleeper transaction automation is implemented.
            Saving closes this entry; a later reacquisition is a new entry.
          </span>
        </label>
        <label>
          Exit date
          <input
            className="input"
            type="date"
            value={closed}
            min={holding.acquiredAt.slice(0, 10)}
            max={today()}
            onChange={(event) => setClosed(event.target.value)}
            required
          />
        </label>
        {result && (
          <div className="calculation">
            {number(Number(proceeds))} - {number(holding.costBasis)} ={' '}
            <strong>{number(result.gain)} points realized</strong>
            <p>
              {holding.costBasis > 0
                ? percent(result.roi)
                : 'Zero cost: percentage ROI is undefined.'}
            </p>
          </div>
        )}
        {error && (
          <p className="text-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save exit'}
        </button>
      </form>
    </Modal>
  )
}
