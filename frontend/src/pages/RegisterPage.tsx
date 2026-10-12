import { zodResolver } from '@hookform/resolvers/zod'
import { Cloud, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { registerUser } from '../api/auth.api'
import { Alert } from '../components/common/Alert'
import { Button } from '../components/common/Button'
import { getApiFieldErrors, getUserErrorMessage } from '../utils/errors'
import styles from './AuthPage.module.css'

const registerSchema = z.object({
  nome: z.string().trim().min(1, 'Informe seu nome.').max(150, 'Use no máximo 150 caracteres.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu e-mail.')
    .max(255, 'Use no máximo 255 caracteres.')
    .email('Informe um e-mail válido.'),
  senha: z
    .string()
    .min(8, 'Use pelo menos oito caracteres.')
    .max(255, 'Use no máximo 255 caracteres.'),
  papel: z.enum(['user', 'organizer']),
})

type RegisterFormData = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<RegisterFormData>({
    defaultValues: { papel: 'user' },
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterFormData) {
    setSubmitError(null)

    try {
      await registerUser(data)
      navigate('/login', {
        replace: true,
        state: { registrationSuccess: true },
      })
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error)
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (field === 'nome' || field === 'email' || field === 'senha' || field === 'papel') {
          setError(field, { message, type: 'server' })
        }
      })
      setSubmitError(getUserErrorMessage(error))
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>Primeiro acesso</p>
        <h1>Crie sua conta no Ticketz</h1>
        <p>
          Escolha participar dos eventos ou gerenciar sua própria programação como
          organizador.
        </p>
        <div className={styles.cloudNote}>
          <Cloud aria-hidden="true" size={24} />
          <p>
            O cadastro é enviado à API, que protege a senha e mantém a autorização como
            fonte da verdade.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <form className={styles.form} noValidate onSubmit={handleSubmit(onSubmit)}>
          {submitError && <Alert variant="error">{submitError}</Alert>}

          <div className={styles.field}>
            <label htmlFor="register-name">Nome</label>
            <input
              aria-describedby={errors.nome ? 'register-name-error' : undefined}
              aria-invalid={Boolean(errors.nome)}
              autoComplete="name"
              id="register-name"
              type="text"
              {...register('nome')}
            />
            {errors.nome && (
              <p className={styles.fieldError} id="register-name-error">
                {errors.nome.message}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="register-email">E-mail</label>
            <input
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              id="register-email"
              inputMode="email"
              type="email"
              {...register('email')}
            />
            {errors.email && (
              <p className={styles.fieldError} id="register-email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="register-password">Senha</label>
            <input
              aria-describedby={errors.senha ? 'register-password-error' : undefined}
              aria-invalid={Boolean(errors.senha)}
              autoComplete="new-password"
              id="register-password"
              type="password"
              {...register('senha')}
            />
            {errors.senha && (
              <p className={styles.fieldError} id="register-password-error">
                {errors.senha.message}
              </p>
            )}
          </div>

          <fieldset className={styles.roleGroup}>
            <legend className={styles.legend}>Como você usará o Ticketz?</legend>
            <div className={styles.roleOptions}>
              <label className={styles.roleOption}>
                <input type="radio" value="user" {...register('papel')} />
                <span>
                  <strong>Participante</strong>
                  <small>Comprar e acompanhar ingressos</small>
                </span>
              </label>
              <label className={styles.roleOption}>
                <input type="radio" value="organizer" {...register('papel')} />
                <span>
                  <strong>Organizador</strong>
                  <small>Criar e administrar eventos</small>
                </span>
              </label>
            </div>
            {errors.papel && <p className={styles.fieldError}>{errors.papel.message}</p>}
          </fieldset>

          <Button
            className={styles.submitButton}
            isLoading={isSubmitting}
            type="submit"
          >
            <UserPlus aria-hidden="true" size={18} />
            Criar conta
          </Button>
        </form>

        <p className={styles.alternative}>
          Já tem uma conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </section>
  )
}
