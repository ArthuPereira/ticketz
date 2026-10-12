import { LoaderCircle } from 'lucide-react'
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    isLoading = false,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ')

  return (
    <button
      aria-busy={isLoading || undefined}
      className={classes}
      disabled={disabled || isLoading}
      ref={ref}
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
})
