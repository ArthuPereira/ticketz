import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { TicketStatus } from '../../types/tickets'
import { TicketStatusBadge } from './TicketStatusBadge'

describe('TicketStatusBadge', () => {
  it.each<[TicketStatus, string]>([
    ['PENDING', 'Gerando ingresso'],
    ['READY', 'Pronto para baixar'],
    ['FAILED', 'Falha na geração'],
  ])('representa %s com texto e ícone', (status, label) => {
    const { container } = render(<TicketStatusBadge status={status} />)

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
