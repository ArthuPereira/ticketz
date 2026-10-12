import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

import type { ActionLogPage } from '../../src/types/audit'
import type { Event, EventPage } from '../../src/types/events'
import type { Ticket } from '../../src/types/tickets'

const API_ORIGIN = 'http://localhost:8000'
const APP_ORIGIN = 'http://127.0.0.1:4173'

const regularUser = {
  email: 'ana@example.com',
  id: 7,
  nome: 'Ana Silva',
  papel: 'user' as const,
}

const organizer = {
  email: 'organizador@example.com',
  id: 3,
  nome: 'Organizador Ticketz',
  papel: 'organizer' as const,
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    ativo: true,
    atualizado_em: '2026-10-12T13:00:00Z',
    banner_key: null,
    banner_url: null,
    criado_em: '2026-10-12T12:00:00Z',
    data: '2099-12-01T23:00:00Z',
    descricao: 'Um evento completo para validar a jornada do Ticketz.',
    id: 42,
    ingressos_disponiveis: 100,
    local: 'Campus do Pici',
    meu_ingresso: null,
    nome: 'Festival Ticketz',
    organizador_id: organizer.id,
    total_ingressos: 100,
    ...overrides,
  }
}

function makeTicket(status: Ticket['status']): Ticket {
  return {
    criado_em: '2026-10-12T14:00:00Z',
    evento: {
      data: '2099-12-01T23:00:00Z',
      id: 42,
      local: 'Campus do Pici',
      nome: 'Festival Ticketz',
    },
    id: 91,
    pronto_em: status === 'READY' ? '2026-10-12T14:01:00Z' : null,
    status,
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Expose-Headers': 'X-Cache',
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: corsHeaders(),
    status,
  })
}

async function handlePreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({ headers: corsHeaders(), status: 204 })
  return true
}

function eventPage(items: Event[], total = items.length, offset = 0): EventPage {
  return { items, limit: 12, offset, total }
}

async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-segura')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(
    page.getByText(email === organizer.email ? organizer.nome : regularUser.nome),
  ).toBeVisible()
}

let browserErrors: string[] = []

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource:')
    ) {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
})

test.afterEach(() => {
  expect(browserErrors, 'erros inesperados no console do navegador').toEqual([])
})

test('visitante pagina a vitrine, abre o evento e é direcionado ao login', async ({
  page,
}) => {
  const firstEvent = makeEvent({ id: 1, nome: 'Evento da primeira página' })
  const secondEvent = makeEvent({ id: 13, nome: 'Evento da segunda página' })
  const unexpectedRequests: string[] = []

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    if (await handlePreflight(route)) return
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname === '/eventos') {
      const offset = Number(url.searchParams.get('offset'))
      await fulfillJson(
        route,
        eventPage(offset === 12 ? [secondEvent] : [firstEvent], 13, offset),
      )
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos/13') {
      await fulfillJson(route, secondEvent)
      return
    }

    unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    await fulfillJson(route, { detail: 'Requisição não simulada' }, 500)
  })

  await page.goto('/')
  await expect(page.getByText('Evento da primeira página')).toBeVisible()
  await page
    .getByRole('button', { name: 'Ir para a próxima página' })
    .click()
  await expect(page.getByText('Evento da segunda página')).toBeVisible()
  await page
    .getByRole('link', { name: 'Ver detalhes de Evento da segunda página' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Evento da segunda página' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Entrar para comprar' }).click()

  await expect(page).toHaveURL('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre e acompanhe seus ingressos' }),
  ).toBeVisible()
  expect(unexpectedRequests).toEqual([])
})

