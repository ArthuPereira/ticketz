export type TicketStatus = 'PENDING' | 'READY' | 'FAILED'

export interface MyTicketSummary {
  id: number
  status: TicketStatus
}
