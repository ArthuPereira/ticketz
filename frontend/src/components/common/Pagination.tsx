import { ChevronLeft, ChevronRight } from 'lucide-react'

import styles from './Pagination.module.css'

interface PaginationProps {
  ariaLabel?: string
  currentPage: number
  disabled?: boolean
  onPageChange(page: number): void
  totalPages: number
}

export function Pagination({
  ariaLabel = 'Paginação dos eventos',
  currentPage,
  disabled = false,
  onPageChange,
  totalPages,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <nav aria-label={ariaLabel} className={styles.pagination}>
      <button
        aria-label="Ir para a página anterior"
        className={styles.button}
        disabled={disabled || currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={18} />
        <span>Anterior</span>
      </button>

      <span aria-live="polite" className={styles.position}>
        Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
      </span>

      <button
        aria-label="Ir para a próxima página"
        className={styles.button}
        disabled={disabled || currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        type="button"
      >
        <span>Próxima</span>
        <ChevronRight aria-hidden="true" size={18} />
      </button>
    </nav>
  )
}
