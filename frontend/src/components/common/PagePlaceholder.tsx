import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './PagePlaceholder.module.css'

interface PagePlaceholderProps {
  actions?: ReactNode
  description: string
  eyebrow: string
  icon: LucideIcon
  title: string
}

export function PagePlaceholder({
  actions,
  description,
  eyebrow,
  icon: Icon,
  title,
}: PagePlaceholderProps) {
  return (
    <section className={styles.section}>
      <div aria-hidden="true" className={styles.iconWrapper}>
        <Icon size={30} strokeWidth={1.8} />
      </div>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className={styles.description}>{description}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  )
}
