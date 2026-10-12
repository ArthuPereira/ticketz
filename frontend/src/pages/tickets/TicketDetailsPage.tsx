import { QrCode } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { Alert } from '../../components/common/Alert'
import { PagePlaceholder } from '../../components/common/PagePlaceholder'
import { TicketStatusBadge } from '../../components/tickets/TicketStatusBadge'
import type { TicketStatus } from '../../types/tickets'
import styles from './TicketDetailsPage.module.css'

interface TicketDetailsLocationState {
  purchaseSuccess?: boolean
  status?: TicketStatus
}

export function TicketDetailsPage() {
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as TicketDetailsLocationState | null

  return (
    <div className={styles.page}>
      {state?.purchaseSuccess && (
        <Alert variant="success">
          Compra confirmada! Seu ingresso foi criado e está sendo processado.
        </Alert>
      )}
      {state?.status && <TicketStatusBadge status={state.status} />}
      <PagePlaceholder
        actions={<Link to="/meus-ingressos">Voltar aos meus ingressos</Link>}
        description="O processamento assíncrono foi iniciado. O acompanhamento automático e o download seguro do PDF serão conectados na Etapa 6."
        eyebrow="Ingresso digital"
        icon={QrCode}
        title={`Ingresso ${id ?? ''}`.trim()}
      />
    </div>
  )
}
