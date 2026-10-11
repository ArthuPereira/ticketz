import { Pencil } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PagePlaceholder } from '../../components/common/PagePlaceholder'

export function EventEditPage() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      actions={<Link to="/organizador/eventos">Voltar ao painel</Link>}
      description="Nome, descrição, local, data e banner poderão ser atualizados sem alterar o lote original."
      eyebrow="Edição do evento"
      icon={Pencil}
      title={`Editar evento ${id ?? ''}`.trim()}
    />
  )
}
