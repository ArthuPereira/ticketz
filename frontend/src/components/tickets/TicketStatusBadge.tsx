import { CircleAlert, CircleCheck, Clock3 } from 'lucide-react'

import type { TicketStatus } from '../../types/tickets'
import styles from './TicketStatusBadge.module.css'

interface TicketStatusBadgeProps {
  status: TicketStatus
}

const statusContent = {
  FAILED: { icon: CircleAlert, label: 'Falha na geração' },
  PENDING: { icon: Clock3, label: 'Gerando ingresso' },
  READY: { icon: CircleCheck, label: 'Pronto para baixar' },
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const { icon: Icon, label } = statusContent[status]

  return (
    <span className={`${styles.badge} ${styles[status.toLowerCase()]}`}>
      <Icon aria-hidden="true" size={16} />
      {label}
    </span>
  )
}
