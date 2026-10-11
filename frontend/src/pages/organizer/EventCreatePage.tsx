import { CirclePlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../../components/common/PagePlaceholder'

export function EventCreatePage() {
  return (
    <PagePlaceholder
      actions={<Link to="/organizador/eventos">Voltar ao painel</Link>}
      description="O formulário criará o evento e, em uma segunda operação, enviará o banner ao S3."
      eyebrow="Novo evento"
      icon={CirclePlus}
      title="Criar evento"
    />
  )
}
