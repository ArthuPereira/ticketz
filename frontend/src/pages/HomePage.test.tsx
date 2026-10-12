import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiResponse } from '../types/api'
import type { Event, EventPage } from '../types/events'
import { HomePage } from './HomePage'

const eventApiMocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
}))

vi.mock('../api/eventos.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/eventos.api')>()
  return { ...original, listEvents: eventApiMocks.listEvents }
})

const event: Event = {
  ativo: true,
  atualizado_em: '2027-01-01T00:00:00Z',
  banner_key: 'banners/festival.jpg',
  banner_url: 'https://s3.example.com/banner-temporario',
  criado_em: '2027-01-01T00:00:00Z',
  data: '2027-12-01T23:30:00Z',
  descricao: 'Uma noite especial.',
  id: 10,
  ingressos_disponiveis: 25,
  local: 'Centro de Eventos do Ceará',
  meu_ingresso: null,
  nome: 'Festival Ticketz',
  organizador_id: 3,
  total_ingressos: 100,
}

function createResponse(items: Event[]): ApiResponse<EventPage> {
  return {
    cacheStatus: 'MISS',
    data: { items, limit: 12, offset: 0, total: items.length },
    status: 200,
  }
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    eventApiMocks.listEvents.mockReset()
  })

  it('mostra skeleton enquanto busca a primeira página', () => {
    eventApiMocks.listEvents.mockReturnValue(new Promise(() => undefined))

    renderHome()

    expect(
      screen.getByRole('status', { name: 'Carregando eventos' }),
    ).toBeInTheDocument()
  })

  it('exibe eventos com data de Fortaleza, local, estoque e link', async () => {
    eventApiMocks.listEvents.mockResolvedValue(createResponse([event]))

    renderHome()

    expect(await screen.findByText('Festival Ticketz')).toBeInTheDocument()
    expect(screen.getByText('1 de dezembro de 2027 às 20:30')).toBeInTheDocument()
    expect(screen.getByText('Centro de Eventos do Ceará')).toBeInTheDocument()
    expect(screen.getByText('25 disponíveis')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalhes de Festival Ticketz' })).toHaveAttribute(
      'href',
      '/eventos/10',
    )
  })

  it('troca banner quebrado pela imagem padrão sem persistir a URL', async () => {
    eventApiMocks.listEvents.mockResolvedValue(createResponse([event]))

    renderHome()

    const image = await screen.findByAltText('Banner do evento Festival Ticketz')
    fireEvent.error(image)

    expect(image).toHaveAttribute('src', '/event-placeholder.svg')
    expect(image).toHaveAttribute('alt', '')
  })

  it('distingue o estado vazio', async () => {
    eventApiMocks.listEvents.mockResolvedValue(createResponse([]))

    renderHome()

    expect(
      await screen.findByText('Nenhum evento disponível no momento'),
    ).toBeInTheDocument()
  })

  it('mostra erro e permite tentar novamente', async () => {
    eventApiMocks.listEvents
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(createResponse([event]))
    const user = userEvent.setup()

    renderHome()

    expect(
      await screen.findByText('O serviço está temporariamente indisponível.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Festival Ticketz')).toBeInTheDocument()
    expect(eventApiMocks.listEvents).toHaveBeenCalledTimes(2)
  })

  it('mostra esgotado com texto e ícone quando não há estoque', async () => {
    eventApiMocks.listEvents.mockResolvedValue(
      createResponse([{ ...event, id: 11, ingressos_disponiveis: 0 }]),
    )

    renderHome()

    expect(await screen.findByText('Esgotado')).toBeInTheDocument()
  })
})
