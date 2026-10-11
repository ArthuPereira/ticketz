import { CalendarDays } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function EventDetailsPage() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      actions={<Link to="/">Voltar para eventos</Link>}
      description="Aqui você encontrará data, local, disponibilidade e a opção de garantir seu ingresso."
      eyebrow="Detalhes do evento"
      icon={CalendarDays}
      title={`Evento ${id ?? ''}`.trim()}
    />
  )
}
