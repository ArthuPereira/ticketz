import { LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function LoginPage() {
  return (
    <PagePlaceholder
      actions={<Link to="/cadastro">Ainda não tenho conta</Link>}
      description="O acesso seguro com JWT será conectado aqui para proteger seus ingressos e eventos."
      eyebrow="Acesse sua conta"
      icon={LogIn}
      title="Entrar no Ticketz"
    />
  )
}
