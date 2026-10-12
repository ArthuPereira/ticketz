import type { Event } from '../../types/events'
import { EventCard } from './EventCard'
import styles from './EventGrid.module.css'

interface EventGridProps {
  events: Event[]
  isRefreshing?: boolean
}

export function EventGrid({ events, isRefreshing = false }: EventGridProps) {
  return (
    <div aria-busy={isRefreshing} className={styles.wrapper}>
      {isRefreshing && (
        <span aria-live="polite" className={styles.refreshing}>
          Atualizando eventos…
        </span>
      )}
      <div className={styles.grid}>
        {events.map((event) => (
          <EventCard event={event} key={event.id} />
        ))}
      </div>
    </div>
  )
}
