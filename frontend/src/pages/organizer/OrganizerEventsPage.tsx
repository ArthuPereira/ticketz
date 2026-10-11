import { CalendarCog } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../../components/common/PagePlaceholder'

export function OrganizerEventsPage() {
  return (
    <PagePlaceholder
      actions={<Link to="/organizador/eventos/novo">Criar evento</Link>}
      description="Seus eventos, ingressos disponíveis e atalhos de gestão serão reunidos neste painel."
      eyebrow="Área do organizador"
      icon={CalendarCog}
      title="Gerenciar eventos"
    />
  )
}
