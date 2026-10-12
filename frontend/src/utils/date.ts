const eventDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
})

export function formatEventDate(date: string): string {
  return eventDateFormatter.format(new Date(date))
}
