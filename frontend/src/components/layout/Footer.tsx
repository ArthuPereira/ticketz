import { Cloud } from 'lucide-react'

import styles from './Footer.module.css'

const currentYear = new Date().getFullYear()

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <p>© {currentYear} Ticketz</p>
        <p className={styles.cloudNote}>
          <Cloud aria-hidden="true" size={17} />
          Projeto demonstrativo com arquitetura AWS
        </p>
      </div>
    </footer>
  )
}
