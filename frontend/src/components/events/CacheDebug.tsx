import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'

import { getCacheStats } from '../../api/cache.api'
import type { CacheStatus } from '../../types/api'
import styles from './CacheDebug.module.css'

interface CacheDebugProps {
  status: CacheStatus | null
}

const statusContent = {
  HIT: {
    description: 'Resposta reutilizada para acelerar o carregamento.',
    label: 'HIT · resposta rápida',
  },
  MISS: {
    description: 'Dados atualizados e preparados para os próximos acessos.',
    label: 'MISS · dados atualizados',
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
      aria-label="Diagnóstico de desempenho"
      className={`${styles.panel} ${status ? styles[status.toLowerCase()] : styles.unavailable}`}
    >
      <Gauge aria-hidden="true" className={styles.icon} size={22} />
      <div className={styles.content}>
        <span className={styles.eyebrow}>Desempenho do catálogo</span>
        <strong>{content?.label ?? 'Status indisponível'}</strong>
        <p>
          {content?.description ??
            'Não foi possível consultar o desempenho deste carregamento.'}
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
