import type { MyTicketSummary } from './tickets'

export interface Event {
  id: number
  organizador_id: number
  nome: string
  descricao: string | null
  local: string
  data: string
  total_ingressos: number
  ingressos_disponiveis: number
  banner_key: string | null
  banner_url: string | null
  meu_ingresso: MyTicketSummary | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface EventPage {
  items: Event[]
  total: number
  limit: number
  offset: number
}

export interface EventListParams {
  limit: number
  offset: number
}

export interface EventCreatePayload {
  nome: string
  descricao: string | null
  local: string
  data: string
  total_ingressos: number
}

export interface EventUpdatePayload {
  nome?: string
  descricao?: string | null
  local?: string
  data?: string
}
