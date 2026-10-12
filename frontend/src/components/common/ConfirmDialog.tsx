import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import { Button } from './Button'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  children: ReactNode
  confirmLabel: string
  isLoading?: boolean
  onCancel(): void
  onConfirm(): void
  open: boolean
  title: string
}

export function ConfirmDialog({
  children,
  confirmLabel,
  isLoading = false,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const descriptionId = useId()
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelButtonRef.current?.focus()
    return () => previouslyFocused?.focus()
  }, [open])

  if (!open) {
    return null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !isLoading) {
      onCancel()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
      event.preventDefault()
      confirmButtonRef.current?.focus()
    } else if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
      event.preventDefault()
      cancelButtonRef.current?.focus()
    }
  }

  return (
    <div
      className={styles.backdrop}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isLoading) {
          onCancel()
        }
      }}
    >
      <div
        aria-busy={isLoading || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        <div className={styles.description} id={descriptionId}>
          {children}
        </div>
        <div className={styles.actions}>
          <Button
            disabled={isLoading}
            onClick={onCancel}
            ref={cancelButtonRef}
            variant="ghost"
          >
            Cancelar
          </Button>
          <Button
            isLoading={isLoading}
            onClick={onConfirm}
            ref={confirmButtonRef}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
