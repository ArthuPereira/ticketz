import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './Alert.module.css'

interface AlertProps {
  children: ReactNode
  variant?: 'error' | 'info' | 'success'
}

const icons = {
  error: CircleAlert,
  info: Info,
  success: CircleCheck,
}

export function Alert({ children, variant = 'info' }: AlertProps) {
  const Icon = icons[variant]

  return (
    <div
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`${styles.alert} ${styles[variant]}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" size={20} />
      <div>{children}</div>
    </div>
  )
}
