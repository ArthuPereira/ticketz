import { SearchX } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '../components/common/Button'
import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <PagePlaceholder
      actions={
        <>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Link to="/">Ir para o início</Link>
        </>
      }
      description="O endereço pode estar incorreto ou o conteúdo pode ter sido removido."
      eyebrow="Erro 404"
      icon={SearchX}
      title="Página não encontrada"
    />
  )
}
