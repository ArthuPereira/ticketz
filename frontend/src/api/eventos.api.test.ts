import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventPage } from '../types/events'
import { getCacheStats } from './cache.api'
import { EVENTS_PAGE_SIZE, getEvent, listEvents } from './eventos.api'

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
})
