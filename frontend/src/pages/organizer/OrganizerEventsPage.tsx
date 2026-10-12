import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCog,
  CalendarDays,
  CirclePlus,
  MapPin,
  Pencil,
  ScrollText,
  Ticket,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import {
  deactivateEvent,
  listOrganizerEvents,
  ORGANIZER_EVENTS_PAGE_SIZE,
} from '../../api/eventos.api'
import { eventKeys } from '../../app/queryKeys'
import { Alert } from '../../components/common/Alert'
import { Button } from '../../components/common/Button'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { Pagination } from '../../components/common/Pagination'
import { EventBanner } from '../../components/events/EventBanner'
import type { Event, EventPage } from '../../types/events'
import { formatEventDate } from '../../utils/date'
import { getUserErrorMessage } from '../../utils/errors'
import styles from './OrganizerEventsPage.module.css'

interface OrganizerEventsLocationState {
  successMessage?: string
}

export function OrganizerEventsPage() {
  const location = useLocation()
  const locationState = location.state as OrganizerEventsLocationState | null
  const queryClient = useQueryClient()
  const [currentPage, setCurrentPage] = useState(1)
  const [eventToDeactivate, setEventToDeactivate] = useState<Event | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(
    locationState?.successMessage ?? null,
  )
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const offset = (currentPage - 1) * ORGANIZER_EVENTS_PAGE_SIZE
  const organizerEventsQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listOrganizerEvents(
        { limit: ORGANIZER_EVENTS_PAGE_SIZE, offset },
        signal,
      ),
    queryKey: eventKeys.organizerList(ORGANIZER_EVENTS_PAGE_SIZE, offset),
  })
  const eventPage = organizerEventsQuery.data
  const totalPages = eventPage
    ? Math.ceil(eventPage.total / ORGANIZER_EVENTS_PAGE_SIZE)
    : 0

  const deactivateMutation = useMutation({
    mutationFn: (eventId: number) => deactivateEvent(eventId),
    onError: (error) => {
      setEventToDeactivate(null)
      setDeactivateError(getUserErrorMessage(error))
    },
    onSuccess: async (_, eventId) => {
      const pageHadOneItem = eventPage?.items.length === 1
      queryClient.setQueryData<EventPage>(
        eventKeys.organizerList(ORGANIZER_EVENTS_PAGE_SIZE, offset),
        (current) =>
          current
            ? {
                ...current,
                items: current.items.filter((event) => event.id !== eventId),
                total: Math.max(0, current.total - 1),
              }
            : current,
      )
      setEventToDeactivate(null)
      setDeactivateError(null)
      setSuccessMessage('Evento desativado. Os ingressos já emitidos foram preservados.')
      if (pageHadOneItem && currentPage > 1) {
        setCurrentPage((page) => page - 1)
      }
      await queryClient.invalidateQueries({ queryKey: eventKeys.all })
    },
  })

  return (
    <section aria-labelledby="organizer-events-title" className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Área do organizador</p>
          <h1 id="organizer-events-title">Gerenciar eventos</h1>
          <p className={styles.lead}>
            Crie eventos e acompanhe disponibilidade, banners e atalhos de gestão.
          </p>
        </div>
        <Link className={styles.createLink} to="/organizador/eventos/novo">
          <CirclePlus aria-hidden="true" size={19} />
          Criar evento
        </Link>
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {deactivateError && <Alert variant="error">{deactivateError}</Alert>}

      {organizerEventsQuery.isPending && (
        <LoadingSpinner fullPage label="Carregando seus eventos" />
      )}

      {organizerEventsQuery.isError && (
        <ErrorState
          description={getUserErrorMessage(organizerEventsQuery.error)}
          onRetry={() => void organizerEventsQuery.refetch()}
          title="Não foi possível carregar seus eventos"
        />
      )}

      {!organizerEventsQuery.isError && eventPage?.items.length === 0 && (
        <EmptyState
          description="Crie seu primeiro evento para começar a vender ingressos."
          icon={CalendarCog}
          title="Nenhum evento ativo"
        />
      )}

      {!organizerEventsQuery.isError && eventPage && eventPage.items.length > 0 && (
        <>
          <div
            aria-busy={organizerEventsQuery.isFetching}
            aria-label="Lista dos eventos do organizador"
            className={styles.grid}
          >
            {eventPage.items.map((event) => (
              <article className={styles.card} key={event.id}>
                <div className={styles.bannerWrapper}>
                  <EventBanner
                    className={styles.banner}
                    loading="lazy"
                    name={event.nome}
                    source={event.banner_url}
                  />
                </div>
                <div className={styles.cardContent}>
                  <p className={styles.eventId}>Evento #{event.id}</p>
                  <h2>{event.nome}</h2>
                  <dl className={styles.details}>
                    <div>
                      <dt>
                        <CalendarDays aria-hidden="true" size={17} /> Data
                      </dt>
                      <dd>{formatEventDate(event.data)}</dd>
                    </div>
                    <div>
                      <dt>
                        <MapPin aria-hidden="true" size={17} /> Local
                      </dt>
                      <dd>{event.local}</dd>
                    </div>
                    <div>
                      <dt>
                        <Ticket aria-hidden="true" size={17} /> Disponibilidade
                      </dt>
                      <dd>
                        {event.ingressos_disponiveis} de {event.total_ingressos}
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    <Link to={`/organizador/eventos/${event.id}/editar`}>
                      <Pencil aria-hidden="true" size={17} /> Editar
                    </Link>
                    <Link to={`/organizador/eventos/${event.id}/logs`}>
                      <ScrollText aria-hidden="true" size={17} /> Logs
                    </Link>
                    <Button
                      onClick={() => {
                        setDeactivateError(null)
                        setSuccessMessage(null)
                        setEventToDeactivate(event)
                      }}
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" size={17} /> Desativar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            ariaLabel="Paginação dos eventos do organizador"
            currentPage={currentPage}
            disabled={organizerEventsQuery.isFetching}
            onPageChange={setCurrentPage}
            totalPages={totalPages}
          />
        </>
      )}

      <ConfirmDialog
        confirmLabel="Desativar evento"
        isLoading={deactivateMutation.isPending}
        onCancel={() => setEventToDeactivate(null)}
        onConfirm={() => {
          if (eventToDeactivate) {
            deactivateMutation.mutate(eventToDeactivate.id)
          }
        }}
        open={eventToDeactivate !== null}
        title="Desativar evento"
      >
        <p>
          <strong>{eventToDeactivate?.nome}</strong> sairá da vitrine e não poderá
          receber novas compras.
        </p>
        <p>Os ingressos já emitidos serão preservados.</p>
      </ConfirmDialog>
    </section>
  )
}
