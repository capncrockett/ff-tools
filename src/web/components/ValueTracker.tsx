import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import {
  calculateReturn,
  sourceLabels,
  type Dashboard,
  type MarketRow,
  type HoldingView,
  type SourceName,
} from '../../shared/tracker'
import HistoryChart from './HistoryChart'
import Modal from './Modal'
import HelpTip from './HelpTip'
import TrackerGuide from './TrackerGuide'
import { trackerHelp } from '../trackerHelp'

const number = (n: number | null | undefined) =>
  n == null ? 'Unavailable' : n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const percent = (n: number | null) =>
  n === null ? 'No baseline' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'No capture yet'
const stale = (time: string | null) => !time || Date.now() - Date.parse(time) > 7 * 86_400_000
const empty: Dashboard = { market: [], holdings: [], sources: [] }
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ValueTracker() {
  const [data, setData] = useState<Dashboard>(empty),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState('')
  const [source, setSource] = useState('all'),
    [position, setPosition] = useState('all'),
    [view, setView] = useState<'market' | 'portfolio'>('market')
  const [detail, setDetail] = useState<MarketRow | null>(null),
    [acquire, setAcquire] = useState<MarketRow | null>(null),
    [exit, setExit] = useState<HoldingView | null>(null)
  const [showImport, setShowImport] = useState(false),
    [sort, setSort] = useState('name'),
    [portfolio, setPortfolio] = useState('all')
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    // Only update the local countdown. This never fetches data or contacts a provider.
    const timer = window.setInterval(() => setClock(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const reload = useCallback(async () => {
    const next = await api<Dashboard>('/api/tracker')
    setData(next)
  }, [])
  useEffect(() => {
    let active = true
    api<Dashboard>('/api/tracker')
      .then((next) => {
        if (active) setData(next)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  const action = async (key: string, task: () => Promise<unknown>, success: string) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await task()
      setNotice(success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      try {
        await reload()
      } catch {
        setError((prev) => prev || 'Could not reload saved data. Check the local server.')
      }
      setBusy(null)
    }
  }
  const market = useMemo(
    () =>
      data.market
        .filter(
          (r) =>
            (source === 'all' || r.source === source) &&
            (position === 'all' || r.position === position) &&
            r.playerName.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'change'
            ? (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity)
            : sort === 'baseline'
              ? (b.baselineChangePct ?? -Infinity) - (a.baselineChangePct ?? -Infinity)
              : a.playerName.localeCompare(b.playerName),
        ),
    [data.market, source, position, search, sort],
  )
  const holdings = data.holdings.filter(
    (h) =>
      (source === 'all' || h.sourceName === source) &&
      (portfolio === 'all' || h.portfolio === portfolio) &&
      h.playerName.toLowerCase().includes(search.toLowerCase()),
  )
  const open = data.holdings.filter((h) => !h.closedAt),
    targets = open.filter((h) => h.targetReached && !stale(h.capturedAt))
  const portfolios = [...new Set(data.holdings.map((h) => h.portfolio))]
  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">A LEAGUE FOR ALL SEASONS</p>
          <h1>Dynasty Value Tracker</h1>
          <p className="hero-description">
            Track the investment. Know when your target is in reach.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>
            Import snapshot
          </button>
          <a className="btn btn-outline btn-sm" href="/api/export" download>
            Export history
          </a>
        </div>
      </section>
      <TrackerGuide />
      <div className="summary-grid" aria-label="Tracker summary">
        <div>
          <span className="eyebrow help-label">
            PLAYERS OBSERVED <HelpTip label="players observed">{trackerHelp.players}</HelpTip>
          </span>
          <strong>{new Set(data.market.map((r) => r.playerId)).size}</strong>
          <span>Across saved source snapshots</span>
        </div>
        <div>
          <span className="eyebrow help-label">
            OPEN INVESTMENTS <HelpTip label="open investments">{trackerHelp.investments}</HelpTip>
          </span>
          <strong>{open.length}</strong>
          <span>Acquisitions with a recorded cost</span>
        </div>
        <div>
          <span className="eyebrow help-label">
            TARGETS IN REACH <HelpTip label="targets in reach">{trackerHelp.targets}</HelpTip>
          </span>
          <strong className="positive">{targets.length}</strong>
          <span>Fresh observations meeting your target</span>
        </div>
        <div>
          <span className="eyebrow help-label">
            RECORDED EXITS <HelpTip label="recorded exits">{trackerHelp.exits}</HelpTip>
          </span>
          <strong>{data.holdings.filter((h) => h.closedAt).length}</strong>
          <span>Realized returns kept in your ledger</span>
        </div>
      </div>
      {error && (
        <div className="alert alert-error my-4" role="alert">
          <span>{error}</span>
          <button
            className="btn btn-sm"
            disabled={!!busy}
            onClick={() => action('reload', reload, 'Saved data loaded.')}
          >
            Retry saved data
          </button>
        </div>
      )}
      {notice && (
        <div className="alert alert-success my-4" role="status">
          {notice}
        </div>
      )}
      <section className="source-grid" aria-label="Value sources">
        {data.sources.map((s) => (
          <article key={s.source} className="source-card">
            <div className="source-card-title">
              <div className={`source-mark ${s.source === 'dynasty-nerds' ? 'nerds' : 'calc'}`}>
                {s.source === 'dynasty-nerds' ? 'GM' : 'DTC'}
              </div>
              <div>
                <h2>{s.label}</h2>
                <p>Last capture: {date(s.lastSuccess)}</p>
              </div>
              <span
                className={`badge badge-sm ${s.status === 'failed' || s.source === 'dynasty-calculator' ? 'badge-warning' : 'badge-ghost'}`}
              >
                {s.source === 'dynasty-calculator'
                  ? 'Issue tracked'
                  : s.status === 'failed'
                    ? 'Needs attention'
                    : s.lastSuccess
                      ? 'Connected'
                      : s.configured
                        ? 'Ready'
                        : 'Sign-in needed'}
              </span>
            </div>
            {s.source === 'dynasty-calculator' && (
              <p id="dtc-refresh-issue" className="source-issue" role="note">
                <strong>DTC automatic refresh needs a fix.</strong> Saved DTC values are still
                available. Repair is deferred; this source may be out of date.
              </p>
            )}
            <div className="source-card-bottom">
              <p>
                {s.source === 'dynasty-calculator'
                  ? 'Use saved values or import a dated snapshot.'
                  : s.status === 'failed'
                    ? s.message
                    : s.nextAllowedAt && Date.parse(s.nextAllowedAt) > clock
                      ? `Next capture ${date(s.nextAllowedAt)}`
                      : 'Capture on demand. No scheduled refresh.'}
                {s.source !== 'dynasty-calculator' &&
                  s.status === 'failed' &&
                  s.nextAllowedAt &&
                  Date.parse(s.nextAllowedAt) > clock && (
                    <span className="block">Next attempt {date(s.nextAllowedAt)}</span>
                  )}
              </p>
              <div className="button-help">
                <button
                  className="btn btn-sm btn-primary"
                  aria-describedby={
                    s.source === 'dynasty-calculator' ? 'dtc-refresh-issue' : undefined
                  }
                  disabled={
                    !!busy ||
                    s.source === 'dynasty-calculator' ||
                    !s.configured ||
                    (!!s.nextAllowedAt && Date.parse(s.nextAllowedAt) > clock)
                  }
                  onClick={() =>
                    action(
                      s.source,
                      () => api(`/api/sync/${s.source}`, {}),
                      `${s.label} snapshot saved.`,
                    )
                  }
                >
                  {s.source === 'dynasty-calculator'
                    ? 'Refresh deferred'
                    : busy === s.source
                      ? 'Capturing...'
                      : 'Capture values'}
                </button>
                {s.source !== 'dynasty-calculator' && (
                  <HelpTip label="capturing values">{trackerHelp.capture}</HelpTip>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
      <section className="workspace card bg-base-100">
        <div className="workspace-header">
          <div className="tabs tabs-boxed" role="tablist" aria-label="Tracker view">
            <button
              role="tab"
              aria-selected={view === 'market'}
              className={`tab ${view === 'market' ? 'tab-active' : ''}`}
              onClick={() => setView('market')}
            >
              Player values
            </button>
            <button
              role="tab"
              aria-selected={view === 'portfolio'}
              className={`tab ${view === 'portfolio' ? 'tab-active' : ''}`}
              onClick={() => setView('portfolio')}
            >
              My investments <span className="ml-2 opacity-60">{data.holdings.length}</span>
            </button>
          </div>
          <div className="button-help">
            <button
              className="btn btn-sm btn-ghost"
              disabled={!!busy}
              onClick={() => action('reload', reload, 'Saved data loaded.')}
            >
              Reload saved data
            </button>
            <HelpTip label="reloading saved data">{trackerHelp.reload}</HelpTip>
          </div>
        </div>
        <p className="workspace-hint">
          {view === 'market'
            ? "Click a player's name for history. Compare each source with its own starting value; scroll the table sideways on a small screen."
            : 'These are the entries you recorded, not an automatic copy of your roster. Record an entry under Player values to start measuring return.'}
        </p>
        <div className="filters">
          <label className="search-field">
            <span>Find a player</span>
            <input
              className="input input-bordered input-sm"
              placeholder="Search player names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span>Source</span>
            <select
              className="select select-bordered select-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">Both sources</option>
              {Object.entries(sourceLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {view === 'market' ? (
            <>
              <label>
                <span>Position</span>
                <select
                  className="select select-bordered select-sm"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="all">All positions</option>
                  {['QB', 'RB', 'WR', 'TE'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sort by</span>
                <select
                  className="select select-bordered select-sm"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Player name</option>
                  <option value="change">Largest % change</option>
                  <option value="baseline">Growth since tracking began</option>
                </select>
              </label>
            </>
          ) : (
            <label>
              <span>Portfolio</span>
              <select
                className="select select-bordered select-sm"
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
              >
                <option value="all">All portfolios</option>
                {portfolios.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            <span className="loading loading-spinner" /> Loading saved history...
          </div>
        ) : view === 'market' ? (
          <>
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">
                  Latest values by player, source, and scoring context
                </caption>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>
                      Source / format{' '}
                      <HelpTip label="source and format">{trackerHelp.source}</HelpTip>
                    </th>
                    <th className="numeric">
                      Latest value <HelpTip label="latest value">{trackerHelp.latest}</HelpTip>
                    </th>
                    <th className="numeric">
                      Since last capture{' '}
                      <HelpTip label="change since last capture">{trackerHelp.previous}</HelpTip>
                    </th>
                    <th className="numeric">
                      Since tracking began{' '}
                      <HelpTip label="growth since tracking began">{trackerHelp.baseline}</HelpTip>
                    </th>
                    <th>
                      Captured <HelpTip label="capture time">{trackerHelp.captured}</HelpTip>
                    </th>
                    <th>
                      Entry <HelpTip label="recording an entry">{trackerHelp.entry}</HelpTip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {market.map((r) => (
                    <tr key={`${r.playerId}-${r.source}-${r.contextKey}`}>
                      <td>
                        <button className="player-name" onClick={() => setDetail(r)}>
                          {r.playerName}
                        </button>
                        <div className="player-meta">
                          <span className={`position position-${r.position}`}>
                            {r.position || '?'}
                          </span>
                          {r.team || 'FA'}
                          {!r.sleeperId && (
                            <span className="badge badge-ghost badge-xs">Source identity</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{sourceLabels[r.source]}</div>
                        <div className="context-label">{r.contextLabel}</div>
                      </td>
                      <td className="numeric value-number">{number(r.value)}</td>
                      <td
                        className={`numeric ${r.changePct !== null ? (r.changePct >= 0 ? 'positive' : 'negative') : 'muted'}`}
                      >
                        {r.previousValue === null ? 'First capture' : percent(r.changePct)}
                        <div className="text-xs muted">
                          {r.observations} {r.observations === 1 ? 'observation' : 'observations'}
                        </div>
                      </td>
                      <td
                        className={`numeric ${r.baselineChangePct === null ? 'muted' : r.baselineChangePct >= 0 ? 'positive' : 'negative'}`}
                      >
                        {percent(r.baselineChangePct)}
                        <div
                          className="text-xs muted"
                          title={`First observation: ${date(r.baselineAt)}`}
                        >
                          Baseline {number(r.baselineValue)}
                        </div>
                      </td>
                      <td className="text-sm whitespace-nowrap">
                        {date(r.capturedAt)}
                        {stale(r.capturedAt) && (
                          <div className="text-warning text-xs">Over 7 days old</div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setAcquire(r)}
                          aria-label={`Record acquisition of ${r.playerName} from ${sourceLabels[r.source]}`}
                        >
                          Record entry +
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!market.length && (
              <div className="empty-state">
                <div className="empty-icon">+</div>
                <h2>
                  {data.market.length
                    ? 'No matching players'
                    : 'Your history starts with the first capture'}
                </h2>
                <p>
                  {data.market.length
                    ? 'Try another name, position, or source.'
                    : 'Capture a source above, or import an existing dated snapshot. Then record what you invested in a player.'}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">Acquisitions and returns</caption>
                <thead>
                  <tr>
                    <th>Investment</th>
                    <th className="numeric">
                      Cost / current{' '}
                      <HelpTip label="cost and current value">{trackerHelp.cost}</HelpTip>
                    </th>
                    <th className="numeric">
                      Return <HelpTip label="investment return">{trackerHelp.roi}</HelpTip>
                    </th>
                    <th>
                      Target <HelpTip label="target value">{trackerHelp.target}</HelpTip>
                    </th>
                    <th>
                      Status <HelpTip label="investment status">{trackerHelp.status}</HelpTip>
                    </th>
                    <th>
                      <span className="sr-only">Exit action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <strong>{h.playerName}</strong>
                        <div className="context-label">
                          {h.portfolio} / {sourceLabels[h.sourceName]}
                        </div>
                        <div className="text-xs muted">
                          Acquired {new Date(h.acquiredAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="numeric">
                        {number(h.costBasis)}
                        <div className="text-sm muted">
                          {h.closedAt ? 'Exit' : 'Latest'}{' '}
                          {number(h.closedAt ? h.proceeds : h.currentValue)}
                        </div>
                      </td>
                      <td
                        className={`numeric ${h.gain === null ? 'muted' : h.gain >= 0 ? 'positive' : 'negative'}`}
                      >
                        {h.costBasis === 0 ? 'ROI undefined' : percent(h.roi)}
                        <div className="text-xs">
                          {h.gain === null
                            ? 'No post-entry value'
                            : `${h.gain >= 0 ? '+' : ''}${number(h.gain)} points`}
                        </div>
                      </td>
                      <td>
                        <div>
                          {h.targetValue === null
                            ? 'Absolute gain only'
                            : `${number(h.targetValue)} points`}
                        </div>
                        <div className="text-xs muted">
                          {h.targetValue === null ? 'Zero-cost entry' : `${h.targetRoi}% target`}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${h.closedAt ? 'badge-neutral' : h.targetReached && !stale(h.capturedAt) ? 'badge-success' : 'badge-ghost'}`}
                        >
                          {h.closedAt
                            ? 'Realized'
                            : stale(h.capturedAt)
                              ? 'Needs fresh value'
                              : h.targetReached
                                ? 'Target reached'
                                : 'Holding'}
                        </span>
                      </td>
                      <td>
                        {!h.closedAt && (
                          <button className="btn btn-sm btn-outline" onClick={() => setExit(h)}>
                            Record exit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!holdings.length && (
              <div className="empty-state">
                <h2>No investments recorded yet</h2>
                <p>
                  Choose a player under Player values and record an entry cost. Your holdings and
                  exits will stay here.
                </p>
              </div>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>{view === 'market' ? market.length : holdings.length} rows</span>
          <span>Provider points stay separate. Target reached is an unrealized signal.</span>
        </footer>
      </section>
      <div className="method-note">
        <span className="eyebrow">HOW RETURN IS MEASURED</span>
        <p>
          <strong>(Value - entry cost) / entry cost x 100.</strong> Use the same source and format
          for both. Enter the proceeds when you exit to record realized return.
        </p>
      </div>
      {detail && (
        <Modal title={`${detail.playerName} - value history`} onClose={() => setDetail(null)}>
          <p className="text-sm muted mb-4">
            {sourceLabels[detail.source]} / {detail.contextLabel}
          </p>
          <p className="text-sm mb-4">
            Tracking baseline: {number(detail.baselineValue)} on {date(detail.baselineAt)}. Growth:{' '}
            {percent(detail.baselineChangePct)}. This observation is separate from acquisition cost.
          </p>
          <HistoryChart points={detail.history} label={detail.playerName} />
          <div className="mt-5 max-h-40 overflow-y-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Captured</th>
                  <th className="numeric">Value</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.history].reverse().map((p, i) => (
                  <tr key={i}>
                    <td>{new Date(p.capturedAt).toLocaleString()}</td>
                    <td className="numeric">{number(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {acquire && (
        <AcquisitionForm
          row={acquire}
          onClose={() => setAcquire(null)}
          onSaved={async () => {
            setAcquire(null)
            setView('portfolio')
            await reload()
            setNotice('Acquisition recorded.')
          }}
        />
      )}
      {exit && (
        <ExitForm
          holding={exit}
          onClose={() => setExit(null)}
          onSaved={async () => {
            setExit(null)
            await reload()
            setNotice('Exit recorded. Return is now realized.')
          }}
        />
      )}
      {showImport && (
        <ImportForm
          onClose={() => setShowImport(false)}
          onSaved={async () => {
            setShowImport(false)
            await reload()
            setNotice('Snapshot imported.')
          }}
        />
      )}
    </>
  )
}

function AcquisitionForm({
  row,
  onClose,
  onSaved,
}: {
  row: MarketRow
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [cost, setCost] = useState(''),
    [target, setTarget] = useState('20'),
    [acquired, setAcquired] = useState(today()),
    [portfolio, setPortfolio] = useState('A League For All Seasons')
  const [notes, setNotes] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const result = cost !== '' ? calculateReturn(Number(cost), row.value, Number(target)) : null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
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
          Portfolio
          <input
            className="input input-bordered"
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <div className="form-grid">
          <label>
            Entry cost (provider points)
            <input
              autoFocus
              className="input input-bordered"
              type="number"
              min="0"
              max="1000000000"
              step="any"
              placeholder="What you invested"
              value={cost}
              aria-describedby="entry-cost-help"
              onChange={(e) => setCost(e.target.value)}
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
              className="input input-bordered"
              type="number"
              min="0"
              max="10000"
              step="any"
              value={target}
              aria-describedby="entry-target-help"
              onChange={(e) => setTarget(e.target.value)}
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
            className="input input-bordered"
            type="date"
            max={today()}
            value={acquired}
            onChange={(e) => setAcquired(e.target.value)}
            required
          />
        </label>
        <label>
          Entry notes
          <textarea
            className="textarea textarea-bordered"
            placeholder="Trade details or how you allocated the cost"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
function ExitForm({
  holding,
  onClose,
  onSaved,
}: {
  holding: HoldingView
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [proceeds, setProceeds] = useState(''),
    [closed, setClosed] = useState(today()),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const result =
    proceeds !== '' ? calculateReturn(holding.costBasis, Number(proceeds), holding.targetRoi) : null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/api/holdings/${holding.id}/exit`, {
        proceeds: Number(proceeds),
        closedAt: new Date(`${closed}T00:00:00`).toISOString(),
      })
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`Record exit: ${holding.playerName}`} onClose={onClose}>
      <p className="text-sm muted mb-4">
        Enter what you received, valued in {sourceLabels[holding.sourceName]} points using the entry
        format. For package trades, enter only the proceeds allocated to this player.
      </p>
      <form className="tracker-form" onSubmit={submit}>
        <label>
          Exit proceeds (provider points)
          <input
            autoFocus
            className="input input-bordered"
            type="number"
            min="0"
            max="1000000000"
            step="any"
            value={proceeds}
            aria-describedby="exit-proceeds-help"
            onChange={(e) => setProceeds(e.target.value)}
            required
          />
          <span id="exit-proceeds-help" className="field-hint">
            Enter only this player's share of a package trade. Saving closes this entry; a later
            reacquisition is a new entry.
          </span>
        </label>
        <label>
          Exit date
          <input
            className="input input-bordered"
            type="date"
            value={closed}
            min={holding.acquiredAt.slice(0, 10)}
            max={today()}
            onChange={(e) => setClosed(e.target.value)}
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
function ImportForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState<SourceName>('dynasty-nerds'),
    [format, setFormat] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
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
        const res = await fetch(
          `/api/valuations/import?source=${source}&format=${encodeURIComponent(format)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'text/csv', 'x-tracker-request': '1' },
            body: text,
          },
        )
        const result = await res.json()
        if (!res.ok) throw new Error(result.error)
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
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
            className="file-input file-input-bordered"
            type="file"
            accept=".csv,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label>
          CSV source
          <select
            className="select select-bordered"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceName)}
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
            className="input input-bordered"
            placeholder="12 teams, 1QB, PPR, no TE premium"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
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
