import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '../app/queryClient'
import { useAuth } from '../hooks/useAuth'
import type { User } from '../types/auth'
import { AUTH_TOKEN_KEY, expireAuthSession } from '../utils/storage'
import { AuthProvider } from './AuthContext'

const authApiMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loginUser: vi.fn(),
}))

vi.mock('../api/auth.api', () => authApiMocks)

const regularUser: User = {
  id: 7,
  nome: 'Ana Silva',
  email: 'ana@example.com',
  papel: 'user',
}

function AuthConsumer() {
  const { isAuthenticated, isRestoring, login, logout, user } = useAuth()

  return (
    <div>
      <span>{isRestoring ? 'restaurando' : 'pronto'}</span>
      <span>{isAuthenticated ? user?.nome : 'visitante'}</span>
      <button type="button" onClick={() => void login('ana@example.com', 'senha-segura')}>
        Entrar
      </button>
      <button type="button" onClick={logout}>
        Sair
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    sessionStorage.clear()
    queryClient.clear()
    authApiMocks.getCurrentUser.mockReset()
    authApiMocks.loginUser.mockReset()
  })

  it('guarda o token e busca o usuário depois do login', async () => {
    authApiMocks.loginUser.mockResolvedValue({
      access_token: 'jwt-valido',
      token_type: 'bearer',
    })
    authApiMocks.getCurrentUser.mockResolvedValue(regularUser)
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe('jwt-valido')
    expect(authApiMocks.getCurrentUser).toHaveBeenCalledOnce()
  })

  it('restaura a sessão existente usando /auth/me', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-existente')
    authApiMocks.getCurrentUser.mockResolvedValue(regularUser)

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    expect(screen.getByText('restaurando')).toBeInTheDocument()
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument()
    expect(screen.getByText('pronto')).toBeInTheDocument()
  })

  it('remove a sessão quando a API informa que ela expirou', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-expirado')
    authApiMocks.getCurrentUser.mockImplementation(async () => {
      expireAuthSession()
      throw new Error('Não autorizado')
    })

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    expect(await screen.findByText('visitante')).toBeInTheDocument()
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
  })

  it('remove usuário, token e queries privadas no logout', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-valido')
    queryClient.setQueryData(['ingressos', 'meus'], [{ id: 1 }])
    authApiMocks.getCurrentUser.mockResolvedValue(regularUser)
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    await screen.findByText('Ana Silva')
    await user.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => {
      expect(screen.getByText('visitante')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(queryClient.getQueryData(['ingressos', 'meus'])).toBeUndefined()
  })
})
