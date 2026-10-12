import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Navigation } from '../components/layout/Navigation'
import type { User } from '../types/auth'
import { OrganizerRoute } from './OrganizerRoute'
import { ProtectedRoute } from './ProtectedRoute'

const authMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: authMocks.useAuth,
}))

const regularUser: User = {
  email: 'ana@example.com',
  id: 1,
  nome: 'Ana Silva',
  papel: 'user',
}

function setAuthState(
  overrides: Partial<{
    isAuthenticated: boolean
    isOrganizer: boolean
    isRestoring: boolean
    user: User | null
  }> = {},
) {
  authMocks.useAuth.mockReturnValue({
    isAuthenticated: false,
    isOrganizer: false,
    isRestoring: false,
    login: vi.fn(),
    logout: authMocks.logout,
    token: null,
    user: null,
    ...overrides,
  })
}

function LoginDestination() {
  const location = useLocation()
  const state = location.state as { from?: { pathname: string } } | null
  return <p>Login após {state?.from?.pathname ?? 'origem desconhecida'}</p>
}

describe('guardas de autenticação', () => {
  beforeEach(() => {
    authMocks.logout.mockReset()
    authMocks.useAuth.mockReset()
    setAuthState()
  })

  it('mostra carregamento enquanto restaura a sessão', () => {
    setAuthState({ isRestoring: true })

    render(
      <MemoryRouter initialEntries={['/privado']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<p>Conteúdo privado</p>} path="/privado" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('status', { name: 'Restaurando sua sessão' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument()
  })

  it('envia visitante ao login preservando a URL original', () => {
    render(
      <MemoryRouter initialEntries={['/privado?origem=evento']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<p>Conteúdo privado</p>} path="/privado" />
          </Route>
          <Route element={<LoginDestination />} path="/login" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Login após /privado')).toBeInTheDocument()
  })

  it('libera a rota autenticada para usuário logado', () => {
    setAuthState({ isAuthenticated: true, user: regularUser })

    render(
      <MemoryRouter initialEntries={['/privado']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<p>Conteúdo privado</p>} path="/privado" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Conteúdo privado')).toBeInTheDocument()
  })

  it('mostra 403 para usuário comum na área de organizador', () => {
    setAuthState({ isAuthenticated: true, user: regularUser })

    render(
      <MemoryRouter initialEntries={['/organizador/eventos']}>
        <Routes>
          <Route element={<OrganizerRoute />}>
            <Route element={<p>Painel do organizador</p>} path="/organizador/eventos" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByText('Esta área é exclusiva para organizadores'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Painel do organizador')).not.toBeInTheDocument()
  })

  it('libera o painel quando o papel é organizer', () => {
    setAuthState({
      isAuthenticated: true,
      isOrganizer: true,
      user: { ...regularUser, papel: 'organizer' },
    })

    render(
      <MemoryRouter initialEntries={['/organizador/eventos']}>
        <Routes>
          <Route element={<OrganizerRoute />}>
            <Route element={<p>Painel do organizador</p>} path="/organizador/eventos" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Painel do organizador')).toBeInTheDocument()
  })
})

describe('Navigation', () => {
  beforeEach(() => {
    authMocks.logout.mockReset()
    authMocks.useAuth.mockReset()
    setAuthState()
  })

  it('mostra cadastro e login somente para visitante', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Meus ingressos' })).not.toBeInTheDocument()
  })

  it('oculta a área de organizador para usuário comum e realiza logout', async () => {
    setAuthState({ isAuthenticated: true, user: regularUser })
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/meus-ingressos']}>
        <Routes>
          <Route element={<Navigation />} path="*" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Meus ingressos' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Organizar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sair da conta de Ana Silva' }))
    expect(authMocks.logout).toHaveBeenCalledOnce()
  })
})
