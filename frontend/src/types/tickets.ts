export type TicketStatus = 'PENDING' | 'READY' | 'FAILED'

export interface MyTicketSummary {
  id: number
  status: TicketStatus
}

export interface TicketEventSummary {
  id: number
  nome: string
  data: string
  local: string
}

export interface Ticket {
  id: number
  status: TicketStatus
  criado_em: string
  pronto_em: string | null
  evento: TicketEventSummary
}
