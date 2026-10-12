import type { ApiResponse } from '../types/api'
import type { Event, EventListParams, EventPage } from '../types/events'
import { apiRequest } from './client'

export const EVENTS_PAGE_SIZE = 12

export function listEvents(
  { limit, offset }: EventListParams,
  signal?: AbortSignal,
): Promise<ApiResponse<EventPage>> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  return apiRequest<EventPage>(`/eventos?${searchParams.toString()}`, { signal })
}

export function getEvent(
  eventId: number,
  signal?: AbortSignal,
): Promise<ApiResponse<Event>> {
  return apiRequest<Event>(`/eventos/${eventId}`, { signal })
}
