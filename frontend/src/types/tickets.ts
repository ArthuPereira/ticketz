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

export interface TicketPage {
  items: Ticket[]
  total: number
  limit: number
  offset: number
}

export interface TicketListParams {
  limit: number
  offset: number
}

export interface TicketDownload {
  url: string
  expira_em: number
}
