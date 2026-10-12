import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { ticketKeys } from '../app/queryKeys'
import type { ApiResponse } from '../types/api'
import type { Event } from '../types/events'
import type { Ticket } from '../types/tickets'
import { EventDetailsPage } from './EventDetailsPage'
import { TicketDetailsPage } from './tickets/TicketDetailsPage'

const detailMocks = vi.hoisted(() => ({
  getEvent: vi.fn(),
  purchaseTicket: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../api/eventos.api', () => ({ getEvent: detailMocks.getEvent }))
vi.mock('../api/ingressos.api', () => ({
  purchaseTicket: detailMocks.purchaseTicket,
}))
vi.mock('../hooks/useAuth', () => ({ useAuth: detailMocks.useAuth }))

const event: Event = {
  ativo: true,
  atualizado_em: '2026-01-01T00:00:00Z',
  banner_key: null,
  banner_url: null,
  criado_em: '2026-01-01T00:00:00Z',
  data: '2027-12-01T23:30:00Z',
  descricao: 'Música, arte e experiências na nuvem.',
  id: 42,
  ingressos_disponiveis: 25,
  local: 'Centro de Eventos do Ceará',
  meu_ingresso: null,
  nome: 'Festival Ticketz',
  organizador_id: 3,
  total_ingressos: 100,
}

const ticket: Ticket = {
  criado_em: '2026-10-12T12:00:00Z',
  evento: {
    data: event.data,
    id: event.id,
    local: event.local,
    nome: event.nome,
  },
  id: 91,
  pronto_em: null,
  status: 'PENDING',
}

function eventResponse(value: Event = event): ApiResponse<Event> {
  return { cacheStatus: 'MISS', data: value, status: 200 }
}

function LoginDestination() {
  const location = useLocation()
  const state = location.state as { from?: { pathname: string } } | null
  return <p>Login com retorno para {state?.from?.pathname}</p>
}

function renderDetails(path = '/eventos/42') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<EventDetailsPage />} path="/eventos/:id" />
          <Route element={<LoginDestination />} path="/login" />
          <Route element={<TicketDetailsPage />} path="/meus-ingressos/:id" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...result, queryClient }
}

describe('EventDetailsPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SHOW_CACHE_DEBUG', 'false')
    detailMocks.getEvent.mockReset()
    detailMocks.purchaseTicket.mockReset()
    detailMocks.useAuth.mockReset()
    detailMocks.useAuth.mockReturnValue({ isAuthenticated: false })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mostra carregamento enquanto consulta o detalhe', () => {
    detailMocks.getEvent.mockReturnValue(new Promise(() => undefined))

    renderDetails()

    expect(
      screen.getByRole('status', { name: 'Carregando detalhes do evento' }),
    ).toBeInTheDocument()
  })

  it('exibe todos os dados e direciona visitante ao login com retorno', async () => {
    detailMocks.getEvent.mockResolvedValue(eventResponse())
    const user = userEvent.setup()

    renderDetails()

    expect(await screen.findByRole('heading', { name: event.nome })).toBeInTheDocument()
    expect(screen.getByText(event.descricao ?? '')).toBeInTheDocument()
    expect(screen.getByText('1 de dezembro de 2027 às 20:30')).toBeInTheDocument()
    expect(screen.getByText(event.local)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Entrar para comprar' }))
    expect(screen.getByText('Login com retorno para /eventos/42')).toBeInTheDocument()
  })

  it('mostra ingresso existente com status e link', async () => {
    detailMocks.getEvent.mockResolvedValue(
      eventResponse({
        ...event,
        meu_ingresso: { id: 77, status: 'PENDING' },
      }),
    )
    detailMocks.useAuth.mockReturnValue({ isAuthenticated: true })

    renderDetails()

    expect(await screen.findByText('Gerando ingresso')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver meu ingresso' })).toHaveAttribute(
      'href',
      '/meus-ingressos/77',
    )
    expect(screen.queryByRole('button', { name: 'Comprar ingresso' })).not.toBeInTheDocument()
  })

  it('desabilita a compra quando o estoque está esgotado', async () => {
    detailMocks.getEvent.mockResolvedValue(
      eventResponse({ ...event, ingressos_disponiveis: 0 }),
    )
    detailMocks.useAuth.mockReturnValue({ isAuthenticated: true })

    renderDetails()

    expect(await screen.findByText('Ingressos esgotados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esgotado' })).toBeDisabled()
  })

  it('confirma uma única compra, invalida caches e redireciona com PENDING', async () => {
    let resolvePurchase: ((value: Ticket) => void) | undefined
    detailMocks.getEvent.mockResolvedValue(eventResponse())
    detailMocks.purchaseTicket.mockReturnValue(
      new Promise<Ticket>((resolve) => {
        resolvePurchase = resolve
      }),
    )
    detailMocks.useAuth.mockReturnValue({ isAuthenticated: true })
    const user = userEvent.setup()
    const { queryClient } = renderDetails()

    await user.click(await screen.findByRole('button', { name: 'Comprar ingresso' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmar ingresso' })
    expect(dialog).toHaveTextContent(event.nome)
    expect(dialog).toHaveTextContent('Cada pessoa pode possuir apenas um ingresso')

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar compra' }))
    expect(detailMocks.purchaseTicket).toHaveBeenCalledOnce()
    expect(within(dialog).getByRole('button', { name: 'Carregando' })).toBeDisabled()

    resolvePurchase?.(ticket)

    expect(
      await screen.findByText(
        'Compra confirmada! Seu ingresso foi criado e está sendo processado.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Gerando ingresso')).toBeInTheDocument()
    expect(queryClient.getQueryData(ticketKeys.detail(91))).toEqual(ticket)
  })

  it.each([
    ['JA_POSSUI_INGRESSO', 'Você já possui um ingresso para este evento.'],
    ['EVENTO_ENCERRADO', 'Este evento já foi encerrado.'],
    ['ESGOTADO', 'Os ingressos deste evento estão esgotados.'],
  ])(
    'exibe a mensagem específica do conflito %s',
    async (codigo, expectedMessage) => {
    detailMocks.getEvent.mockResolvedValue(eventResponse())
    detailMocks.purchaseTicket.mockRejectedValue(
      new ApiError(
        409,
        { codigo, mensagem: 'Conflito' },
        'Conflito',
      ),
    )
    detailMocks.useAuth.mockReturnValue({ isAuthenticated: true })
    const user = userEvent.setup()

    renderDetails()

    await user.click(await screen.findByRole('button', { name: 'Comprar ingresso' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar compra' }))

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('não consulta a API quando o identificador é inválido', () => {
    renderDetails('/eventos/invalido')

    expect(screen.getByText('Não encontramos este evento')).toBeInTheDocument()
    expect(detailMocks.getEvent).not.toHaveBeenCalled()
  })

  it('mostra o erro padronizado da consulta e permite tentar novamente', async () => {
    detailMocks.getEvent
      .mockRejectedValueOnce(new ApiError(404, 'Evento não encontrado', 'Erro'))
      .mockResolvedValueOnce(eventResponse())
    const user = userEvent.setup()

    renderDetails()

    expect(
      await screen.findByText('O conteúdo solicitado não foi encontrado.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: event.nome })).toBeInTheDocument()
    await waitFor(() => expect(detailMocks.getEvent).toHaveBeenCalledTimes(2))
  })
})
