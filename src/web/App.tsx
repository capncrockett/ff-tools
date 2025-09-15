import React, { useEffect, useState } from 'react'
import ValueTracker from './components/ValueTracker'

type KeeperPlayer = { id: string; name: string; position: string; team: string; draft_round: string; draft_pick: string }
type KeeperTeam = { owner_id: string; owner_name: string; players: KeeperPlayer[] }

export default function App() {
  const [health, setHealth] = useState<any>(null)
  const [view, setView] = useState<'tracker' | 'sleeper'>('tracker')

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl">FF Tools</a>
        </div>
        <div className="flex-none gap-2 pr-4">
          <span className="text-sm opacity-70">{health ? 'API online' : '...'}</span>
        </div>
      </div>
      <main className="container mx-auto p-4">
        <div className="tabs tabs-boxed mb-4">
          <button className={`tab ${view === 'tracker' ? 'tab-active' : ''}`} onClick={() => setView('tracker')}>Dynasty Value Tracker</button>
          <button className={`tab ${view === 'sleeper' ? 'tab-active' : ''}`} onClick={() => setView('sleeper')}>Sleeper Tools (Beta)</button>
        </div>
        {view === 'tracker' ? (
          <ValueTracker />
        ) : (
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title">Sleeper Tools (Beta)</h2>
              <p>Coming soon. Use the API links for now.</p>
              <div className="divider">Quick Links</div>
              <div className="flex gap-2">
                <a className="btn btn-primary" href="#" onClick={async (e) => { e.preventDefault(); await fetch('/api/sleeper-tools/keeper-data').then(r=>r.json()).then(console.log) }}>Test Keeper API (console)</a>
                <a className="btn" href="#" onClick={async (e) => { e.preventDefault(); await fetch('/api/sleeper-tools/adp').then(r=>r.json()).then(console.log) }}>Test ADP API (console)</a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
