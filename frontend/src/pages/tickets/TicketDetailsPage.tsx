import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Hourglass,
  MapPin,
  QrCode,
  RefreshCw,
  SearchX,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { ApiError } from '../../api/client'
import {
  getTicket,
  getTicketDownload,
  reprocessTicket,
} from '../../api/ingressos.api'
import { ticketKeys } from '../../app/queryKeys'
import { Alert } from '../../components/common/Alert'
import { Button } from '../../components/common/Button'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { PagePlaceholder } from '../../components/common/PagePlaceholder'
import { TicketStatusBadge } from '../../components/tickets/TicketStatusBadge'
import type { TicketStatus } from '../../types/tickets'
import { formatDateTime, formatEventDate } from '../../utils/date'
import { getUserErrorMessage } from '../../utils/errors'
import styles from './TicketDetailsPage.module.css'

interface TicketDetailsLocationState {
  purchaseSuccess?: boolean
}

export const TICKET_POLLING_INTERVAL_MS = 2_500
export const TICKET_POLLING_TIMEOUT_MS = 120_000

function openTemporaryDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener noreferrer'
  link.target = '_blank'
  document.body.append(link)
  link.click()
  link.remove()
}

export function TicketDetailsPage() {
  const { id } = useParams()
  const ticketId = Number(id)
  const hasValidId = Number.isSafeInteger(ticketId) && ticketId > 0
  const location = useLocation()
  const state = location.state as TicketDetailsLocationState | null
  const queryClient = useQueryClient()
  const [expiredPollingTicketId, setExpiredPollingTicketId] = useState<number | null>(null)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const previousStatus = useRef<TicketStatus | undefined>(undefined)
  const pollingExpired = expiredPollingTicketId === ticketId

  const ticketQuery = useQuery({
    enabled: hasValidId,
    queryFn: ({ signal }) => getTicket(ticketId, signal),
    queryKey: ticketKeys.detail(ticketId),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' && !pollingExpired
        ? TICKET_POLLING_INTERVAL_MS
        : false,
  })
  const ticket = ticketQuery.data

  useEffect(() => {
    if (
      ticket?.status !== 'PENDING' ||
      expiredPollingTicketId === ticket.id
    ) {
      return
    }

    const timeoutId = window.setTimeout(
      () => setExpiredPollingTicketId(ticket.id),
      TICKET_POLLING_TIMEOUT_MS,
    )

    return () => window.clearTimeout(timeoutId)
  }, [expiredPollingTicketId, ticket?.id, ticket?.status])

  useEffect(() => {
    const currentStatus = ticket?.status
    if (
      previousStatus.current === 'PENDING' &&
      currentStatus &&
      currentStatus !== 'PENDING'
    ) {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
    }
    previousStatus.current = currentStatus
  }, [queryClient, ticket?.status])

  const downloadMutation = useMutation({
    mutationFn: () => getTicketDownload(ticketId),
    onSuccess: (download) => openTemporaryDownload(download.url),
  })

  const reprocessMutation = useMutation({
    mutationFn: () => reprocessTicket(ticketId),
    onSuccess: async (updatedTicket) => {
      setExpiredPollingTicketId(null)
      queryClient.setQueryData(ticketKeys.detail(ticketId), updatedTicket)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) }),
        queryClient.invalidateQueries({ queryKey: ticketKeys.lists() }),
      ])
    },
  })

  if (!hasValidId) {
    return (
      <PagePlaceholder
        actions={<Link to="/meus-ingressos">Voltar aos meus ingressos</Link>}
        description="O ingresso solicitado não existe ou não está disponível para a sua conta."
        eyebrow="Ingresso indisponível"
        icon={SearchX}
        title="Não encontramos este ingresso"
      />
    )
  }

  if (ticketQuery.isPending) {
    return <LoadingSpinner fullPage label="Carregando detalhes do ingresso" />
  }

  if (ticketQuery.error instanceof ApiError && ticketQuery.error.status === 404) {
    return (
      <PagePlaceholder
        actions={<Link to="/meus-ingressos">Voltar aos meus ingressos</Link>}
        description="O ingresso solicitado não existe ou não está disponível para a sua conta."
        eyebrow="Ingresso indisponível"
        icon={SearchX}
        title="Não encontramos este ingresso"
      />
    )
  }

  if (ticketQuery.isError && !ticket) {
    return (
      <ErrorState
        description={getUserErrorMessage(ticketQuery.error)}
        onRetry={() => void ticketQuery.refetch()}
        title="Não foi possível carregar o ingresso"
      />
    )
  }

  if (!ticket) {
    return null
  }

  return (
    <article className={styles.page}>
      <Link className={styles.backLink} to="/meus-ingressos">
        <ArrowLeft aria-hidden="true" size={18} />
        Voltar aos meus ingressos
      </Link>

      {state?.purchaseSuccess && (
        <Alert variant="success">
          Compra confirmada! Seu ingresso foi criado e está sendo processado.
        </Alert>
      )}

      {ticketQuery.isError && (
        <Alert variant="error">
          Não foi possível atualizar o ingresso agora. Os últimos dados
          recebidos continuam visíveis.
        </Alert>
      )}

      <div className={styles.ticketHeader}>
        <span aria-hidden="true" className={styles.ticketIcon}>
          <QrCode size={32} />
        </span>
        <div className={styles.titleGroup}>
          <p className={styles.eyebrow}>Ingresso digital #{ticket.id}</p>
          <h1>{ticket.evento.nome}</h1>
        </div>
        <div aria-atomic="true" aria-live="polite" className={styles.status}>
          <TicketStatusBadge status={ticket.status} />
        </div>
      </div>

      <div className={styles.contentGrid}>
        <section aria-labelledby="ticket-information" className={styles.detailsCard}>
          <h2 id="ticket-information">Informações do ingresso</h2>
          <dl className={styles.details}>
            <div>
              <dt>
                <CalendarDays aria-hidden="true" size={19} /> Data e hora
              </dt>
              <dd>{formatEventDate(ticket.evento.data)}</dd>
            </div>
            <div>
              <dt>
                <MapPin aria-hidden="true" size={19} /> Local
              </dt>
              <dd>{ticket.evento.local}</dd>
            </div>
            <div>
              <dt>Compra realizada</dt>
              <dd>{formatDateTime(ticket.criado_em)}</dd>
            </div>
            {ticket.pronto_em && (
              <div>
                <dt>PDF concluído</dt>
                <dd>{formatDateTime(ticket.pronto_em)}</dd>
              </div>
            )}
          </dl>
          <Link className={styles.eventLink} to={`/eventos/${ticket.evento.id}`}>
            Ver página do evento
          </Link>
        </section>

        <aside aria-labelledby="ticket-status-title" className={styles.actionCard}>
          <h2 id="ticket-status-title">Status da emissão</h2>

          {ticket.status === 'PENDING' && (
            <div className={styles.statusContent}>
              <Hourglass aria-hidden="true" className={styles.pendingIcon} size={34} />
              <p>
                Estamos preparando seu ingresso digital. Esta página será atualizada
                automaticamente quando ele estiver pronto.
              </p>
              {pollingExpired && (
                <Alert>
                  A atualização automática foi pausada após dois minutos. Isso
                  não significa que o processamento falhou.
                </Alert>
              )}
              <Button
                isLoading={isManualRefreshing}
                onClick={() => {
                  setIsManualRefreshing(true)
                  void ticketQuery.refetch().finally(() => setIsManualRefreshing(false))
                }}
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={18} />
                Atualizar agora
              </Button>
            </div>
          )}

          {ticket.status === 'READY' && (
            <div className={styles.statusContent}>
              <p>
                Seu ingresso está pronto. Por segurança, cada link de download fica
                disponível por cinco minutos.
              </p>
              {downloadMutation.isError && (
                <Alert variant="error">
                  {getUserErrorMessage(downloadMutation.error)}
                </Alert>
              )}
              <Button
                isLoading={downloadMutation.isPending}
                onClick={() => downloadMutation.mutate()}
              >
                <Download aria-hidden="true" size={18} />
                Baixar PDF
              </Button>
            </div>
          )}

          {ticket.status === 'FAILED' && (
            <div className={styles.statusContent}>
              <p>
                Não foi possível concluir o PDF. Você pode solicitar uma nova
                tentativa de geração.
              </p>
              {reprocessMutation.isError && (
                <Alert variant="error">
                  {getUserErrorMessage(reprocessMutation.error)}
                </Alert>
              )}
              <Button
                isLoading={reprocessMutation.isPending}
                onClick={() => reprocessMutation.mutate()}
              >
                <RefreshCw aria-hidden="true" size={18} />
                Reprocessar ingresso
              </Button>
            </div>
          )}
        </aside>
      </div>
    </article>
  )
}
