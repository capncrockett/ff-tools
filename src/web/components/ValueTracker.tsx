import React, { useEffect, useMemo, useState } from 'react'

type Row = {
  playerName: string
  source: string
  value: number
  capturedAt: string
}

export default function ValueTracker() {
  const [data, setData] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<string>('all')

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/valuations/latest')
      if (!res.ok) throw new Error('Failed to load valuations')
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const sources = useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => set.add(d.source))
    return ['all', ...Array.from(set).sort()]
  }, [data])

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return data.filter(r =>
      (!s || r.playerName.toLowerCase().includes(s)) &&
      (source === 'all' || r.source === source)
    )
  }, [data, search, source])

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="card-title">Dynasty Value Tracker</h2>
            <p className="opacity-70">Read-only view of latest valuations per player.</p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="form-control">
              <label className="label"><span className="label-text">Search</span></label>
              <input className="input input-bordered" placeholder="Player name" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Source</span></label>
              <select className="select select-bordered" value={source} onChange={e => setSource(e.target.value)}>
                {sources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className={`btn btn-primary ${loading ? 'btn-disabled' : ''}`} onClick={fetchData}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error mt-3">{error}</div>}

        <div className="overflow-x-auto mt-4">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Source</th>
                <th className="text-right">Value</th>
                <th>Captured</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center opacity-60">No data</td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr key={`${r.playerName}-${r.source}-${i}`}>
                  <td>{r.playerName}</td>
                  <td><span className="badge badge-ghost badge-sm">{r.source}</span></td>
                  <td className="text-right">{Number.isFinite(r.value) ? r.value.toFixed(1) : r.value}</td>
                  <td>{new Date(r.capturedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

