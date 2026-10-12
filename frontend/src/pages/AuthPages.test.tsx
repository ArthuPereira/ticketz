import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  registerUser: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isOrganizer: false,
    isRestoring: false,
    login: authMocks.login,
    logout: vi.fn(),
    token: null,
    user: null,
  }),
}))

vi.mock('../api/auth.api', () => ({
  registerUser: authMocks.registerUser,
}))

async function fillLoginForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

async function fillRegisterForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nome'), 'Ana Silva')
  await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    authMocks.login.mockReset()
    authMocks.registerUser.mockReset()
  })

  it('faz login e retorna à rota originalmente solicitada', async () => {
    authMocks.login.mockResolvedValue(undefined)

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/login',
            state: {
              from: { hash: '', pathname: '/meus-ingressos', search: '' },
            },
          },
        ]}
      >
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<p>Área protegida</p>} path="/meus-ingressos" />
        </Routes>
      </MemoryRouter>,
    )

    await fillLoginForm()

    expect(authMocks.login).toHaveBeenCalledWith(
      'ana@example.com',
      'senha-segura',
    )
    expect(await screen.findByText('Área protegida')).toBeInTheDocument()
  })

  it('não revela se o e-mail existe quando as credenciais são inválidas', async () => {
    authMocks.login.mockRejectedValue(
      new ApiError(401, 'Credenciais inválidas', 'Credenciais inválidas'),
    )

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await fillLoginForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciais inválidas.',
    )
  })

  it('valida os campos antes de chamar a API', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
    expect(authMocks.login).not.toHaveBeenCalled()
  })
})

describe('RegisterPage', () => {
  beforeEach(() => {
    authMocks.login.mockReset()
    authMocks.registerUser.mockReset()
  })

  it('cadastra participante e mostra sucesso na tela de login', async () => {
    authMocks.registerUser.mockResolvedValue({
      email: 'ana@example.com',
      id: 1,
      nome: 'Ana Silva',
      papel: 'user',
    })

    render(
      <MemoryRouter initialEntries={['/cadastro']}>
        <Routes>
          <Route element={<RegisterPage />} path="/cadastro" />
          <Route element={<LoginPage />} path="/login" />
        </Routes>
      </MemoryRouter>,
    )

    await fillRegisterForm()

    expect(authMocks.registerUser).toHaveBeenCalledWith({
      email: 'ana@example.com',
      nome: 'Ana Silva',
      papel: 'user',
      senha: 'senha-segura',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conta criada. Agora entre com seus dados.',
    )
  })

  it('exibe o conflito quando o e-mail já está cadastrado', async () => {
    authMocks.registerUser.mockRejectedValue(
      new ApiError(409, 'E-mail já cadastrado', 'E-mail já cadastrado'),
    )

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await fillRegisterForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail já cadastrado',
    )
  })
})
