import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import {
  buildTrackerAlerts,
  isTrackerValueFresh,
  sourceLabels,
  type Dashboard,
  type MarketRow,
  type HoldingView,
  type SourceName,
} from '../../shared/tracker'
import HistoryChart from './HistoryChart'
import ValueTrendChart from './ValueTrendChart'
import Modal from './Modal'
import HelpTip from './HelpTip'
import TrackerGuide from './TrackerGuide'
import TrackerAlerts from './TrackerAlerts'
import RosterAutomation from './RosterAutomation'
import { trackerHelp } from '../trackerHelp'
import AcquisitionForm from './valueTracker/AcquisitionForm'
import ExitForm from './valueTracker/ExitForm'
import ImportForm from './valueTracker/ImportForm'
import InvestmentValue from './valueTracker/InvestmentValue'
import SourceValue from './valueTracker/SourceValue'
import { date, number, percent } from './valueTracker/format'

const empty: Dashboard = { market: [], holdings: [], sources: [], roster: null }
const marketSources: SourceName[] = ['dynasty-nerds', 'dynasty-calculator']
type PlayerValues = { player: MarketRow; sources: Record<SourceName, MarketRow[]> }
type InvestmentGroup = {
  key: string
  playerId: number
  playerName: string
  portfolio: string
  acquiredAt: string
  automated: boolean
  holdings: HoldingView[]
}
function investmentStatus(holding: HoldingView, clock: number) {
  if (holding.reviewReason) return 'Needs review'
  if (holding.closedAt) return 'Realized'
  if (!isTrackerValueFresh(holding.capturedAt, clock)) return 'Needs fresh value'
  return holding.targetReached ? 'Target reached' : 'Holding'
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
    [view, setView] = useState<'market' | 'trends' | 'portfolio'>('market')
  const [detail, setDetail] = useState<MarketRow | null>(null),
    [acquire, setAcquire] = useState<MarketRow[] | null>(null),
    [exit, setExit] = useState<HoldingView | null>(null)
  const [showImport, setShowImport] = useState(false),
    [sort, setSort] = useState('name'),
    [portfolio, setPortfolio] = useState('all')
  const [clock, setClock] = useState(() => Date.now())
  const [trendSource, setTrendSource] = useState<SourceName>('dynasty-calculator'),
    [trendContextKey, setTrendContextKey] = useState('')
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
  const market = useMemo(() => {
    const players = new Map<number, PlayerValues>()
    // Group by database player identity, never by name. Keep every scoring context intact.
    for (const row of [...data.market].sort(
      (a, b) =>
        Date.parse(b.capturedAt) - Date.parse(a.capturedAt) ||
        a.contextKey.localeCompare(b.contextKey),
    )) {
      if (!players.has(row.playerId))
        players.set(row.playerId, {
          player: row,
          sources: { 'dynasty-nerds': [], 'dynasty-calculator': [] },
        })
      players.get(row.playerId)!.sources[row.source].push(row)
    }
    const sortSource = sort.startsWith('dynasty-calculator:')
      ? 'dynasty-calculator'
      : 'dynasty-nerds'
    const score = (row: PlayerValues) => {
      const latest = row.sources[sortSource][0]
      return (
        (sort.endsWith(':baseline') ? latest?.baselineChangePct : latest?.changePct) ?? -Infinity
      )
    }
    return [...players.values()]
      .filter(
        ({ player }) =>
          (position === 'all' || player.position === position) &&
          player.playerName.toLowerCase().includes(search.toLowerCase()),
      )
      .sort(
        (a, b) =>
          (sort === 'name' ? 0 : score(b) - score(a)) ||
          a.player.playerName.localeCompare(b.player.playerName),
      )
  }, [data.market, position, search, sort])
  const investmentGroups = useMemo(() => {
    const groups = new Map<string, InvestmentGroup>()
    for (const holding of data.holdings) {
      const group = groups.get(holding.acquisitionKey)
      if (group) {
        group.holdings.push(holding)
        if (Date.parse(holding.acquiredAt) < Date.parse(group.acquiredAt))
          group.acquiredAt = holding.acquiredAt
        group.automated ||= holding.automated
      } else
        groups.set(holding.acquisitionKey, {
          key: holding.acquisitionKey,
          playerId: holding.playerId,
          playerName: holding.playerName,
          portfolio: holding.portfolio,
          acquiredAt: holding.acquiredAt,
          automated: holding.automated,
          holdings: [holding],
        })
    }
    return [...groups.values()].sort(
      (a, b) =>
        Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt) ||
        a.playerName.localeCompare(b.playerName),
    )
  }, [data.holdings])
  const investments = investmentGroups.filter(
    (group) =>
      (source === 'all' || group.holdings.some((holding) => holding.sourceName === source)) &&
      (portfolio === 'all' || group.portfolio === portfolio) &&
      group.playerName.toLowerCase().includes(search.toLowerCase()),
  )
  const open = investmentGroups.filter((group) =>
      group.holdings.some((holding) => !holding.closedAt),
    ),
    targets = open.filter((group) =>
      group.holdings.some(
        (holding) =>
          !holding.closedAt &&
          holding.targetReached &&
          isTrackerValueFresh(holding.capturedAt, clock),
      ),
    )
  const alerts = useMemo(() => buildTrackerAlerts(data, clock), [data, clock])
  const portfolios = [...new Set(data.holdings.map((h) => h.portfolio))]
  const trendContexts = useMemo(() => {
    const contexts = new Map<string, MarketRow>()
    for (const row of data.market.filter((candidate) => candidate.source === trendSource)) {
      const current = contexts.get(row.contextKey)
      if (!current || Date.parse(row.capturedAt) > Date.parse(current.capturedAt))
        contexts.set(row.contextKey, row)
    }
    return [...contexts.values()].sort(
      (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt),
    )
  }, [data.market, trendSource])
  const trendContext =
    trendContexts.find((context) => context.contextKey === trendContextKey) ?? trendContexts[0]
  const trendSeries = data.market
    .filter(
      (row) =>
        row.source === trendSource &&
        row.contextKey === trendContext?.contextKey &&
        (position === 'all' || row.position === position),
    )
    .sort((a, b) => a.playerName.localeCompare(b.playerName))
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
          <strong>
            {
              investmentGroups.filter((group) => group.holdings.some((holding) => holding.closedAt))
                .length
            }
          </strong>
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
      <TrackerAlerts alerts={alerts} />
      <RosterAutomation
        roster={data.roster}
        busy={busy}
        clock={clock}
        help={trackerHelp.roster}
        onCheck={() =>
          action(
            'roster',
            () => api('/api/roster/reconcile', {}),
            'Sleeper roster checked and saved movements applied.',
          )
        }
        onAccept={(id) =>
          action(
            `review:${id}`,
            () => api(`/api/roster/reviews/${id}/accept-last-value`, {}),
            'Last known value accepted for the roster exit.',
          )
        }
        onAcknowledge={(id) =>
          action(
            `review:${id}`,
            () => api(`/api/roster/reviews/${id}/acknowledge`, {}),
            'Acknowledged: no value basis exists for this addition.',
          )
        }
      />
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
                className={`badge badge-sm ${s.status === 'failed' ? 'badge-warning' : 'badge-ghost'}`}
              >
                {s.status === 'failed'
                  ? 'Needs attention'
                  : s.lastSuccess
                    ? 'Connected'
                    : s.configured
                      ? 'Ready'
                      : 'Sign-in needed'}
              </span>
            </div>
            {s.source === 'dynasty-calculator' && s.status === 'failed' && (
              <p id="dtc-refresh-issue" className="source-issue" role="note">
                <strong>Last DTC capture failed.</strong> Saved DTC values are still available. The
                latest error and next attempt time are below.
              </p>
            )}
            {s.status === 'success' && (
              <p className="mt-3 break-words text-xs leading-relaxed" role="status">
                {s.message}
              </p>
            )}
            <div className="source-card-bottom">
              <p>
                {s.status === 'failed'
                  ? s.message
                  : s.nextAllowedAt && Date.parse(s.nextAllowedAt) > clock
                    ? `Next capture ${date(s.nextAllowedAt)}`
                    : 'Capture on demand. No scheduled refresh.'}
                {s.status === 'failed' &&
                  s.nextAllowedAt &&
                  Date.parse(s.nextAllowedAt) > clock && (
                    <span className="block">Next attempt {date(s.nextAllowedAt)}</span>
                  )}
              </p>
              <div className="button-help">
                <button
                  className="btn btn-sm btn-primary"
                  aria-describedby={
                    s.source === 'dynasty-calculator' && s.status === 'failed'
                      ? 'dtc-refresh-issue'
                      : undefined
                  }
                  disabled={
                    !!busy ||
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
                  {busy === s.source ? 'Capturing...' : 'Capture values'}
                </button>
                <HelpTip label="capturing values">{trackerHelp.capture}</HelpTip>
              </div>
            </div>
          </article>
        ))}
      </section>
      <section className="workspace card bg-base-100">
        <div className="workspace-header">
          <div className="tabs tabs-box" role="tablist" aria-label="Tracker view">
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
              aria-selected={view === 'trends'}
              className={`tab ${view === 'trends' ? 'tab-active' : ''}`}
              onClick={() => setView('trends')}
            >
              Value trends
            </button>
            <button
              role="tab"
              aria-selected={view === 'portfolio'}
              className={`tab ${view === 'portfolio' ? 'tab-active' : ''}`}
              onClick={() => setView('portfolio')}
            >
              My investments <span className="ml-2 opacity-60">{investmentGroups.length}</span>
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
            ? 'One row per player. Click either value for its history; growth compares that source with its own starting value.'
            : view === 'trends'
              ? 'Compare saved player histories within one provider and scoring format. Filter the chart by position; click a player in the legend for exact observations.'
              : 'Sleeper creates normal entries and exits automatically. Manual entry and exit remain available for corrections or older acquisitions.'}
        </p>
        <div className="filters">
          {view !== 'trends' && (
            <label className="search-field">
              <span>Find a player</span>
              <input
                className="input input-sm"
                placeholder="Search player names..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          {view === 'portfolio' && (
            <label>
              <span>Source</span>
              <select
                className="select select-sm"
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
          )}
          {view === 'market' ? (
            <>
              <label>
                <span>Position</span>
                <select
                  className="select select-sm"
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
                  className="select select-sm"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Player name</option>
                  <option value="dynasty-nerds:baseline">GM growth since start</option>
                  <option value="dynasty-calculator:baseline">DTC growth since start</option>
                  <option value="dynasty-nerds:change">GM change since last capture</option>
                  <option value="dynasty-calculator:change">DTC change since last capture</option>
                </select>
              </label>
            </>
          ) : view === 'trends' ? (
            <>
              <label>
                <span>Source</span>
                <select
                  className="select select-sm"
                  aria-label="Trend source"
                  value={trendSource}
                  onChange={(e) => {
                    setTrendSource(e.target.value as SourceName)
                    setTrendContextKey('')
                  }}
                >
                  {marketSources.map((id) => (
                    <option key={id} value={id}>
                      {sourceLabels[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="trend-format-filter">
                <span>Scoring format</span>
                <select
                  className="select select-sm"
                  aria-label="Trend scoring format"
                  value={trendContext?.contextKey ?? ''}
                  onChange={(e) => setTrendContextKey(e.target.value)}
                  disabled={!trendContexts.length}
                >
                  {!trendContexts.length && <option value="">No saved formats</option>}
                  {trendContexts.map((context) => (
                    <option key={context.contextKey} value={context.contextKey}>
                      {context.contextLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Position</span>
                <select
                  className="select select-sm"
                  aria-label="Trend position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="all">All positions</option>
                  {['QB', 'RB', 'WR', 'TE'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              <span>Portfolio</span>
              <select
                className="select select-sm"
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
              <table className="table player-values-table">
                <caption className="sr-only">
                  One row per player with Dynasty GM and DTC values side by side
                </caption>
                <thead>
                  <tr>
                    <th>
                      Player <HelpTip label="recording an entry">{trackerHelp.entry}</HelpTip>
                    </th>
                    <th className="numeric">
                      Dynasty GM <HelpTip label="Dynasty GM values">{trackerHelp.values}</HelpTip>
                    </th>
                    <th className="numeric">
                      DTC <HelpTip label="DTC values">{trackerHelp.values}</HelpTip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {market.map(({ player: r, sources }) => (
                    <tr key={r.playerId}>
                      <td>
                        <button
                          className="player-name"
                          onClick={() =>
                            setDetail(
                              sources['dynasty-nerds'][0] ?? sources['dynasty-calculator'][0],
                            )
                          }
                        >
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
                        <button
                          className="btn btn-sm btn-ghost player-entry"
                          onClick={() => setAcquire(marketSources.flatMap((s) => sources[s]))}
                          aria-label={`Record entry for ${r.playerName}`}
                        >
                          Record entry +
                        </button>
                      </td>
                      {marketSources.map((s) => (
                        <td key={s} className="numeric" data-source={s}>
                          {sources[s].length ? (
                            sources[s].map((row) => (
                              <SourceValue key={row.contextKey} row={row} onDetail={setDetail} />
                            ))
                          ) : (
                            <span className="muted">No value yet</span>
                          )}
                        </td>
                      ))}
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
                    ? 'Try another name or position.'
                    : 'Capture a source above, or import an existing dated snapshot. Then record what you invested in a player.'}
                </p>
              </div>
            )}
          </>
        ) : view === 'trends' ? (
          <section className="trend-panel" aria-labelledby="value-trends-heading">
            <div className="trend-heading">
              <div>
                <h2 id="value-trends-heading">
                  Player value trends{' '}
                  <HelpTip label="value trend chart">{trackerHelp.trends}</HelpTip>
                </h2>
                <p>
                  {sourceLabels[trendSource]}
                  {trendContext ? ` / ${trendContext.contextLabel}` : ''}
                </p>
              </div>
              <span className="badge badge-ghost">
                {position === 'all' ? 'All positions' : position}
              </span>
            </div>
            <ValueTrendChart
              series={trendSeries}
              sourceLabel={sourceLabels[trendSource]}
              onSelect={setDetail}
            />
          </section>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table investment-table">
                <caption className="sr-only">
                  Player acquisitions with Dynasty GM and DTC returns side by side
                </caption>
                <thead>
                  <tr>
                    <th>Investment</th>
                    <th className="numeric">
                      Dynasty GM{' '}
                      <HelpTip label="Dynasty GM investment values">{trackerHelp.cost}</HelpTip>
                    </th>
                    <th className="numeric">
                      DTC <HelpTip label="DTC investment values">{trackerHelp.roi}</HelpTip>
                    </th>
                    <th>
                      Status <HelpTip label="investment status">{trackerHelp.status}</HelpTip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((group) => (
                    <tr key={group.key}>
                      <td>
                        <strong>{group.playerName}</strong>
                        <div className="context-label">
                          {group.portfolio}
                          {group.automated ? ' / Sleeper' : ' / Manual'}
                        </div>
                        <div className="text-xs muted">
                          Acquired {new Date(group.acquiredAt).toLocaleDateString()}
                        </div>
                      </td>
                      {marketSources.map((sourceName) => (
                        <td
                          key={sourceName}
                          className="numeric"
                          data-source={sourceName}
                          data-label={sourceLabels[sourceName]}
                        >
                          <InvestmentValue
                            holdings={group.holdings.filter(
                              (holding) => holding.sourceName === sourceName,
                            )}
                          />
                        </td>
                      ))}
                      <td className="investment-status">
                        {group.holdings.map((holding) => (
                          <div key={holding.id} className="investment-status-item">
                            <span
                              className={`badge ${holding.reviewReason ? 'badge-warning' : holding.closedAt ? 'badge-neutral' : holding.targetReached && isTrackerValueFresh(holding.capturedAt, clock) ? 'badge-success' : 'badge-ghost'}`}
                            >
                              {sourceLabels[holding.sourceName]}: {investmentStatus(holding, clock)}
                            </span>
                            {holding.reviewReason && (
                              <div className="text-xs muted">{holding.reviewReason}</div>
                            )}
                            {!holding.closedAt && !holding.reviewReason && (
                              <button
                                className="btn btn-xs btn-outline"
                                onClick={() => setExit(holding)}
                              >
                                Record exit
                              </button>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!investments.length && (
              <div className="empty-state">
                <h2>No investments recorded yet</h2>
                <p>
                  Capture a provider and check Sleeper to start the current roster automatically.
                  Manual entry remains available under Player values.
                </p>
              </div>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            {view === 'market'
              ? `${market.length} ${market.length === 1 ? 'player' : 'players'}`
              : view === 'trends'
                ? `${trendSeries.length} ${trendSeries.length === 1 ? 'player trend' : 'player trends'}`
                : `${investments.length} entries`}
          </span>
          <span>Provider points stay separate. Target reached is an unrealized signal.</span>
        </footer>
      </section>
      <div className="method-note">
        <span className="eyebrow">HOW RETURN IS MEASURED</span>
        <p>
          <strong>(Value - entry cost) / entry cost x 100.</strong> Use the same source and format
          for both. Save the player's value when they leave to record realized return.
        </p>
      </div>
      {detail && (
        <Modal title={`${detail.playerName} - value history`} onClose={() => setDetail(null)}>
          <p className="text-sm muted mb-4">
            {sourceLabels[detail.source]} / {detail.contextLabel}
          </p>
          <p className="text-sm mb-4">
            <HelpTip label="growth since tracking began">{trackerHelp.baseline}</HelpTip> Tracking
            baseline: {number(detail.baselineValue)} on {date(detail.baselineAt)}. Growth:{' '}
            {percent(detail.baselineChangePct)}. This observation is separate from acquisition cost.
          </p>
          <p className="text-sm mb-4">
            Since last capture:{' '}
            {detail.previousValue === null ? 'First capture' : percent(detail.changePct)}{' '}
            <HelpTip label="change since last capture">{trackerHelp.previous}</HelpTip>
          </p>
          <HistoryChart points={detail.history} label={detail.playerName} />
          <div className="mt-5 max-h-40 overflow-y-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>
                    Captured <HelpTip label="capture time">{trackerHelp.captured}</HelpTip>
                  </th>
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
          rows={acquire}
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
