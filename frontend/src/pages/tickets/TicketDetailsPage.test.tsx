import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { ticketKeys } from '../../app/queryKeys'
import type { Ticket } from '../../types/tickets'
import {
  TICKET_POLLING_INTERVAL_MS,
  TICKET_POLLING_TIMEOUT_MS,
  TicketDetailsPage,
} from './TicketDetailsPage'

const ticketDetailMocks = vi.hoisted(() => ({
  getTicket: vi.fn(),
  getTicketDownload: vi.fn(),
  reprocessTicket: vi.fn(),
}))

vi.mock('../../api/ingressos.api', () => ({
  getTicket: ticketDetailMocks.getTicket,
  getTicketDownload: ticketDetailMocks.getTicketDownload,
  reprocessTicket: ticketDetailMocks.reprocessTicket,
}))

const pendingTicket: Ticket = {
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
}

function renderDetails(path = '/meus-ingressos/91', state?: object) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route element={<TicketDetailsPage />} path="/meus-ingressos/:id" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...result, queryClient }
}

describe('TicketDetailsPage', () => {
  beforeEach(() => {
    ticketDetailMocks.getTicket.mockReset()
    ticketDetailMocks.getTicketDownload.mockReset()
    ticketDetailMocks.reprocessTicket.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('mostra o detalhe real e o aviso de compra concluída', async () => {
    ticketDetailMocks.getTicket.mockResolvedValue(pendingTicket)

    renderDetails('/meus-ingressos/91', { purchaseSuccess: true })

    expect(await screen.findByRole('heading', { name: 'Festival Ticketz' })).toBeInTheDocument()
    expect(screen.getByText('Gerando ingresso')).toBeInTheDocument()
    expect(
      screen.getByText('Compra confirmada! Seu ingresso foi criado e está sendo processado.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Centro de Eventos do Ceará')).toBeInTheDocument()
  })

  it('faz polling enquanto PENDING e para ao receber READY', async () => {
    vi.useFakeTimers()
    ticketDetailMocks.getTicket
      .mockResolvedValueOnce(pendingTicket)
      .mockResolvedValue({
        ...pendingTicket,
        pronto_em: '2026-10-12T12:01:00Z',
        status: 'READY',
      })

    renderDetails()
    await vi.waitFor(() =>
      expect(screen.getByText('Gerando ingresso')).toBeInTheDocument(),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_POLLING_INTERVAL_MS + 1)
    })
    expect(screen.getByText('Pronto para baixar')).toBeInTheDocument()
    expect(ticketDetailMocks.getTicket).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_POLLING_INTERVAL_MS * 2)
    })
    expect(ticketDetailMocks.getTicket).toHaveBeenCalledTimes(2)
  })

  it('pausa o polling após dois minutos sem transformar PENDING em falha', async () => {
    vi.useFakeTimers()
    ticketDetailMocks.getTicket.mockResolvedValue(pendingTicket)

    renderDetails()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_POLLING_TIMEOUT_MS)
    })

    expect(
      screen.getByText(/atualização automática foi pausada após dois minutos/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Gerando ingresso')).toBeInTheDocument()
    const callsAtTimeout = ticketDetailMocks.getTicket.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_POLLING_INTERVAL_MS * 2)
    })
    expect(ticketDetailMocks.getTicket).toHaveBeenCalledTimes(callsAtTimeout)
  })

  it('solicita uma URL nova e a usa imediatamente para baixar um READY', async () => {
    const readyTicket: Ticket = {
      ...pendingTicket,
      pronto_em: '2026-10-12T12:01:00Z',
      status: 'READY',
    }
    ticketDetailMocks.getTicket.mockResolvedValue(readyTicket)
    ticketDetailMocks.getTicketDownload.mockResolvedValue({
      expira_em: 300,
      url: 'https://s3.example.test/ticket.pdf?temporary=true',
    })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const user = userEvent.setup()

    renderDetails()
    await user.click(await screen.findByRole('button', { name: 'Baixar PDF' }))

    await waitFor(() => expect(ticketDetailMocks.getTicketDownload).toHaveBeenCalledWith(91))
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(document.querySelector('a[href*="temporary=true"]')).not.toBeInTheDocument()
  })

  it('reprocessa FAILED uma única vez, troca para PENDING e invalida os caches', async () => {
    const failedTicket: Ticket = { ...pendingTicket, status: 'FAILED' }
    let resolveReprocess: ((ticket: Ticket) => void) | undefined
    ticketDetailMocks.getTicket
      .mockResolvedValueOnce(failedTicket)
      .mockResolvedValue(pendingTicket)
    ticketDetailMocks.reprocessTicket.mockReturnValue(
      new Promise<Ticket>((resolve) => {
        resolveReprocess = resolve
      }),
    )
    const user = userEvent.setup()
    const { queryClient } = renderDetails()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(await screen.findByRole('button', { name: 'Reprocessar ingresso' }))
    expect(ticketDetailMocks.reprocessTicket).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Carregando' })).toBeDisabled()

    await act(async () => resolveReprocess?.(pendingTicket))

    expect(await screen.findByText('Gerando ingresso')).toBeInTheDocument()
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ticketKeys.detail(91) })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ticketKeys.lists() })
    })
  })

  it('usa a mesma mensagem neutra para ingresso inexistente ou alheio', async () => {
    ticketDetailMocks.getTicket.mockRejectedValue(
      new ApiError(404, 'Ingresso não encontrado', 'Ingresso não encontrado'),
    )

    renderDetails()

    expect(
      await screen.findByText('Não encontramos este ingresso'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/não existe ou não está disponível para a sua conta/i),
    ).toBeInTheDocument()
  })
})
