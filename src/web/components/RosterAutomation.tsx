import { sourceLabels, type RosterAutomationView } from '../../shared/tracker'
import HelpTip from './HelpTip'

type Props = {
  roster: RosterAutomationView | null
  busy: string | null
  clock: number
  onCheck: () => void
  onAccept: (id: string) => void
  help: string
}

const shownDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not checked yet'

export default function RosterAutomation({ roster, busy, clock, onCheck, onAccept, help }: Props) {
  if (!roster) return null
  const coolingDown = Boolean(roster.nextAllowedAt && Date.parse(roster.nextAllowedAt) > clock)
  const badge =
    roster.status === 'needs_review' || roster.status === 'failed'
      ? 'badge-warning'
      : roster.status === 'success'
        ? 'badge-success'
        : 'badge-ghost'
  return (
    <section className="roster-automation" aria-labelledby="roster-automation-heading">
      <div className="roster-automation-heading">
        <div>
          <h2 id="roster-automation-heading">
            Sleeper roster automation <HelpTip label="Sleeper roster automation">{help}</HelpTip>
          </h2>
          <p>
            {roster.leagueName} / {roster.rosterPlayers || 'No'} roster players saved
          </p>
        </div>
        <span className={`badge badge-sm ${badge}`}>
          {roster.reviews.length
            ? `${roster.reviews.length} need review`
            : roster.pending
              ? `${roster.pending} pending`
              : roster.status === 'idle'
                ? 'Ready'
                : roster.status === 'failed'
                  ? 'Needs attention'
                  : 'Watching'}
        </span>
      </div>
      <div className="roster-automation-status">
        <div>
          <strong>{roster.message}</strong>
          <p>
            Last check: {shownDate(roster.lastCheckedAt)}
            {coolingDown ? ` / Next check: ${shownDate(roster.nextAllowedAt)}` : ''}
          </p>
        </div>
        <button
          className="btn btn-sm btn-outline"
          disabled={!!busy || coolingDown}
          onClick={onCheck}
        >
          {busy === 'roster' ? 'Checking...' : 'Check roster now'}
        </button>
      </div>
      {roster.reviews.length > 0 && (
        <ul className="roster-review-list" aria-label="Roster items needing review">
          {roster.reviews.map((review) => (
            <li key={review.id}>
              <div>
                <strong>
                  {review.playerName} / {review.direction === 'add' ? 'Added' : 'Removed'}
                </strong>
                <p>
                  {review.sourceName ? `${sourceLabels[review.sourceName]}: ` : ''}
                  {review.message}
                </p>
                {review.suggestedCapturedAt && review.suggestedValue !== null && (
                  <p>
                    Last known: {review.suggestedValue.toLocaleString()} points on{' '}
                    {shownDate(review.suggestedCapturedAt)}
                  </p>
                )}
              </div>
              {review.canAcceptLastValue && (
                <button
                  className="btn btn-sm btn-warning btn-outline"
                  disabled={!!busy}
                  onClick={() => onAccept(review.id)}
                >
                  {busy === `review:${review.id}` ? 'Saving...' : 'Use last value'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
