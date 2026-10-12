import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarX,
  CloudCog,
  DatabaseZap,
  TicketCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

import { EVENTS_PAGE_SIZE, listEvents } from '../api/eventos.api'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { Pagination } from '../components/common/Pagination'
import { CacheDebug } from '../components/events/CacheDebug'
import { EventGrid } from '../components/events/EventGrid'
import { EventGridSkeleton } from '../components/events/EventGridSkeleton'
import { getUserErrorMessage } from '../utils/errors'
import styles from './HomePage.module.css'

const cloudFeatures = [
  {
    description: 'Respostas HIT e MISS tornam o cache Redis visível na demonstração.',
    icon: DatabaseZap,
    title: 'Catálogo mais rápido',
  },
  {
    description: 'SNS, SQS e o worker processam o ingresso sem prender a sua compra.',
    icon: CloudCog,
    title: 'Processamento assíncrono',
  },
  {
    description: 'Banners e PDFs são entregues pelo S3 usando links temporários.',
    icon: TicketCheck,
    title: 'Arquivos protegidos',
  },
]

export function HomePage() {
  const [currentPage, setCurrentPage] = useState(1)
  const offset = (currentPage - 1) * EVENTS_PAGE_SIZE
  const eventQuery = useQuery({
    queryFn: ({ signal }) =>
      listEvents({ limit: EVENTS_PAGE_SIZE, offset }, signal),
    placeholderData: keepPreviousData,
    queryKey: ['events', 'public', { limit: EVENTS_PAGE_SIZE, offset }],
  })
  const eventPage = eventQuery.data?.data
  const totalPages = eventPage
    ? Math.ceil(eventPage.total / EVENTS_PAGE_SIZE)
    : 0
  const showCacheDebug = import.meta.env.VITE_SHOW_CACHE_DEBUG === 'true'

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Seu próximo evento começa aqui</p>
          <h1>Momentos inesquecíveis, ingressos sem complicação.</h1>
          <p className={styles.lead}>
            Descubra eventos, garanta sua entrada e acompanhe a emissão do ingresso
            digital em um só lugar.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#proximos-eventos">
              Ver eventos
              <ArrowRight aria-hidden="true" size={19} />
            </a>
            <Link className={styles.secondaryAction} to="/cadastro">
              Criar conta
            </Link>
          </div>
        </div>
        <div aria-hidden="true" className={styles.ticketArt}>
          <div className={styles.ticketTop}>
            <span>Ticketz apresenta</span>
            <strong>Festival na nuvem</strong>
          </div>
          <div className={styles.ticketBottom}>
            <span>FORTALEZA</span>
            <span>20:00</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="cloud-title" className={styles.cloudSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Experiência conectada à AWS</p>
          <h2 id="cloud-title">Da descoberta ao PDF do ingresso</h2>
        </div>
        <div className={styles.featureGrid}>
          {cloudFeatures.map(({ description, icon: Icon, title }) => (
            <article className={styles.featureCard} key={title}>
              <span aria-hidden="true" className={styles.featureIcon}>
                <Icon size={24} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="events-title"
        className={styles.eventsSection}
        id="proximos-eventos"
      >
        <div className={styles.eventsHeading}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Vitrine Ticketz</p>
            <h2 id="events-title">Próximos eventos</h2>
          </div>
          {eventPage && eventPage.total > 0 && (
            <p className={styles.resultCount}>
              {eventPage.total} {eventPage.total === 1 ? 'evento encontrado' : 'eventos encontrados'}
            </p>
          )}
        </div>

        {showCacheDebug && !eventQuery.isError && eventQuery.data && (
          <CacheDebug status={eventQuery.data.cacheStatus} />
        )}

        {eventQuery.isPending && <EventGridSkeleton />}

        {eventQuery.isError && (
          <ErrorState
            description={getUserErrorMessage(eventQuery.error)}
            onRetry={() => void eventQuery.refetch()}
            title="Não foi possível carregar os eventos"
          />
        )}

        {!eventQuery.isError && eventPage?.items.length === 0 && (
          <EmptyState
            description="Volte em breve para descobrir novas experiências."
            icon={CalendarX}
            title="Nenhum evento disponível no momento"
          />
        )}

        {!eventQuery.isError && eventPage && eventPage.items.length > 0 && (
          <>
            <EventGrid
              events={eventPage.items}
              isRefreshing={eventQuery.isFetching}
            />
            <Pagination
              currentPage={currentPage}
              disabled={eventQuery.isFetching}
              onPageChange={setCurrentPage}
              totalPages={totalPages}
            />
          </>
        )}
      </section>
    </>
  )
}
