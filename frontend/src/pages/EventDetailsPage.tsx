import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  SearchX,
  Ticket,
  TicketCheck,
  TicketX,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { getEvent } from '../api/eventos.api'
import { purchaseTicket } from '../api/ingressos.api'
import { eventKeys, ticketKeys } from '../app/queryKeys'
import { Alert } from '../components/common/Alert'
import { Button } from '../components/common/Button'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { PagePlaceholder } from '../components/common/PagePlaceholder'
import { CacheDebug } from '../components/events/CacheDebug'
import {
  EVENT_BANNER_PLACEHOLDER,
  EventBanner,
} from '../components/events/EventBanner'
import { TicketStatusBadge } from '../components/tickets/TicketStatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatEventDate } from '../utils/date'
import { getUserErrorMessage } from '../utils/errors'
import styles from './EventDetailsPage.module.css'

export function EventDetailsPage() {
  const { id } = useParams()
  const eventId = Number(id)
  const hasValidId = Number.isSafeInteger(eventId) && eventId > 0
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isConfirming, setIsConfirming] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const eventQuery = useQuery({
    enabled: hasValidId,
    queryFn: ({ signal }) => getEvent(eventId, signal),
    queryKey: eventKeys.detail(eventId),
  })
  const event = eventQuery.data?.data
  const showCacheDebug = import.meta.env.VITE_SHOW_CACHE_DEBUG === 'true'

  const purchaseMutation = useMutation({
    mutationFn: () => purchaseTicket(eventId),
    onError: (error) => {
      setIsConfirming(false)
      setPurchaseError(getUserErrorMessage(error))
    },
    onSuccess: async (ticket) => {
      queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventKeys.all }),
        queryClient.invalidateQueries({ queryKey: ticketKeys.lists() }),
      ])
      navigate(`/meus-ingressos/${ticket.id}`, {
        replace: true,
        state: { purchaseSuccess: true, status: ticket.status },
      })
    },
  })

  if (!hasValidId) {
    return (
      <PagePlaceholder
        actions={<Link to="/">Voltar para eventos</Link>}
        description="O conteúdo solicitado não foi encontrado."
        eyebrow="Evento inválido"
        icon={SearchX}
        title="Não encontramos este evento"
      />
    )
  }

  if (eventQuery.isPending) {
    return <LoadingSpinner fullPage label="Carregando detalhes do evento" />
  }

  if (eventQuery.isError) {
    return (
      <ErrorState
        description={getUserErrorMessage(eventQuery.error)}
        onRetry={() => void eventQuery.refetch()}
        title="Não foi possível carregar o evento"
      />
    )
  }

  if (!event) {
    return null
  }

  const soldOut = event.ingressos_disponiveis === 0

  return (
    <article className={styles.page}>
      <Link className={styles.backLink} to="/">
        <ArrowLeft aria-hidden="true" size={18} />
        Voltar para eventos
      </Link>

      {showCacheDebug && <CacheDebug status={eventQuery.data.cacheStatus} />}

      <div className={styles.hero}>
        <div className={styles.bannerWrapper}>
          <EventBanner
            className={styles.banner}
            key={event.banner_url ?? EVENT_BANNER_PLACEHOLDER}
            name={event.nome}
            source={event.banner_url}
          />
        </div>

        <div className={styles.summary}>
          <p className={styles.eyebrow}>Detalhes do evento</p>
          <h1>{event.nome}</h1>
          <dl className={styles.primaryDetails}>
            <div>
              <dt>
                <CalendarDays aria-hidden="true" size={20} /> Data e hora
              </dt>
              <dd>{formatEventDate(event.data)}</dd>
            </div>
            <div>
              <dt>
                <MapPin aria-hidden="true" size={20} /> Local
              </dt>
              <dd>{event.local}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <section
          aria-labelledby="event-description"
          className={styles.descriptionCard}
        >
          <h2 id="event-description">Sobre o evento</h2>
          <p>{event.descricao || 'O organizador não adicionou uma descrição.'}</p>
        </section>

        <aside aria-labelledby="ticket-action-title" className={styles.purchaseCard}>
          <h2 id="ticket-action-title">Ingressos</h2>
          <dl className={styles.stockDetails}>
            <div>
              <dt>
                <Users aria-hidden="true" size={18} /> Lote total
              </dt>
              <dd>{event.total_ingressos}</dd>
            </div>
            <div>
              <dt>
                <Ticket aria-hidden="true" size={18} /> Disponíveis
              </dt>
              <dd>{event.ingressos_disponiveis}</dd>
            </div>
          </dl>

          <div
            className={`${styles.stockStatus} ${soldOut ? styles.soldOut : styles.available}`}
          >
            {soldOut ? (
              <TicketX aria-hidden="true" size={19} />
            ) : (
              <TicketCheck aria-hidden="true" size={19} />
            )}
            {soldOut ? 'Ingressos esgotados' : 'Ingressos disponíveis'}
          </div>

          {purchaseError && <Alert variant="error">{purchaseError}</Alert>}

          {event.meu_ingresso && (
            <div className={styles.existingTicket}>
              <p>Você já possui um ingresso para este evento.</p>
              <TicketStatusBadge status={event.meu_ingresso.status} />
            </div>
          )}

          <div className={styles.action}>
            {event.meu_ingresso ? (
              <Link
                className={styles.primaryLink}
                to={`/meus-ingressos/${event.meu_ingresso.id}`}
              >
                Ver meu ingresso
              </Link>
            ) : soldOut ? (
              <Button disabled>
                <TicketX aria-hidden="true" size={18} />
                Esgotado
              </Button>
            ) : !isAuthenticated ? (
              <Link
                className={styles.primaryLink}
                state={{ from: location }}
                to="/login"
              >
                Entrar para comprar
              </Link>
            ) : (
              <Button
                isLoading={purchaseMutation.isPending}
                onClick={() => {
                  setPurchaseError(null)
                  setIsConfirming(true)
                }}
              >
                <Ticket aria-hidden="true" size={18} />
                Comprar ingresso
              </Button>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        confirmLabel="Confirmar compra"
        isLoading={purchaseMutation.isPending}
        onCancel={() => setIsConfirming(false)}
        onConfirm={() => purchaseMutation.mutate()}
        open={isConfirming}
        title="Confirmar ingresso"
      >
        <p>
          Você está garantindo um ingresso para <strong>{event.nome}</strong>, em{' '}
          {formatEventDate(event.data)}.
        </p>
        <p>Cada pessoa pode possuir apenas um ingresso para este evento.</p>
      </ConfirmDialog>
    </article>
  )
}
