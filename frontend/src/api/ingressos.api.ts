import type {
  Ticket,
  TicketDownload,
  TicketListParams,
  TicketPage,
} from '../types/tickets'
import { apiRequest } from './client'

export const TICKETS_PAGE_SIZE = 10

export async function purchaseTicket(eventId: number): Promise<Ticket> {
  const response = await apiRequest<Ticket>(`/eventos/${eventId}/ingressos`, {
    method: 'POST',
  })

  return response.data
}

export async function listTickets(
  { limit, offset }: TicketListParams,
  signal?: AbortSignal,
): Promise<TicketPage> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  const response = await apiRequest<TicketPage>(
    `/ingressos?${searchParams.toString()}`,
    { signal },
  )

  return response.data
}

export async function getTicket(
  ticketId: number,
  signal?: AbortSignal,
): Promise<Ticket> {
  const response = await apiRequest<Ticket>(`/ingressos/${ticketId}`, { signal })

  return response.data
}

export async function getTicketDownload(
  ticketId: number,
): Promise<TicketDownload> {
  const response = await apiRequest<TicketDownload>(
    `/ingressos/${ticketId}/download`,
  )

  return response.data
}

export async function reprocessTicket(ticketId: number): Promise<Ticket> {
  const response = await apiRequest<Ticket>(
    `/ingressos/${ticketId}/reprocessar`,
    { method: 'POST' },
  )

  return response.data
}
