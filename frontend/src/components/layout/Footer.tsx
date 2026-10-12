import { TicketCheck } from 'lucide-react'

import styles from './Footer.module.css'

const currentYear = new Date().getFullYear()

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <p>© {currentYear} Ticketz</p>
        <p className={styles.tagline}>
          <TicketCheck aria-hidden="true" size={17} />
          Bons momentos começam com o ingresso certo
        </p>
      </div>
    </footer>
  )
}
