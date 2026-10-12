import type { LucideIcon } from 'lucide-react'

import styles from './EmptyState.module.css'

interface EmptyStateProps {
  description: string
  icon: LucideIcon
  title: string
}

export function EmptyState({ description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      <span aria-hidden="true" className={styles.icon}>
        <Icon size={28} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}
