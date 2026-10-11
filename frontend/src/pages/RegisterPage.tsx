import { UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function RegisterPage() {
  return (
    <PagePlaceholder
      actions={<Link to="/login">Já tenho uma conta</Link>}
      description="O cadastro permitirá escolher entre participante e organizador, conforme a permissão do backend."
      eyebrow="Primeiro acesso"
      icon={UserPlus}
      title="Criar conta"
    />
  )
}
