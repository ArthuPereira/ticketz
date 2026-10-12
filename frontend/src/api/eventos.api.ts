import type { ApiResponse } from '../types/api'
import type {
  ActionLogListParams,
  ActionLogPage,
} from '../types/audit'
import type {
  Event,
  EventCreatePayload,
  EventListParams,
  EventPage,
  EventUpdatePayload,
} from '../types/events'
import { apiRequest } from './client'

export const EVENTS_PAGE_SIZE = 12
export const ORGANIZER_EVENTS_PAGE_SIZE = 20
export const EVENT_AUDIT_PAGE_SIZE = 20

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

export async function listOrganizerEvents(
  { limit, offset }: EventListParams,
  signal?: AbortSignal,
): Promise<EventPage> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  const response = await apiRequest<EventPage>(
    `/eventos/meus?${searchParams.toString()}`,
    { signal },
  )

  return response.data
}

export async function createEvent(payload: EventCreatePayload): Promise<Event> {
  const response = await apiRequest<Event, EventCreatePayload>('/eventos', {
    body: payload,
    method: 'POST',
  })

  return response.data
}

export async function updateEvent(
  eventId: number,
  payload: EventUpdatePayload,
): Promise<Event> {
  const response = await apiRequest<Event, EventUpdatePayload>(
    `/eventos/${eventId}`,
    { body: payload, method: 'PUT' },
  )

  return response.data
}

export async function uploadEventBanner(
  eventId: number,
  file: File,
): Promise<Event> {
  const formData = new FormData()
  formData.append('arquivo', file)
  const response = await apiRequest<Event>(`/eventos/${eventId}/banner`, {
    body: formData,
    method: 'POST',
  })

  return response.data
}

export async function deactivateEvent(eventId: number): Promise<void> {
  await apiRequest(`/eventos/${eventId}`, { method: 'DELETE' })
}

export async function listEventAuditLogs(
  eventId: number,
  { cursor, limit }: ActionLogListParams,
  signal?: AbortSignal,
): Promise<ActionLogPage> {
  const searchParams = new URLSearchParams({ limit: String(limit) })
  if (cursor) {
    searchParams.set('cursor', cursor)
  }
  const response = await apiRequest<ActionLogPage>(
    `/eventos/${eventId}/logs?${searchParams.toString()}`,
    { signal },
  )

  return response.data
}
