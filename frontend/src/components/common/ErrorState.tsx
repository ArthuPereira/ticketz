import { CircleAlert, RotateCcw } from 'lucide-react'

import { Button } from './Button'
import styles from './ErrorState.module.css'

interface ErrorStateProps {
  description: string
  onRetry(): void
  title?: string
}

export function ErrorState({
  description,
  onRetry,
  title = 'Não foi possível carregar',
}: ErrorStateProps) {
  return (
    <div aria-live="assertive" className={styles.state} role="alert">
      <CircleAlert aria-hidden="true" className={styles.icon} size={30} />
      <div className={styles.content}>
        <h3>{title}</h3>
        <p>{description}</p>
        <Button onClick={onRetry} variant="secondary">
          <RotateCcw aria-hidden="true" size={17} />
          Tentar novamente
        </Button>
      </div>
    </div>
  )
}
