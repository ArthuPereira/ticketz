import { CalendarDays, MapPin, Ticket as TicketIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Ticket } from '../../types/tickets'
import { formatDateTime, formatEventDate } from '../../utils/date'
import { TicketStatusBadge } from './TicketStatusBadge'
import styles from './TicketCard.module.css'

interface TicketCardProps {
  ticket: Ticket
}

export function TicketCard({ ticket }: TicketCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.heading}>
        <span aria-hidden="true" className={styles.icon}>
          <TicketIcon size={23} />
        </span>
        <div>
          <p className={styles.eyebrow}>Ingresso #{ticket.id}</p>
          <h2>{ticket.evento.nome}</h2>
        </div>
      </div>

      <dl className={styles.details}>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" size={17} /> Evento
          </dt>
          <dd>{formatEventDate(ticket.evento.data)}</dd>
        </div>
        <div>
          <dt>
            <MapPin aria-hidden="true" size={17} /> Local
          </dt>
          <dd>{ticket.evento.local}</dd>
        </div>
        <div>
          <dt>Comprado em</dt>
          <dd>{formatDateTime(ticket.criado_em)}</dd>
        </div>
      </dl>

      <div className={styles.footer}>
        <TicketStatusBadge status={ticket.status} />
        <Link className={styles.detailsLink} to={`/meus-ingressos/${ticket.id}`}>
          Ver detalhes
        </Link>
      </div>
    </article>
  )
}
