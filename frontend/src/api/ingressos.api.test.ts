import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_TOKEN_KEY } from '../utils/storage'
import {
  getTicket,
  getTicketDownload,
  listTickets,
  purchaseTicket,
  reprocessTicket,
} from './ingressos.api'

const fetchMock = vi.fn<typeof fetch>()

describe('API de ingressos', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.ticketz.test')
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('envia POST autenticado sem corpo e retorna o ingresso PENDING', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-comprador')
    const ticket = {
      criado_em: '2026-10-12T12:00:00Z',
      evento: {
        data: '2026-12-01T23:00:00Z',
        id: 42,
        local: 'Fortaleza',
        nome: 'Festival Ticketz',
      },
      id: 91,
      pronto_em: null,
      status: 'PENDING',
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(ticket), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    )

    await expect(purchaseTicket(42)).resolves.toEqual(ticket)

    const [url, request] = fetchMock.mock.calls[0]
    const headers = new Headers(request?.headers)
    expect(url).toBe('https://api.ticketz.test/eventos/42/ingressos')
    expect(request?.method).toBe('POST')
    expect(request?.body).toBeUndefined()
    expect(headers.get('Authorization')).toBe('Bearer jwt-comprador')
  })

  it('lista os ingressos com limit e offset', async () => {
    const page = { items: [], limit: 10, offset: 20, total: 25 }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(page), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(listTickets({ limit: 10, offset: 20 })).resolves.toEqual(page)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/ingressos?limit=10&offset=20',
    )
  })

  it('consulta o detalhe do ingresso com suporte a cancelamento', async () => {
    const controller = new AbortController()
    const ticket = {
      criado_em: '2026-10-12T12:00:00Z',
      evento: {
        data: '2026-12-01T23:00:00Z',
        id: 42,
        local: 'Fortaleza',
        nome: 'Festival Ticketz',
      },
      id: 91,
      pronto_em: null,
      status: 'PENDING',
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(ticket), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(getTicket(91, controller.signal)).resolves.toEqual(ticket)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/ingressos/91',
    )
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('obtém uma URL temporária de download sem armazená-la', async () => {
    const download = {
      expira_em: 300,
      url: 'https://s3.example.test/ticket.pdf?signature=temporary',
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(download), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(getTicketDownload(91)).resolves.toEqual(download)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/ingressos/91/download',
    )
  })

  it('trata a resposta 202 do reprocessamento como sucesso', async () => {
    const ticket = {
      criado_em: '2026-10-12T12:00:00Z',
      evento: {
        data: '2026-12-01T23:00:00Z',
        id: 42,
        local: 'Fortaleza',
        nome: 'Festival Ticketz',
      },
      id: 91,
      pronto_em: null,
      status: 'PENDING',
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(ticket), {
        headers: { 'Content-Type': 'application/json' },
        status: 202,
      }),
    )

    await expect(reprocessTicket(91)).resolves.toEqual(ticket)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/ingressos/91/reprocessar',
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })
})
