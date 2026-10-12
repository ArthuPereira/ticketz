import { LoaderCircle } from 'lucide-react'

import styles from './LoadingSpinner.module.css'

interface LoadingSpinnerProps {
  fullPage?: boolean
  label?: string
}

export function LoadingSpinner({
  fullPage = false,
  label = 'Carregando',
}: LoadingSpinnerProps) {
  return (
    <div
      aria-live="polite"
      aria-label={label}
      className={fullPage ? styles.fullPage : styles.inline}
      role="status"
    >
      <LoaderCircle aria-hidden="true" className={styles.icon} />
      <span>{label}</span>
    </div>
  )
}
