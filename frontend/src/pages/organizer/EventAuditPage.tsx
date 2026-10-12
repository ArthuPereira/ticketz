import { useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import {
  Activity,
  ArrowLeft,
  CirclePlus,
  Eye,
  ImageUp,
  Pencil,
  ScrollText,
  SearchX,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  EVENT_AUDIT_PAGE_SIZE,
  listEventAuditLogs,
} from '../../api/eventos.api'
import { eventKeys } from '../../app/queryKeys'
import { Alert } from '../../components/common/Alert'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { PagePlaceholder } from '../../components/common/PagePlaceholder'
import type { ActionLog, ActionLogPage } from '../../types/audit'
import {
  getAuditActionLabel,
  getAuditChanges,
  getAuditSummary,
} from '../../utils/audit'
import { formatDateTime } from '../../utils/date'
import { getUserErrorMessage } from '../../utils/errors'
import styles from './EventAuditPage.module.css'

const actionIcons = {
  CREATE_EVENT: CirclePlus,
  DELETE_EVENT: Trash2,
  READ_EVENT: Eye,
  UPDATE_EVENT: Pencil,
  UPLOAD_BANNER: ImageUp,
}

function getActionIcon(action: string) {
  return actionIcons[action as keyof typeof actionIcons] ?? Activity
}

function getUniqueLogs(pages: { items: ActionLog[] }[] | undefined): ActionLog[] {
  const seen = new Set<string>()
  return (pages ?? []).flatMap((page) =>
    page.items.filter((log) => {
      const key = `${log.entidade}:${log.sk}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  )
}

export function EventAuditPage() {
  const { id } = useParams()
  const eventId = Number(id)
  const hasValidId = Number.isSafeInteger(eventId) && eventId > 0
  const auditQuery = useInfiniteQuery<
    ActionLogPage,
    Error,
    InfiniteData<ActionLogPage>,
    ReturnType<typeof eventKeys.audit>,
    string | null
  >({
    enabled: hasValidId,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listEventAuditLogs(
        eventId,
        { cursor: pageParam, limit: EVENT_AUDIT_PAGE_SIZE },
        signal,
      ),
    queryKey: eventKeys.audit(eventId),
  })
  const logs = getUniqueLogs(auditQuery.data?.pages)

  if (!hasValidId) {
    return (
      <PagePlaceholder
        actions={<Link to="/organizador/eventos">Voltar ao painel</Link>}
        description="O evento solicitado não foi encontrado."
        eyebrow="Auditoria indisponível"
        icon={SearchX}
        title="Não encontramos este evento"
      />
    )
  }

  if (auditQuery.isPending) {
    return <LoadingSpinner fullPage label="Carregando histórico do evento" />
  }

  if (auditQuery.isError && !auditQuery.data) {
    return (
      <ErrorState
        description={getUserErrorMessage(auditQuery.error)}
        onRetry={() => void auditQuery.refetch()}
        title="Não foi possível carregar o histórico"
      />
    )
  }

  return (
    <section aria-labelledby="audit-title" className={styles.page}>
      <Link className={styles.backLink} to={`/organizador/eventos/${eventId}/editar`}>
        <ArrowLeft aria-hidden="true" size={18} />
        Voltar ao evento
      </Link>

      <div className={styles.heading}>
        <span aria-hidden="true" className={styles.headingIcon}>
          <ScrollText size={28} />
        </span>
        <div>
          <p>Auditoria</p>
          <h1 id="audit-title">Histórico do evento #{eventId}</h1>
          <span>Ações registradas no DynamoDB, da mais recente para a mais antiga.</span>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          description="As alterações feitas neste evento aparecerão aqui."
          icon={ScrollText}
          title="Nenhum registro de auditoria"
        />
      ) : (
        <ol aria-label="Linha do tempo de auditoria" className={styles.timeline}>
          {logs.map((log) => {
            const Icon = getActionIcon(log.acao)
            const changes = getAuditChanges(log)

            return (
              <li className={styles.timelineItem} key={`${log.entidade}:${log.sk}`}>
                <span aria-hidden="true" className={styles.actionIcon}>
                  <Icon size={20} />
                </span>
                <article className={styles.logCard}>
                  <div className={styles.logHeading}>
                    <div>
                      <h2>{getAuditActionLabel(log.acao)}</h2>
                      <p>{getAuditSummary(log)}</p>
                    </div>
                    <time dateTime={log.timestamp}>{formatDateTime(log.timestamp)}</time>
                  </div>

                  <div className={styles.metadata}>
                    {log.usuario_id !== null && (
                      <span>
                        <UserRound aria-hidden="true" size={16} /> Usuário #{log.usuario_id}
                      </span>
                    )}
                    <span>{log.entidade}</span>
                  </div>

                  {changes.length > 0 && (
                    <dl className={styles.changes}>
                      {changes.map((change) => (
                        <div key={change.field}>
                          <dt>{change.label}</dt>
                          <dd>
                            <span>{change.before}</span>
                            <span aria-hidden="true">→</span>
                            <strong>{change.after}</strong>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {log.dados && (
                    <details className={styles.technicalDetails}>
                      <summary>Ver dados técnicos</summary>
                      <pre>{JSON.stringify(log.dados, null, 2)}</pre>
                    </details>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      )}

      {auditQuery.isFetchNextPageError && (
        <Alert variant="error">
          Não foi possível carregar os registros mais antigos. Tente novamente.
        </Alert>
      )}

      {auditQuery.hasNextPage && (
        <div className={styles.loadMore}>
          <Button
            isLoading={auditQuery.isFetchingNextPage}
            onClick={() => void auditQuery.fetchNextPage()}
            variant="secondary"
          >
            Carregar mais
          </Button>
        </div>
      )}
    </section>
  )
}
