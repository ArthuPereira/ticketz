import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_TOKEN_KEY,
} from '../utils/storage'
import { ApiError, apiRequest } from './client'

const fetchMock = vi.fn<typeof fetch>()

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.ticketz.test/')
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('combina a URL da API e adiciona o token automaticamente', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-de-teste')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await apiRequest<{ id: number }>('/eventos/1')

    const [url, request] = fetchMock.mock.calls[0]
    const headers = new Headers(request?.headers)
    expect(url).toBe('https://api.ticketz.test/eventos/1')
    expect(headers.get('Authorization')).toBe('Bearer jwt-de-teste')
  })

  it('serializa objetos como JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    )

    await apiRequest('/eventos', {
      body: { nome: 'Festival Ticketz' },
      method: 'POST',
    })

    const [, request] = fetchMock.mock.calls[0]
    const headers = new Headers(request?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(request?.body).toBe(JSON.stringify({ nome: 'Festival Ticketz' }))
  })

  it('não define Content-Type manualmente para FormData', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const formData = new FormData()
    formData.append('arquivo', new File(['banner'], 'banner.png'))

    await apiRequest('/eventos/1/banner', {
      body: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
      method: 'POST',
    })

    const [, request] = fetchMock.mock.calls[0]
    const headers = new Headers(request?.headers)
    expect(headers.has('Content-Type')).toBe(false)
    expect(request?.body).toBe(formData)
  })

  it('trata 204 sem tentar analisar o corpo', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const result = await apiRequest<void>('/eventos/1', { method: 'DELETE' })

    expect(result.data).toBeUndefined()
    expect(result.status).toBe(204)
  })

  it.each([
    ['texto', 'Evento não encontrado'],
    ['objeto', { codigo: 'ESGOTADO', mensagem: 'Ingressos esgotados' }],
  ])('preserva detail como %s em erros da API', async (_kind, detail) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail }), {
        headers: { 'Content-Type': 'application/json' },
        status: 409,
        statusText: 'Conflict',
      }),
    )

    const promise = apiRequest('/eventos/1/ingressos', { method: 'POST' })

    await expect(promise).rejects.toMatchObject({
      detail,
      status: 409,
    })
    await expect(promise).rejects.toBeInstanceOf(ApiError)
  })

  it('captura o indicador X-Cache quando exposto pelo backend', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
        status: 200,
      }),
    )

    const result = await apiRequest<{ items: unknown[] }>('/eventos')

    expect(result.cacheStatus).toBe('HIT')
  })

  it('encaminha o sinal de cancelamento para fetch', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const controller = new AbortController()

    await apiRequest('/eventos/1', { signal: controller.signal })

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('encerra a sessão quando uma rota autenticada retorna 401', async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'jwt-expirado')
    const sessionExpiredHandler = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredHandler, {
      once: true,
    })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Token expirado' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
        statusText: 'Unauthorized',
      }),
    )

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 401 })

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(sessionExpiredHandler).toHaveBeenCalledOnce()
  })

  it('preserva o tratamento específico do formulário quando o login retorna 401', async () => {
    const sessionExpiredHandler = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredHandler, {
      once: true,
    })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Credenciais inválidas' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
        statusText: 'Unauthorized',
      }),
    )

    await expect(
      apiRequest('/auth/login', {
        body: { email: 'ana@example.com', senha: 'incorreta' },
        method: 'POST',
      }),
    ).rejects.toMatchObject({ status: 401 })

    expect(sessionExpiredHandler).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredHandler)
  })
})