test('usuário se cadastra, compra, acompanha o processamento e baixa o PDF', async ({
  context,
  page,
}) => {
  const event = makeEvent()
  let purchaseAttempts = 0
  let ticketReads = 0
  let downloadRequests = 0
  const unexpectedRequests: string[] = []

  await context.route('https://s3.ticketz.test/**', async (route) => {
    await route.fulfill({
      body: '%PDF-1.4\n% Ticketz E2E\n',
      contentType: 'application/pdf',
      status: 200,
    })
  })

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    if (await handlePreflight(route)) return
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'POST' && url.pathname === '/auth/register') {
      await fulfillJson(route, regularUser, 201)
      return
    }

    if (request.method() === 'POST' && url.pathname === '/auth/login') {
      await fulfillJson(route, { access_token: 'user-token', token_type: 'bearer' })
      return
    }

    if (request.method() === 'GET' && url.pathname === '/auth/me') {
      await fulfillJson(route, regularUser)
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos') {
      await fulfillJson(route, eventPage([event]))
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos/42') {
      await fulfillJson(route, event)
      return
    }

    if (
      request.method() === 'POST' &&
      url.pathname === '/eventos/42/ingressos'
    ) {
      purchaseAttempts += 1
      if (purchaseAttempts === 1) {
        await fulfillJson(route, makeTicket('PENDING'), 201)
      } else {
        await fulfillJson(
          route,
          {
            detail: {
              codigo: 'JA_POSSUI_INGRESSO',
              mensagem: 'Ingresso já existente',
            },
          },
          409,
        )
      }
      return
    }

    if (request.method() === 'GET' && url.pathname === '/ingressos/91') {
      ticketReads += 1
      await fulfillJson(route, makeTicket(ticketReads >= 2 ? 'READY' : 'PENDING'))
      return
    }

    if (
      request.method() === 'GET' &&
      url.pathname === '/ingressos/91/download'
    ) {
      downloadRequests += 1
      await fulfillJson(route, {
        expira_em: 300,
        url: 'https://s3.ticketz.test/ingresso-91.pdf?signature=temporaria',
      })
      return
    }

    unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    await fulfillJson(route, { detail: 'Requisição não simulada' }, 500)
  })

  await page.goto('/cadastro')
  await page.getByLabel('Nome').fill(regularUser.nome)
  await page.getByLabel('E-mail').fill(regularUser.email)
  await page.getByLabel('Senha').fill('senha-segura')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByText('Conta criada. Agora entre com seus dados.')).toBeVisible()

  await page.getByLabel('E-mail').fill(regularUser.email)
  await page.getByLabel('Senha').fill('senha-segura')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL('/')

  await page.getByRole('link', { name: 'Ver detalhes de Festival Ticketz' }).click()
  await page.getByRole('button', { name: 'Comprar ingresso' }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar ingresso' })
    .getByRole('button', { name: 'Confirmar compra' })
    .click()

  await expect(page.getByText('Gerando ingresso')).toBeVisible()
  await expect(page.getByText('Pronto para baixar')).toBeVisible({ timeout: 8_000 })

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Baixar PDF' }).click()
  const popup = await popupPromise
  await popup.close()
  expect(downloadRequests).toBe(1)

  await page.getByRole('link', { name: 'Ver página do evento' }).click()
  await page.getByRole('button', { name: 'Comprar ingresso' }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar ingresso' })
    .getByRole('button', { name: 'Confirmar compra' })
    .click()
  await expect(
    page.getByText('Você já possui um ingresso para este evento.'),
  ).toBeVisible()

  expect(purchaseAttempts).toBe(2)
  expect(unexpectedRequests).toEqual([])
})

