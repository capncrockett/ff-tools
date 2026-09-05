import ValueTracker from './components/ValueTracker'
export default function App() {
  return (
    <div className="app-shell" data-theme="dynasty">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FF Tools home">
          <span className="brand-symbol">ff</span>
          <span>
            FF TOOLS<span className="brand-divider">/</span>
            <span className="brand-product">DYNASTY</span>
          </span>
        </a>
        <span className="private-label">
          <span className="status-dot" />
          Private workspace
        </span>
      </header>
      <main className="page-content">
        <ValueTracker />
      </main>
      <footer className="site-footer">
        DYNASTY VALUE TRACKER<span>Built for the next good trade.</span>
      </footer>
    </div>
  )
}
