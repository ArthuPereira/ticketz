import { Skeleton } from '../common/Skeleton'
import gridStyles from './EventGrid.module.css'
import styles from './EventGridSkeleton.module.css'

export function EventGridSkeleton() {
  return (
    <div aria-label="Carregando eventos" aria-live="polite" role="status">
      <div className={gridStyles.grid}>
        {Array.from({ length: 6 }, (_, index) => (
          <div className={styles.card} key={index}>
            <Skeleton className={styles.image} />
            <div className={styles.content}>
              <Skeleton className={styles.title} />
              <Skeleton className={styles.line} />
              <Skeleton className={styles.lineShort} />
              <Skeleton className={styles.action} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
