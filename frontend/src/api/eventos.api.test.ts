import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventPage } from '../types/events'
import { getCacheStats } from './cache.api'
import {
  createEvent,
  deactivateEvent,
  EVENT_AUDIT_PAGE_SIZE,
  EVENTS_PAGE_SIZE,
  getEvent,
  listEvents,
  listEventAuditLogs,
  listOrganizerEvents,
  updateEvent,
  uploadEventBanner,
} from './eventos.api'

const fetchMock = vi.fn<typeof fetch>()

const emptyPage: EventPage = {
  items: [],
  limit: EVENTS_PAGE_SIZE,
  offset: EVENTS_PAGE_SIZE,
  total: 0,
}

describe('API da vitrine de eventos', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.ticketz.test')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('envia limit e offset sem alterar a paginação', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(emptyPage), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
        },
        status: 200,
      }),
    )

    const result = await listEvents({ limit: EVENTS_PAGE_SIZE, offset: 12 })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/eventos?limit=12&offset=12',
    )
    expect(result.data).toEqual(emptyPage)
    expect(result.cacheStatus).toBe('MISS')
  })

  it('encaminha cancelamento da consulta ao cliente central', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(emptyPage), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const controller = new AbortController()

    await listEvents(
      { limit: EVENTS_PAGE_SIZE, offset: 0 },
      controller.signal,
    )

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('obtém as métricas públicas do cache Redis', async () => {
    const stats = { hit_rate_percent: 75, hits: 3, misses: 1, total: 4 }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(getCacheStats()).resolves.toEqual(stats)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/cache/stats',
    )
  })

  it('obtém o detalhe e preserva o diagnóstico de cache', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 42, meu_ingresso: null }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
        status: 200,
      }),
    )

    const result = await getEvent(42)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/eventos/42',
    )
    expect(result.cacheStatus).toBe('HIT')
    expect(result.data).toMatchObject({ id: 42, meu_ingresso: null })
  })

  it('lista somente os eventos do organizador com paginação', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(emptyPage), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(
      listOrganizerEvents({ limit: 20, offset: 40 }),
    ).resolves.toEqual(emptyPage)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/eventos/meus?limit=20&offset=40',
    )
  })

  it('cria o evento enviando somente o JSON previsto', async () => {
    const payload = {
      data: '2027-12-01T23:00:00.000Z',
      descricao: 'Descrição',
      local: 'Campus do Pici',
      nome: 'Festival Ticketz',
      total_ingressos: 500,
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...payload, id: 42 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    )

    await createEvent(payload)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ticketz.test/eventos')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(payload))
  })

  it('edita sem enviar os campos proibidos do evento', async () => {
    const payload = {
      data: '2027-12-01T23:00:00.000Z',
      descricao: null,
      local: 'Campus do Pici',
      nome: 'Novo nome',
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...payload, id: 42 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await updateEvent(42, payload)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ticketz.test/eventos/42')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(payload)
  })

  it('envia banner multipart no campo arquivo sem definir Content-Type', async () => {
    const file = new File(['image'], 'banner.webp', { type: 'image/webp' })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await uploadEventBanner(42, file)

    const request = fetchMock.mock.calls[0][1]
    const formData = request?.body as FormData
    const headers = new Headers(request?.headers)
    expect(request?.method).toBe('POST')
    expect(formData.get('arquivo')).toBe(file)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('aceita a resposta 204 da desativação', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(deactivateEvent(42)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.ticketz.test/eventos/42')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('consulta a primeira página de logs sem fabricar cursor', async () => {
    const page = { cursor: 'next-page', items: [] }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(page), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )

    await expect(
      listEventAuditLogs(42, { limit: EVENT_AUDIT_PAGE_SIZE }),
    ).resolves.toEqual(page)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ticketz.test/eventos/42/logs?limit=20',
    )
  })

  it('codifica e envia o cursor devolvido pelo backend na página seguinte', async () => {
    const page = { cursor: null, items: [] }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(page), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const cursor = 'eyJlbnRpZGFkZSI6ICJldmVudG8jNDIifQ=='

    await listEventAuditLogs(42, { cursor, limit: 20 })

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.ticketz.test/eventos/42/logs?limit=20&cursor=${encodeURIComponent(cursor)}`,
    )
  })
})
