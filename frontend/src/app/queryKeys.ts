export const eventKeys = {
  all: ['events'] as const,
  detail: (eventId: number) => ['events', 'detail', eventId] as const,
  publicList: (limit: number, offset: number) =>
    ['events', 'public', { limit, offset }] as const,
}

export const ticketKeys = {
  all: ['tickets'] as const,
  detail: (ticketId: number) => ['tickets', 'detail', ticketId] as const,
  lists: () => ['tickets', 'list'] as const,
  list: (limit: number, offset: number) =>
    ['tickets', 'list', { limit, offset }] as const,
}
