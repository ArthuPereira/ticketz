import { CalendarDays, MapPin, Ticket, TicketX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { Event } from '../../types/events'
import { formatEventDate } from '../../utils/date'
import styles from './EventCard.module.css'

interface EventCardProps {
  event: Event
}

interface EventImageProps {
  name: string
  source: string | null
}

const EVENT_PLACEHOLDER = '/event-placeholder.svg'

function EventImage({ name, source }: EventImageProps) {
  const [hasError, setHasError] = useState(false)
  const imageSource = source && !hasError ? source : EVENT_PLACEHOLDER

  return (
    <img
      alt={source && !hasError ? `Banner do evento ${name}` : ''}
      className={styles.image}
      loading="lazy"
      onError={() => setHasError(true)}
      src={imageSource}
    />
  )
}

export function EventCard({ event }: EventCardProps) {
  const soldOut = event.ingressos_disponiveis === 0

  return (
    <article className={styles.card}>
      <div className={styles.imageWrapper}>
        <EventImage key={event.banner_url ?? EVENT_PLACEHOLDER} name={event.nome} source={event.banner_url} />
        <span className={`${styles.availability} ${soldOut ? styles.soldOut : styles.available}`}>
          {soldOut ? <TicketX aria-hidden="true" size={16} /> : <Ticket aria-hidden="true" size={16} />}
          {soldOut ? 'Esgotado' : `${event.ingressos_disponiveis} disponíveis`}
        </span>
      </div>

      <div className={styles.content}>
        <h3>{event.nome}</h3>
        <dl className={styles.details}>
          <div>
            <dt>
              <CalendarDays aria-hidden="true" size={18} />
              <span className={styles.visuallyHidden}>Data</span>
            </dt>
            <dd>{formatEventDate(event.data)}</dd>
          </div>
          <div>
            <dt>
              <MapPin aria-hidden="true" size={18} />
              <span className={styles.visuallyHidden}>Local</span>
            </dt>
            <dd>{event.local}</dd>
          </div>
        </dl>
        <Link aria-label={`Ver detalhes de ${event.nome}`} className={styles.link} to={`/eventos/${event.id}`}>
          Ver detalhes
        </Link>
      </div>
    </article>
  )
}
