import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function ForbiddenPage() {
  return (
    <PagePlaceholder
      actions={<Link to="/">Voltar para os eventos</Link>}
      description="Você não tem permissão para realizar esta ação. O acesso de organizador também é validado pelo backend."
      eyebrow="Acesso negado"
      icon={ShieldX}
      title="Esta área é exclusiva para organizadores"
    />
  )
}
