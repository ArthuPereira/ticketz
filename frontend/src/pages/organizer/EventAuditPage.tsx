import { ScrollText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PagePlaceholder } from '../../components/common/PagePlaceholder'

export function EventAuditPage() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      actions={<Link to={`/organizador/eventos/${id ?? ''}/editar`}>Voltar ao evento</Link>}
      description="As ações armazenadas no DynamoDB aparecerão em uma linha do tempo paginada por cursor."
      eyebrow="Auditoria"
      icon={ScrollText}
      title={`Histórico do evento ${id ?? ''}`.trim()}
    />
  )
}
