import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TicketPage } from '../types/tickets'
import { MyTicketsPage } from './MyTicketsPage'

const ticketListMocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
}))

vi.mock('../api/ingressos.api', () => ({
  listTickets: ticketListMocks.listTickets,
  TICKETS_PAGE_SIZE: 10,
}))

const firstPage: TicketPage = {
  items: [
    {
      criado_em: '2026-10-12T12:00:00Z',
      evento: {
        data: '2027-12-01T23:30:00Z',
        id: 42,
        local: 'Centro de Eventos do Ceará',
        nome: 'Festival Ticketz',
      },
      id: 91,
      pronto_em: null,
      status: 'PENDING',
    },
  ],
  limit: 10,
  offset: 0,
  total: 11,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MyTicketsPage', () => {
  beforeEach(() => {
    ticketListMocks.listTickets.mockReset()
  })

  it('lista os ingressos do usuário com status, dados e link de detalhe', async () => {
    ticketListMocks.listTickets.mockResolvedValue(firstPage)

    renderPage()

    expect(await screen.findByText('Festival Ticketz')).toBeInTheDocument()
    expect(screen.getByText('Gerando ingresso')).toBeInTheDocument()
    expect(screen.getByText('Centro de Eventos do Ceará')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute(
      'href',
      '/meus-ingressos/91',
    )
    expect(ticketListMocks.listTickets).toHaveBeenCalledWith(
      { limit: 10, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('pagina em blocos de dez ingressos', async () => {
    ticketListMocks.listTickets
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        ...firstPage,
        items: [{ ...firstPage.items[0], id: 92, status: 'READY' }],
        offset: 10,
      })
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ir para a próxima página' }))

    await waitFor(() =>
      expect(ticketListMocks.listTickets).toHaveBeenLastCalledWith(
        { limit: 10, offset: 10 },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByText('Pronto para baixar')).toBeInTheDocument()
  })

  it('exibe um estado vazio quando o usuário ainda não tem ingressos', async () => {
    ticketListMocks.listTickets.mockResolvedValue({
      items: [],
      limit: 10,
      offset: 0,
      total: 0,
    })

    renderPage()

    expect(
      await screen.findByText('Você ainda não possui ingressos'),
    ).toBeInTheDocument()
  })
})
