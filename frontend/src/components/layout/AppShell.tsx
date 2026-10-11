import { Outlet } from 'react-router-dom'

import { Footer } from './Footer'
import { Header } from './Header'
import styles from './AppShell.module.css'

export function AppShell() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Pular para o conteúdo
      </a>
      <Header />
      <main className={styles.main} id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
