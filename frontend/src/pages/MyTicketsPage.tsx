import { TicketCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function MyTicketsPage() {
  return (
    <PagePlaceholder
      actions={<Link to="/">Encontrar eventos</Link>}
      description="Seus ingressos aparecerão aqui com o andamento da geração e acesso seguro ao PDF."
      eyebrow="Sua carteira"
      icon={TicketCheck}
      title="Meus ingressos"
    />
  )
}
