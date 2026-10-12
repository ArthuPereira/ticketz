import { ApiError } from '../api/client'
import type { ApiFieldErrors, ApiValidationIssue } from '../types/api'

type ErrorContext = 'default' | 'login'

const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação.'
const SERVICE_UNAVAILABLE_MESSAGE = 'O serviço está temporariamente indisponível.'

const errorCodeMessages: Record<string, string> = {
  JA_POSSUI_INGRESSO: 'Você já possui um ingresso para este evento.',
  ESGOTADO: 'Os ingressos deste evento estão esgotados.',
  EVENTO_ENCERRADO: 'Este evento já foi encerrado.',
  INGRESSO_NAO_PRONTO: 'Seu ingresso ainda está sendo preparado.',
  INGRESSO_NAO_FAILED: 'Este ingresso não precisa ser reprocessado.',
}

const statusMessages: Record<number, string> = {
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'O conteúdo solicitado não foi encontrado.',
  413: 'A imagem deve ter no máximo 5 MB.',
  415: 'Escolha uma imagem JPEG, PNG ou WebP válida.',
  500: DEFAULT_ERROR_MESSAGE,
  503: SERVICE_UNAVAILABLE_MESSAGE,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidationIssue(value: unknown): value is ApiValidationIssue {
  return isRecord(value) && Array.isArray(value.loc) && typeof value.msg === 'string'
}

function getDetailMessage(detail: unknown): string | null {
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

  return null
}

export function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null
  }

  return typeof error.detail.codigo === 'string' ? error.detail.codigo : null
}

export function getApiFieldErrors(error: unknown): ApiFieldErrors {
  if (!(error instanceof ApiError) || error.status !== 422 || !Array.isArray(error.detail)) {
    return {}
  }

  return error.detail.reduce<ApiFieldErrors>((fieldErrors, item) => {
    if (!isValidationIssue(item)) {
      return fieldErrors
    }

    const field = [...(item.loc ?? [])]
      .reverse()
      .find((location): location is string => typeof location === 'string' && location !== 'body')

    if (field && !fieldErrors[field]) {
      fieldErrors[field] = item.msg ?? DEFAULT_ERROR_MESSAGE
    }

    return fieldErrors
  }, {})
}

export function getUserErrorMessage(
  error: unknown,
  context: ErrorContext = 'default',
): string {
  if (error instanceof TypeError) {
    return SERVICE_UNAVAILABLE_MESSAGE
  }

  if (!(error instanceof ApiError)) {
    return DEFAULT_ERROR_MESSAGE
  }

  const errorCode = getApiErrorCode(error)
  if (errorCode && errorCodeMessages[errorCode]) {
    return errorCodeMessages[errorCode]
  }

  if (context === 'login' && error.status === 401) {
    return 'Credenciais inválidas.'
  }

  if (statusMessages[error.status]) {
    return statusMessages[error.status]
  }

  if (error.status === 422) {
    const firstFieldMessage = Object.values(getApiFieldErrors(error))[0]
    return firstFieldMessage ?? getDetailMessage(error.detail) ?? DEFAULT_ERROR_MESSAGE
  }

  return getDetailMessage(error.detail) ?? DEFAULT_ERROR_MESSAGE
}
