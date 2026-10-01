import { useEffect, useState } from 'react'
import { api } from '../api'
import { sourceLabels } from '../../shared/tracker'
import type {
  PlayerMatchReview as ReviewData,
  PlayerMatchRow,
  ReviewPlayer,
} from '../../shared/playerReview'
import Modal from './Modal'

export default function PlayerMatchReview({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState('all')
  const [scope, setScope] = useState('roster')
  const [status, setStatus] = useState('review')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<PlayerMatchRow | null>(null)
  const [players, setPlayers] = useState<ReviewPlayer[]>([])
  const [playerId, setPlayerId] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const query = new URLSearchParams({
      scope,
      status,
      search,
      ...(source === 'all' ? {} : { source }),
    })
    api<ReviewData>(`/api/player-matches?${query}`)
      .then((next) => {
        if (active) setData(next)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [source, scope, status, search, revision])
  function choose(row: PlayerMatchRow) {
    setSelected(row)
    setPlayers(
      row.candidates.some((p) => p.id === row.linked?.id) || !row.linked
        ? row.candidates
        : [row.linked, ...row.candidates],
    )
    setPlayerId('')
    setPlayerSearch(row.name)
    setError('')
    setNotice('')
  }
  async function searchPlayers() {
    if (!selected || !playerSearch.trim()) return
    setBusy(true)
    setError('')
    try {
      setPlayers(
        await api<ReviewPlayer[]>(
          `/api/player-matches/players?${new URLSearchParams({ search: playerSearch.trim(), position: selected.position })}`,
        ),
      )
      setPlayerId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Player search failed.')
    } finally {
      setBusy(false)
    }
  }
  async function save(remove = false) {
    if (!selected || (!remove && !playerId)) return
    setBusy(true)
    setError('')
    try {
      await api('/api/player-matches/link', {
        source: selected.source,
        key: selected.key,
        playerId: remove ? null : Number(playerId),
      })
      setNotice(
        remove
          ? 'Player link removed. Saved history is unchanged.'
          : 'Player link saved. Future captures use this decision. Saved history is unchanged.',
      )
      setSelected(null)
      setRevision((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the player link.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Review player matches" onClose={onClose}>
      <p className="text-sm mb-4">
        Resolve your roster first. Confirm identity using Sleeper's birth date; provider dates or
        ages may differ. Each saved link is your explicit decision.
      </p>
      {error && (
        <div className="alert alert-error mb-3" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success mb-3" role="status">
          {notice}
        </div>
      )}
      {selected ? (
        <div className="space-y-4">
          <p>
            <strong>{selected.name}</strong> ({selected.position}) - {sourceLabels[selected.source]}
            <br />
            Provider birth date: {selected.birthDate ?? 'Unavailable'}; age:{' '}
            {selected.age ?? 'Unavailable'}
            <br />
            {selected.note}
          </p>
          <label className="block">
            Find a Sleeper player
            <input
              className="input input-bordered w-full"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              maxLength={100}
              disabled={busy}
            />
          </label>
          <button
            className="btn btn-outline btn-sm"
            onClick={searchPlayers}
            disabled={busy || !playerSearch.trim()}
          >
            Search Sleeper players
          </button>
          <label className="block">
            Confirm Sleeper player
            <select
              className="select select-bordered w-full"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a player explicitly</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.position}) - born {p.birthDate ?? 'unknown'} - Sleeper {p.sleeperId}
                  {p.rostered ? ' - On roster' : ''}
                </option>
              ))}
            </select>
          </label>
          {!players.length && <p>No name match. Search for the correct Sleeper spelling.</p>}
          {selected.linked && (
            <p>
              Currently linked to {selected.linked.name} (Sleeper {selected.linked.sleeperId}).
            </p>
          )}
          <p className="text-sm">
            Changing a link affects future captures. Earlier observations and acquisition records
            keep their recorded player.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || !playerId} onClick={() => save()}>
              Confirm player link
            </button>
            {selected.linked && (
              <button className="btn btn-outline" disabled={busy} onClick={() => save(true)}>
                Remove existing link
              </button>
            )}
            <button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>
              Back to matches
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <label>
              Provider
              <select
                className="select select-bordered w-full"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="all">Both providers</option>
                <option value="dynasty-nerds">Dynasty GM</option>
                <option value="dynasty-calculator">DTC</option>
              </select>
            </label>
            <label>
              Player scope
              <select
                className="select select-bordered w-full"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="roster">My roster first</option>
                <option value="all">All catalog players</option>
              </select>
            </label>
            <label>
              Match status
              <select
                className="select select-bordered w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="review">Needs review</option>
                <option value="all">All matches (including linked)</option>
              </select>
            </label>
            <label>
              Search provider players
              <input
                className="input input-bordered w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={100}
              />
            </label>
          </div>
          {!data ? (
            <p role="status">Loading saved player matches...</p>
          ) : (
            <>
              {!data.rosterAvailable && (
                <p className="mb-3">
                  No saved Sleeper roster yet. Choose All catalog players to review saved matches.
                </p>
              )}
              <p className="text-sm mb-3">
                {data.total} matches
                {data.total > data.rows.length
                  ? `; showing the first ${data.rows.length}. Search to narrow the list`
                  : ''}
                .
              </p>
              {!data.rows.length && <p>No player matches need review with these filters.</p>}
              <ul className="space-y-3">
                {data.rows.map((row) => (
                  <li
                    key={`${row.source}:${row.key}`}
                    className="border border-base-300 rounded-lg p-3"
                  >
                    <div className="flex justify-between gap-2 flex-wrap">
                      <strong className="break-words min-w-0">
                        {row.name} ({row.position})
                      </strong>
                      <span>{sourceLabels[row.source]}</span>
                    </div>
                    <p className="text-sm">
                      {row.rostered ? 'On roster' : 'Outside saved roster'} - {row.status}
                      {row.method === 'manual' ? ' - Confirmed manually' : ''}
                      {!row.current ? ' - Not in latest export' : ''}
                    </p>
                    <p className="text-sm break-words">{row.note}</p>
                    {row.linked && <p className="text-sm">Sleeper: {row.linked.name}</p>}
                    <button className="btn btn-outline btn-sm mt-2" onClick={() => choose(row)}>
                      {row.linked ? 'Change link' : 'Review match'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
