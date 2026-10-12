import { zodResolver } from '@hookform/resolvers/zod'
import { Cloud, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Alert } from '../components/common/Alert'
import { Button } from '../components/common/Button'
import { useAuth } from '../hooks/useAuth'
import { getApiFieldErrors, getUserErrorMessage } from '../utils/errors'
import { consumeAuthSessionExpiredNotice } from '../utils/storage'
import styles from './AuthPage.module.css'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe sua senha.'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginLocationState {
  from?: {
    hash: string
    pathname: string
    search: string
  }
  registrationSuccess?: boolean
}

export function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sessionExpired] = useState(consumeAuthSessionExpiredNotice)
  const state = location.state as LoginLocationState | null
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    setSubmitError(null)

    try {
      await login(data.email, data.senha)
      const destination = state?.from
        ? `${state.from.pathname}${state.from.search}${state.from.hash}`
        : '/'
      navigate(destination, { replace: true })
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error)
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (field === 'email' || field === 'senha') {
          setError(field, { message, type: 'server' })
        }
      })
      setSubmitError(getUserErrorMessage(error, 'login'))
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>Acesse sua conta</p>
        <h1>Entre e acompanhe seus ingressos</h1>
        <p>
          Use seu e-mail e senha para acessar compras ou administrar eventos com
          segurança.
        </p>
        <div className={styles.cloudNote}>
          <Cloud aria-hidden="true" size={24} />
          <p>
            A sessão usa um JWT validado pela API. Seus dados privados são removidos
            do cache ao sair.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <form className={styles.form} noValidate onSubmit={handleSubmit(onSubmit)}>
          {state?.registrationSuccess && (
            <Alert variant="success">Conta criada. Agora entre com seus dados.</Alert>
          )}
          {sessionExpired && (
            <Alert variant="error">Sua sessão expirou. Entre novamente.</Alert>
          )}
          {submitError && <Alert variant="error">{submitError}</Alert>}

          <div className={styles.field}>
            <label htmlFor="login-email">E-mail</label>
            <input
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              id="login-email"
              inputMode="email"
              type="email"
              {...register('email')}
            />
            {errors.email && (
              <p className={styles.fieldError} id="login-email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="login-password">Senha</label>
            <input
              aria-describedby={errors.senha ? 'login-password-error' : undefined}
              aria-invalid={Boolean(errors.senha)}
              autoComplete="current-password"
              id="login-password"
              type="password"
              {...register('senha')}
            />
            {errors.senha && (
              <p className={styles.fieldError} id="login-password-error">
                {errors.senha.message}
              </p>
            )}
          </div>

          <Button
            className={styles.submitButton}
            isLoading={isSubmitting}
            type="submit"
          >
            <LogIn aria-hidden="true" size={18} />
            Entrar
          </Button>
        </form>

        <p className={styles.alternative}>
          Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
        </p>
      </div>
    </section>
  )
}
