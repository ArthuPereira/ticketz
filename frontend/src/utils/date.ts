const eventDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
})

export function formatEventDate(date: string): string {
  return eventDateFormatter.format(new Date(date))
}

export function formatDateTime(date: string): string {
  return dateTimeFormatter.format(new Date(date))
}
