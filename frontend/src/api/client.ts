import type { ApiErrorData, ApiResponse, CacheStatus } from '../types/api'
import { expireAuthSession, getAuthToken } from '../utils/storage'

export interface ApiRequestOptions<TBody = unknown> {
  body?: FormData | TBody | null
  headers?: HeadersInit
  method?: string
  signal?: AbortSignal
}

export class ApiError extends Error implements ApiErrorData {
  readonly detail: unknown
  readonly status: number

  constructor(status: number, detail: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function getApiBaseUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL?.trim()

  if (!apiUrl || apiUrl === '/') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }
    return ''
  }

  return apiUrl.replace(/\/+$/, '')
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${normalizedPath}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorDetail(body: unknown, statusText: string): unknown {
  if (isRecord(body) && 'detail' in body) {
    return body.detail
  }

  return body ?? statusText
}

function getErrorMessage(detail: unknown, statusText: string): string {
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (
    isRecord(detail) &&
    typeof detail.mensagem === 'string' &&
    detail.mensagem.trim()
  ) {
    return detail.mensagem
  }

  return statusText || 'Erro na comunicação com a API'
}

function getCacheStatus(response: Response): CacheStatus | null {
  const header = response.headers.get('X-Cache')?.toUpperCase()
  return header === 'HIT' || header === 'MISS' ? header : null
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }

  const rawBody = await response.text()
  if (!rawBody) {
    return undefined
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody) as unknown
    } catch {
      return rawBody
    }
  }

  return rawBody
}

export async function apiRequest<TResponse = void, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<ApiResponse<TResponse>> {
  const { body, headers: customHeaders, method = 'GET', signal } = options
  const headers = new Headers(customHeaders)
  const token = getAuthToken()
  const isFormData = body instanceof FormData

  headers.set('Accept', 'application/json')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (isFormData) {
    headers.delete('Content-Type')
  } else if (body !== undefined && body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const requestBody =
    body === undefined || body === null
      ? undefined
      : isFormData
        ? body
        : JSON.stringify(body)

  const response = await fetch(buildApiUrl(path), {
    body: requestBody,
    headers,
    method,
    signal,
  })
  const responseBody = await parseResponseBody(response)

  if (!response.ok) {
    const detail = getErrorDetail(responseBody, response.statusText)

    if (response.status === 401 && path !== '/auth/login') {
      expireAuthSession()
    }

    throw new ApiError(
      response.status,
      detail,
      getErrorMessage(detail, response.statusText),
    )
  }

  return {
    data: responseBody as TResponse,
    status: response.status,
    cacheStatus: getCacheStatus(response),
  }
}
