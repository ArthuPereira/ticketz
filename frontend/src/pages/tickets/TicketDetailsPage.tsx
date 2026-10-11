import { QrCode } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PagePlaceholder } from '../../components/common/PagePlaceholder'

export function TicketDetailsPage() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      actions={<Link to="/meus-ingressos">Voltar aos meus ingressos</Link>}
      description="O status PENDING, READY ou FAILED e as ações de download e reprocessamento ficarão aqui."
      eyebrow="Ingresso digital"
      icon={QrCode}
      title={`Ingresso ${id ?? ''}`.trim()}
    />
  )
}