test('organizador cria, envia banner, edita, consulta logs e desativa o evento', async ({
  page,
}) => {
  let managedEvent = makeEvent()
  let activeEvents: Event[] = []
  let bannerWasMultipart = false
  let updatePayload: Record<string, unknown> | null = null
  const unexpectedRequests: string[] = []

  const auditPage: ActionLogPage = {
    cursor: null,
    items: [
      {
        acao: 'UPDATE_EVENT',
        dados: {
          antes: { local: 'Campus do Pici', nome: 'Festival Ticketz' },
          depois: { local: 'Centro de Eventos', nome: 'Festival Atualizado' },
        },
        entidade: 'evento#42',
        sk: '2026-10-12T15:00:00Z#update',
        timestamp: '2026-10-12T15:00:00Z',
        usuario_id: organizer.id,
      },
      {
        acao: 'CREATE_EVENT',
        dados: {
          local: 'Campus do Pici',
          nome: 'Festival Ticketz',
          total_ingressos: 100,
        },
        entidade: 'evento#42',
        sk: '2026-10-12T14:00:00Z#create',
        timestamp: '2026-10-12T14:00:00Z',
        usuario_id: organizer.id,
      },
    ],
  }

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    if (await handlePreflight(route)) return
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'POST' && url.pathname === '/auth/login') {
      await fulfillJson(route, {
        access_token: 'organizer-token',
        token_type: 'bearer',
      })
      return
    }

    if (request.method() === 'GET' && url.pathname === '/auth/me') {
      await fulfillJson(route, organizer)
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos') {
      await fulfillJson(route, eventPage(activeEvents.filter((event) => event.ativo)))
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos/meus') {
      await fulfillJson(route, {
        items: activeEvents,
        limit: 20,
        offset: 0,
        total: activeEvents.length,
      })
      return
    }

    if (request.method() === 'POST' && url.pathname === '/eventos') {
      const payload = request.postDataJSON() as Record<string, unknown>
      managedEvent = makeEvent({
        data: String(payload.data),
        descricao: payload.descricao as string | null,
        local: String(payload.local),
        nome: String(payload.nome),
        total_ingressos: Number(payload.total_ingressos),
        ingressos_disponiveis: Number(payload.total_ingressos),
      })
      activeEvents = [managedEvent]
      await fulfillJson(route, managedEvent, 201)
      return
    }

    if (
      request.method() === 'POST' &&
      url.pathname === '/eventos/42/banner'
    ) {
      bannerWasMultipart =
        request.headers()['content-type']?.startsWith('multipart/form-data; boundary=') ===
          true && request.postData()?.includes('banner.png') === true
      managedEvent = {
        ...managedEvent,
        banner_key: 'eventos/42/banner.png',
        banner_url: 'https://s3.ticketz.test/banner.png?signature=temporaria',
      }
      activeEvents = [managedEvent]
      await fulfillJson(route, managedEvent)
      return
    }

    if (
      request.method() === 'GET' &&
      url.pathname === '/eventos/42/logs'
    ) {
      await fulfillJson(route, auditPage)
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos/42') {
      await fulfillJson(route, managedEvent)
      return
    }

    if (request.method() === 'PUT' && url.pathname === '/eventos/42') {
      updatePayload = request.postDataJSON() as Record<string, unknown>
      managedEvent = { ...managedEvent, ...updatePayload }
      activeEvents = [managedEvent]
      await fulfillJson(route, managedEvent)
      return
    }

    if (request.method() === 'DELETE' && url.pathname === '/eventos/42') {
      activeEvents = []
      await route.fulfill({ headers: corsHeaders(), status: 204 })
      return
    }

    unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    await fulfillJson(route, { detail: 'Requisição não simulada' }, 500)
  })

  await signIn(page, organizer.email)
  await page.getByRole('link', { name: 'Organizar' }).click()
  await page.getByRole('link', { name: 'Criar evento' }).click()
  await page.getByLabel('Nome').fill('Festival Ticketz')
  await page.getByLabel('Descrição').fill('Evento criado pelo cenário E2E.')
  await page.getByLabel('Local').fill('Campus do Pici')
  await page.getByLabel('Data e hora').fill('2099-12-01T20:00')
  await page.getByLabel('Total de ingressos').fill('100')
  await page.getByLabel('Banner do evento').setInputFiles({
    buffer: Buffer.from('imagem-de-teste'),
    mimeType: 'image/png',
    name: 'banner.png',
  })
  await page.getByRole('button', { name: 'Criar evento' }).click()

  await expect(page.getByText('Evento criado com sucesso.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Festival Ticketz' })).toBeVisible()
  expect(bannerWasMultipart).toBe(true)

  await page.getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Nome').fill('Festival Atualizado')
  await page.getByLabel('Local').fill('Centro de Eventos')
  await page.getByLabel('Data e hora').fill('2099-12-02T21:30')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Evento atualizado com sucesso.')).toBeVisible()

  expect(updatePayload).toMatchObject({
    local: 'Centro de Eventos',
    nome: 'Festival Atualizado',
  })
  expect(updatePayload).not.toHaveProperty('total_ingressos')
  expect(updatePayload).not.toHaveProperty('ingressos_disponiveis')
  expect(updatePayload).not.toHaveProperty('organizador_id')
  expect(updatePayload).not.toHaveProperty('ativo')

  await page.getByRole('link', { name: 'Organizar' }).click()
  await page.getByRole('link', { name: 'Logs' }).click()
  await expect(page.getByRole('heading', { name: 'Evento atualizado' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evento criado' })).toBeVisible()
  await expect(page.getByText('Nome', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Organizar' }).click()
  await page.getByRole('button', { name: 'Desativar' }).click()
  await page
    .getByRole('dialog', { name: 'Desativar evento' })
    .getByRole('button', { name: 'Desativar evento' })
    .click()
  await expect(
    page.getByText('Evento desativado. Os ingressos já emitidos foram preservados.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Festival Atualizado' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Eventos' }).click()
  await expect(page.getByText('Nenhum evento disponível no momento')).toBeVisible()
  expect(unexpectedRequests).toEqual([])
})

test('autorização protege painel, evento alheio e ingresso alheio', async ({
  page,
}) => {
  const foreignEvent = makeEvent({
    nome: 'Evento confidencial',
    organizador_id: 999,
  })
  const unexpectedRequests: string[] = []

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    if (await handlePreflight(route)) return
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'POST' && url.pathname === '/auth/login') {
      const payload = request.postDataJSON() as { email: string }
      await fulfillJson(route, {
        access_token:
          payload.email === organizer.email ? 'organizer-token' : 'user-token',
        token_type: 'bearer',
      })
      return
    }

    if (request.method() === 'GET' && url.pathname === '/auth/me') {
      const authorization = request.headers().authorization ?? ''
      await fulfillJson(
        route,
        authorization.includes('organizer-token') ? organizer : regularUser,
      )
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos') {
      await fulfillJson(route, eventPage([]))
      return
    }

    if (request.method() === 'GET' && url.pathname === '/eventos/42') {
      await fulfillJson(route, foreignEvent)
      return
    }

    if (request.method() === 'GET' && url.pathname === '/ingressos/999') {
      await fulfillJson(route, { detail: 'Ingresso não encontrado' }, 404)
      return
    }

    unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    await fulfillJson(route, { detail: 'Requisição não simulada' }, 500)
  })

  await signIn(page, regularUser.email)
  await page.goto('/organizador/eventos')
  await expect(
    page.getByText('Esta área é exclusiva para organizadores'),
  ).toBeVisible()

  await page
    .getByRole('button', { name: `Sair da conta de ${regularUser.nome}` })
    .click()
  await signIn(page, organizer.email)
  await page.goto('/organizador/eventos/42/editar')
  await expect(page.getByText('Este evento não pertence à sua conta')).toBeVisible()
  await expect(page.getByText('Evento confidencial')).toHaveCount(0)

  await page
    .getByRole('button', { name: `Sair da conta de ${organizer.nome}` })
    .click()
  await signIn(page, regularUser.email)
  await page.goto('/meus-ingressos/999')
  await expect(page.getByText('Não encontramos este ingresso')).toBeVisible()
  await expect(
    page.getByText(
      'O ingresso solicitado não existe ou não está disponível para a sua conta.',
    ),
  ).toBeVisible()

  expect(unexpectedRequests).toEqual([])
})
