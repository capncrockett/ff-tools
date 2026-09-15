import { useState, type FormEvent } from 'react'
import { sourceLabels, type SourceName } from '../../../shared/tracker'
import { api } from '../../api'
import Modal from '../Modal'

type ImportFormProps = {
  onClose: () => void
  onSaved: () => Promise<void>
}

export default function ImportForm({ onClose, onSaved }: ImportFormProps) {
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState<SourceName>('dynasty-nerds'),
    [format, setFormat] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 3_000_000) throw new Error('Choose a file smaller than 3 MB.')
      const text = await file.text()
      if (file.name.toLowerCase().endsWith('.json'))
        await api('/api/snapshots/import', JSON.parse(text))
      else {
        if (!format.trim()) throw new Error('Describe the original scoring format for this CSV.')
        const response = await fetch(
          `/api/valuations/import?source=${source}&format=${encodeURIComponent(format)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'text/csv', 'x-tracker-request': '1' },
            body: text,
          },
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
      }
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import a dated snapshot" onClose={onClose}>
      <p className="text-sm muted mb-4">
        Bring in existing observations. Each file contains one source, format, and capture time. No
        historical values are invented.
      </p>
      <form className="tracker-form" onSubmit={submit}>
        <label>
          Snapshot file (.csv or .json)
          <input
            className="file-input"
            type="file"
            accept=".csv,.json"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label>
          CSV source
          <select
            className="select"
            value={source}
            onChange={(event) => setSource(event.target.value as SourceName)}
          >
            {Object.entries(sourceLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV original scoring format
          <input
            className="input"
            placeholder="12 teams, 1QB, PPR, no TE premium"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
            maxLength={180}
          />
        </label>
        <p className="text-xs muted">
          CSV columns: player_name, value, captured_at. Optional: source_key, sleeper_id, position,
          team. Use an ISO timestamp with timezone. JSON uses the snapshot schema described in the
          README.
        </p>
        <p className="text-xs muted">
          Excel workbooks need their sheets, dates, and value types reviewed first. This importer
          currently accepts dated CSV or snapshot JSON files.
        </p>
        {error && (
          <p className="text-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Importing...' : 'Import snapshot'}
        </button>
      </form>
    </Modal>
  )
}
