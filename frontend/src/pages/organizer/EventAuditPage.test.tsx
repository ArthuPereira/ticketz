import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import type { ActionLog, ActionLogPage } from '../../types/audit'
import { EventAuditPage } from './EventAuditPage'

const auditMocks = vi.hoisted(() => ({
  listEventAuditLogs: vi.fn(),
}))

vi.mock('../../api/eventos.api', () => ({
  EVENT_AUDIT_PAGE_SIZE: 20,
  listEventAuditLogs: auditMocks.listEventAuditLogs,
}))

const updateLog: ActionLog = {
  acao: 'UPDATE_EVENT',
  dados: {
    antes: { local: 'Pici', nome: 'Nome antigo' },
    depois: { local: 'Pici', nome: 'Nome novo' },
  },
  entidade: 'evento#42',
  sk: '2026-10-12T13:00:00Z#update',
  timestamp: '2026-10-12T13:00:00Z',
  usuario_id: 3,
}

const createLog: ActionLog = {
  acao: 'CREATE_EVENT',
  dados: {
    local: 'Campus do Pici',
    nome: 'Festival Ticketz',
    total_ingressos: 500,
  },
  entidade: 'evento#42',
  sk: '2026-10-12T12:00:00Z#create',
  timestamp: '2026-10-12T12:00:00Z',
  usuario_id: 3,
}

const firstPage: ActionLogPage = { cursor: 'next-cursor==', items: [updateLog] }
const secondPage: ActionLogPage = {
  cursor: null,
  items: [updateLog, createLog],
}

function EventSwitcher() {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate('/organizador/eventos/43/logs')} type="button">
      Outro evento
    </button>
  )
}

function renderPage(includeSwitcher = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organizador/eventos/42/logs']}>
        {includeSwitcher && <EventSwitcher />}
        <Routes>
          <Route element={<EventAuditPage />} path="/organizador/eventos/:id/logs" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EventAuditPage', () => {
  beforeEach(() => {
    auditMocks.listEventAuditLogs.mockReset()
  })

  it('mostra a timeline com ação, usuário, data e alterações legíveis', async () => {
    auditMocks.listEventAuditLogs.mockResolvedValue(firstPage)
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Evento atualizado' })).toBeInTheDocument()
    expect(screen.getByText('1 campo foi alterado.')).toBeInTheDocument()
    expect(screen.getByText('Nome antigo')).toBeInTheDocument()
    expect(screen.getByText('Nome novo')).toBeInTheDocument()
    expect(screen.getByText('Usuário #3')).toBeInTheDocument()
    expect(screen.getByText('evento#42')).toBeInTheDocument()

    await user.click(screen.getByText('Ver dados técnicos'))
    expect(screen.getByText(/"antes"/)).toBeInTheDocument()
  })

  it('acrescenta a próxima página pelo cursor sem repetir itens', async () => {
    auditMocks.listEventAuditLogs
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
    const user = userEvent.setup()

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))

    expect(await screen.findByRole('heading', { name: 'Evento criado' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Evento atualizado' })).toHaveLength(1)
    expect(auditMocks.listEventAuditLogs).toHaveBeenLastCalledWith(
      42,
      { cursor: 'next-cursor==', limit: 20 },
      expect.any(AbortSignal),
    )
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
  })

  it('reinicia sem cursor quando a rota muda para outro evento', async () => {
    auditMocks.listEventAuditLogs.mockImplementation(
      (eventId: number, params: { cursor?: string | null }) => {
        if (eventId === 43) return Promise.resolve({ cursor: null, items: [] })
        return Promise.resolve(params.cursor ? secondPage : firstPage)
      },
    )
    const user = userEvent.setup()

    renderPage(true)
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    await user.click(screen.getByRole('button', { name: 'Outro evento' }))

    await waitFor(() =>
      expect(auditMocks.listEventAuditLogs).toHaveBeenCalledWith(
        43,
        { cursor: null, limit: 20 },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByText('Nenhum registro de auditoria')).toBeInTheDocument()
  })

  it('mostra estado vazio e erro de autorização', async () => {
    auditMocks.listEventAuditLogs.mockResolvedValueOnce({ cursor: null, items: [] })
    const { unmount } = renderPage()
    expect(await screen.findByText('Nenhum registro de auditoria')).toBeInTheDocument()
    unmount()

    auditMocks.listEventAuditLogs.mockRejectedValue(
      new ApiError(403, 'Acesso restrito', 'Acesso restrito'),
    )
    renderPage()
    expect(
      await screen.findByText('Você não tem permissão para realizar esta ação.'),
    ).toBeInTheDocument()
  })
})
