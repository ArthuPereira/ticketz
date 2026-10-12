import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiResponse } from '../../types/api'
import type { Event } from '../../types/events'
import { EventCreatePage } from './EventCreatePage'
import { EventEditPage } from './EventEditPage'

const eventPageMocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  uploadEventBanner: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../../api/eventos.api', () => ({
  createEvent: eventPageMocks.createEvent,
  getEvent: eventPageMocks.getEvent,
  updateEvent: eventPageMocks.updateEvent,
  uploadEventBanner: eventPageMocks.uploadEventBanner,
}))

vi.mock('../../hooks/useAuth', () => ({ useAuth: eventPageMocks.useAuth }))

const event: Event = {
  ativo: true,
  atualizado_em: '2026-10-12T12:00:00Z',
  banner_key: null,
  banner_url: null,
  criado_em: '2026-10-12T12:00:00Z',
  data: '2099-12-01T23:00:00Z',
  descricao: 'Descrição original',
  id: 42,
  ingressos_disponiveis: 500,
  local: 'Campus do Pici',
  meu_ingresso: null,
  nome: 'Festival Ticketz',
  organizador_id: 3,
  total_ingressos: 500,
}

function eventResponse(): ApiResponse<Event> {
  return { cacheStatus: null, data: event, status: 200 }
}

function Destination() {
  const location = useLocation()
  const state = location.state as Record<string, string> | null
  return <p>{state?.successMessage ?? state?.bannerUploadError ?? 'Destino'}</p>
}

function renderCreatePage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organizador/eventos/novo']}>
        <Routes>
          <Route element={<EventCreatePage />} path="/organizador/eventos/novo" />
          <Route element={<Destination />} path="/organizador/eventos" />
          <Route element={<Destination />} path="/organizador/eventos/:id/editar" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderEditPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organizador/eventos/42/editar']}>
        <Routes>
          <Route element={<EventEditPage />} path="/organizador/eventos/:id/editar" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillRequiredCreateFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome'), 'Festival Ticketz')
  await user.type(screen.getByLabelText('Local'), 'Campus do Pici')
  await user.type(screen.getByLabelText('Data e hora'), '2099-12-01T20:00')
  await user.type(screen.getByLabelText('Total de ingressos'), '500')
}

describe('páginas de criação e edição de evento', () => {
  beforeEach(() => {
    eventPageMocks.createEvent.mockReset()
    eventPageMocks.getEvent.mockReset()
    eventPageMocks.updateEvent.mockReset()
    eventPageMocks.uploadEventBanner.mockReset()
    eventPageMocks.useAuth.mockReset()
    eventPageMocks.useAuth.mockReturnValue({ user: { id: 3 } })
    const NativeURL = URL
    vi.stubGlobal(
      'URL',
      class MockURL extends NativeURL {
        static createObjectURL = vi.fn(() => 'blob:banner-preview')
        static revokeObjectURL = vi.fn()
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cria sem banner e redireciona ao painel', async () => {
    eventPageMocks.createEvent.mockResolvedValue(event)
    const user = userEvent.setup()

    renderCreatePage()
    await fillRequiredCreateFields(user)
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(eventPageMocks.createEvent).toHaveBeenCalledWith({
      data: new Date('2099-12-01T20:00').toISOString(),
      descricao: null,
      local: 'Campus do Pici',
      nome: 'Festival Ticketz',
      total_ingressos: 500,
    })
    expect(await screen.findByText('Evento criado com sucesso.')).toBeInTheDocument()
    expect(eventPageMocks.uploadEventBanner).not.toHaveBeenCalled()
  })

  it('cria e envia o banner em uma segunda operação', async () => {
    eventPageMocks.createEvent.mockResolvedValue(event)
    eventPageMocks.uploadEventBanner.mockResolvedValue({
      ...event,
      banner_key: 'eventos/42/banner.png',
      banner_url: 'https://s3.example.test/banner.png',
    })
    const user = userEvent.setup()

    renderCreatePage()
    await fillRequiredCreateFields(user)
    const banner = new File(['image'], 'banner.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Banner do evento'), banner)
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(eventPageMocks.createEvent).toHaveBeenCalledOnce()
    expect(eventPageMocks.uploadEventBanner).toHaveBeenCalledWith(42, banner)
    expect(await screen.findByText('Evento criado com sucesso.')).toBeInTheDocument()
  })

  it('preserva o evento e direciona à edição quando o banner falha', async () => {
    eventPageMocks.createEvent.mockResolvedValue(event)
    eventPageMocks.uploadEventBanner.mockRejectedValue(new TypeError('offline'))
    const user = userEvent.setup()

    renderCreatePage()
    await fillRequiredCreateFields(user)
    const banner = new File(['image'], 'banner.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Banner do evento'), banner)
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(eventPageMocks.createEvent).toHaveBeenCalledOnce()
    expect(eventPageMocks.uploadEventBanner).toHaveBeenCalledWith(42, banner)
    expect(
      await screen.findByText(/o evento foi criado, mas o banner não foi enviado/i),
    ).toBeInTheDocument()
  })

  it('edita somente campos permitidos e mantém o lote como leitura', async () => {
    eventPageMocks.getEvent.mockResolvedValue(eventResponse())
    eventPageMocks.updateEvent.mockResolvedValue({ ...event, nome: 'Novo nome' })
    const user = userEvent.setup()

    renderEditPage()
    const nameInput = await screen.findByLabelText('Nome')
    expect(screen.getByLabelText('Total de ingressos')).toHaveAttribute('readonly')
    await user.clear(nameInput)
    await user.type(nameInput, 'Novo nome')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(eventPageMocks.updateEvent).toHaveBeenCalledWith(42, {
        nome: 'Novo nome',
      }),
    )
    const sentPayload = eventPageMocks.updateEvent.mock.calls[0][1]
    expect(sentPayload).not.toHaveProperty('total_ingressos')
    expect(sentPayload).not.toHaveProperty('ingressos_disponiveis')
    expect(sentPayload).not.toHaveProperty('organizador_id')
    expect(sentPayload).not.toHaveProperty('ativo')
    expect(sentPayload).not.toHaveProperty('id')
  })
})
