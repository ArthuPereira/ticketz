import type { Ticket } from '../types/tickets'
import { apiRequest } from './client'

export async function purchaseTicket(eventId: number): Promise<Ticket> {
  const response = await apiRequest<Ticket>(`/eventos/${eventId}/ingressos`, {
    method: 'POST',
  })

  return response.data
}
