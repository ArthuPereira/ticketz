import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { TicketCheck, TicketX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

import { listTickets, TICKETS_PAGE_SIZE } from '../api/ingressos.api'
import { ticketKeys } from '../app/queryKeys'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { Pagination } from '../components/common/Pagination'
import { TicketCard } from '../components/tickets/TicketCard'
import { getUserErrorMessage } from '../utils/errors'
import styles from './MyTicketsPage.module.css'

export function MyTicketsPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const offset = (currentPage - 1) * TICKETS_PAGE_SIZE
  const ticketsQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listTickets({ limit: TICKETS_PAGE_SIZE, offset }, signal),
    queryKey: ticketKeys.list(TICKETS_PAGE_SIZE, offset),
  })
  const ticketPage = ticketsQuery.data
  const totalPages = ticketPage
    ? Math.ceil(ticketPage.total / TICKETS_PAGE_SIZE)
    : 0

  return (
    <section aria-labelledby="my-tickets-title" className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Sua carteira</p>
          <h1 id="my-tickets-title">Meus ingressos</h1>
          <p className={styles.lead}>
            Acompanhe a geração e acesse o PDF seguro de cada ingresso.
          </p>
        </div>
        <Link className={styles.eventsLink} to="/">
          <TicketCheck aria-hidden="true" size={18} />
          Encontrar eventos
        </Link>
      </div>

      {ticketsQuery.isPending && (
        <LoadingSpinner fullPage label="Carregando seus ingressos" />
      )}

      {ticketsQuery.isError && (
        <ErrorState
          description={getUserErrorMessage(ticketsQuery.error)}
          onRetry={() => void ticketsQuery.refetch()}
          title="Não foi possível carregar seus ingressos"
        />
      )}

      {!ticketsQuery.isError && ticketPage?.items.length === 0 && (
        <EmptyState
          description="Quando você garantir uma entrada, ela aparecerá aqui."
          icon={TicketX}
          title="Você ainda não possui ingressos"
        />
      )}

      {!ticketsQuery.isError && ticketPage && ticketPage.items.length > 0 && (
        <>
          <div
            aria-busy={ticketsQuery.isFetching}
            aria-label="Lista dos seus ingressos"
            className={styles.grid}
          >
            {ticketPage.items.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
          <Pagination
            ariaLabel="Paginação dos ingressos"
            currentPage={currentPage}
            disabled={ticketsQuery.isFetching}
            onPageChange={setCurrentPage}
            totalPages={totalPages}
          />
        </>
      )}
    </section>
  )
}
