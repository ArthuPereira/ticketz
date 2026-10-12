import { useQuery } from '@tanstack/react-query'
import { DatabaseZap } from 'lucide-react'

import { getCacheStats } from '../../api/cache.api'
import type { CacheStatus } from '../../types/api'
import styles from './CacheDebug.module.css'

interface CacheDebugProps {
  status: CacheStatus | null
}

const statusContent = {
  HIT: {
    description: 'Resposta entregue pelo cache Redis.',
    label: 'HIT · Redis',
  },
  MISS: {
    description: 'Dados consultados na base e armazenados no Redis.',
    label: 'MISS · Base → Redis',
  },
}

export function CacheDebug({ status }: CacheDebugProps) {
  const statsQuery = useQuery({
    queryFn: ({ signal }) => getCacheStats(signal),
    queryKey: ['cache', 'stats'],
    staleTime: 5_000,
  })
  const content = status ? statusContent[status] : null

  return (
    <aside
      aria-label="Diagnóstico do cache Redis"
      className={`${styles.panel} ${status ? styles[status.toLowerCase()] : styles.unavailable}`}
    >
      <DatabaseZap aria-hidden="true" className={styles.icon} size={22} />
      <div className={styles.content}>
        <span className={styles.eyebrow}>Demonstração AWS</span>
        <strong>{content?.label ?? 'X-Cache indisponível'}</strong>
        <p>
          {content?.description ??
            'A resposta não expôs o cabeçalho de cache para o navegador.'}
        </p>
        {statsQuery.isPending && <small>Carregando métricas acumuladas…</small>}
        {statsQuery.isError && <small>Métricas acumuladas indisponíveis.</small>}
        {statsQuery.data && (
          <small>
            Acumulado: {statsQuery.data.hits}{' '}
            {statsQuery.data.hits === 1 ? 'acerto' : 'acertos'},{' '}
            {statsQuery.data.misses}{' '}
            {statsQuery.data.misses === 1 ? 'falha' : 'falhas'} ·{' '}
            {statsQuery.data.hit_rate_percent.toLocaleString('pt-BR')}% de acerto
          </small>
        )}
      </div>
    </aside>
  )
}
