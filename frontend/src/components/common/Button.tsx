import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({
  children,
  className,
  disabled,
  isLoading = false,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? (
        <>
          <LoaderCircle aria-hidden="true" className={styles.spinner} size={18} />
          <span>Carregando</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
