import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Event, EventPage } from '../../types/events'
import { OrganizerEventsPage } from './OrganizerEventsPage'

const organizerMocks = vi.hoisted(() => ({
  deactivateEvent: vi.fn(),
  listOrganizerEvents: vi.fn(),
}))

vi.mock('../../api/eventos.api', () => ({
  deactivateEvent: organizerMocks.deactivateEvent,
  listOrganizerEvents: organizerMocks.listOrganizerEvents,
  ORGANIZER_EVENTS_PAGE_SIZE: 20,
}))

const event: Event = {
  ativo: true,
  atualizado_em: '2026-10-12T12:00:00Z',
  banner_key: null,
  banner_url: null,
  criado_em: '2026-10-12T12:00:00Z',
  data: '2027-12-01T23:00:00Z',
  descricao: 'Descrição',
  id: 42,
  ingressos_disponiveis: 450,
  local: 'Campus do Pici',
  meu_ingresso: null,
  nome: 'Festival Ticketz',
  organizador_id: 3,
  total_ingressos: 500,
}

const page: EventPage = {
  items: [event],
  limit: 20,
  offset: 0,
  total: 1,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrganizerEventsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('OrganizerEventsPage', () => {
  beforeEach(() => {
    organizerMocks.deactivateEvent.mockReset()
    organizerMocks.listOrganizerEvents.mockReset()
  })

  it('lista somente os eventos retornados para o organizador e suas ações', async () => {
    organizerMocks.listOrganizerEvents.mockResolvedValue(page)

    renderPage()

    expect(await screen.findByText('Festival Ticketz')).toBeInTheDocument()
    expect(screen.getByText('450 de 500')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/organizador/eventos/42/editar',
    )
    expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute(
      'href',
      '/organizador/eventos/42/logs',
    )
    expect(organizerMocks.listOrganizerEvents).toHaveBeenCalledWith(
      { limit: 20, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('exige confirmação, bloqueia repetição e remove o evento após 204', async () => {
    let resolveDeactivate: (() => void) | undefined
    organizerMocks.listOrganizerEvents
      .mockResolvedValueOnce(page)
      .mockResolvedValue({ ...page, items: [], total: 0 })
    organizerMocks.deactivateEvent.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDeactivate = resolve
      }),
    )
    const user = userEvent.setup()

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Desativar' }))
    const dialog = screen.getByRole('dialog', { name: 'Desativar evento' })
    expect(dialog).toHaveTextContent('Os ingressos já emitidos serão preservados.')

    await user.click(within(dialog).getByRole('button', { name: 'Desativar evento' }))
    expect(organizerMocks.deactivateEvent).toHaveBeenCalledOnce()
    expect(within(dialog).getByRole('button', { name: 'Carregando' })).toBeDisabled()

    await act(async () => resolveDeactivate?.())

    expect(await screen.findByText(/evento desativado/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Festival Ticketz')).not.toBeInTheDocument())
  })
})
