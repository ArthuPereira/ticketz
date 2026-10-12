import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_TOKEN_KEY } from '../utils/storage'
import { purchaseTicket } from './ingressos.api'

const fetchMock = vi.fn<typeof fetch>()

describe('API de compra de ingresso', () => {
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
})
