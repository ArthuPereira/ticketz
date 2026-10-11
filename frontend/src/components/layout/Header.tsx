import { Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Navigation } from './Navigation'
import styles from './Header.module.css'

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.content}>
        <Link aria-label="Ticketz — página inicial" className={styles.brand} to="/">
          <span aria-hidden="true" className={styles.brandIcon}>
            <Ticket size={25} strokeWidth={2.2} />
          </span>
          <span>Ticketz</span>
        </Link>
        <Navigation />
      </div>
    </header>
  )
}
