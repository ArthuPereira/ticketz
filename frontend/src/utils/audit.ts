import type { ActionLog } from '../types/audit'
import { formatEventDate } from './date'

const actionLabels: Record<string, string> = {
  CREATE_EVENT: 'Evento criado',
  DELETE_EVENT: 'Evento desativado',
  READ_EVENT: 'Evento consultado',
  UPDATE_EVENT: 'Evento atualizado',
  UPLOAD_BANNER: 'Banner atualizado',
}

const fieldLabels: Record<string, string> = {
  ativo: 'Situação',
  banner_key: 'Arquivo do banner',
  data: 'Data do evento',
  descricao: 'Descrição',
  ingressos_disponiveis: 'Ingressos disponíveis',
  local: 'Local',
  nome: 'Nome',
  organizador_id: 'Organizador',
  total_ingressos: 'Total de ingressos',
}

export interface AuditChange {
  after: string
  before: string
  field: string
  label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Não informado'
  }

  if (field === 'data' && typeof value === 'string') {
    const timestamp = new Date(value).getTime()
    if (Number.isFinite(timestamp)) {
      return formatEventDate(value)
    }
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function getAuditActionLabel(action: string): string {
  return actionLabels[action] ?? action.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')
}

export function getAuditChanges(log: ActionLog): AuditChange[] {
  if (log.acao !== 'UPDATE_EVENT' || !isRecord(log.dados)) {
    return []
  }

  const before = isRecord(log.dados.antes) ? log.dados.antes : {}
  const after = isRecord(log.dados.depois) ? log.dados.depois : {}
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])

  return [...fields]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      after: formatValue(field, after[field]),
      before: formatValue(field, before[field]),
      field,
      label: fieldLabels[field] ?? field,
    }))
}

export function getAuditSummary(log: ActionLog): string {
  const data = log.dados ?? {}

  switch (log.acao) {
    case 'CREATE_EVENT': {
      const name = typeof data.nome === 'string' ? ` “${data.nome}”` : ''
      const location = typeof data.local === 'string' ? ` em ${data.local}` : ''
      const total =
        typeof data.total_ingressos === 'number'
          ? `, com ${data.total_ingressos} ingressos`
          : ''
      return `Evento${name} criado${location}${total}.`
    }
    case 'READ_EVENT':
      return 'Os detalhes do evento foram consultados.'
    case 'UPDATE_EVENT': {
      const changes = getAuditChanges(log)
      if (changes.length === 0) {
        return 'Os dados do evento foram atualizados.'
      }
      return `${changes.length} ${changes.length === 1 ? 'campo foi alterado' : 'campos foram alterados'}.`
    }
    case 'DELETE_EVENT': {
      const name = typeof data.nome === 'string' ? ` “${data.nome}”` : ''
      return `Evento${name} desativado e removido da vitrine.`
    }
    case 'UPLOAD_BANNER':
      return 'A imagem de banner do evento foi atualizada.'
    default:
      return 'Uma ação foi registrada no histórico do evento.'
  }
}
