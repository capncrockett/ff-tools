import type { TrackerAlert } from '../../shared/tracker'
import HelpTip from './HelpTip'
import { trackerHelp } from '../trackerHelp'

export default function TrackerAlerts({ alerts }: { alerts: TrackerAlert[] }) {
  return (
    <section className="tracker-alerts" aria-labelledby="tracker-alerts-heading">
      <div className="tracker-alerts-heading">
        <div>
          <h2 id="tracker-alerts-heading">
            Player alerts <HelpTip label="player alerts">{trackerHelp.alerts}</HelpTip>
          </h2>
          <p>Fresh signals from saved observations. Provider scales stay separate.</p>
        </div>
        <span className={`badge ${alerts.length ? 'badge-warning' : 'badge-ghost'}`}>
          {alerts.length} active
        </span>
      </div>
      {alerts.length ? (
        <ul className="tracker-alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`tracker-alert tracker-alert-${alert.tone}`}>
              <span className="tracker-alert-marker" aria-hidden="true" />
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tracker-alert-empty">No active alerts from the latest saved data.</p>
      )}
    </section>
  )
}
