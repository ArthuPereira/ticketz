import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Footer } from './Footer'
import { Header } from './Header'
import styles from './AppShell.module.css'

export function AppShell() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)

  useEffect(() => {
    if (previousPath.current === location.pathname) {
      return
    }

    previousPath.current = location.pathname
    mainRef.current?.focus()
  }, [location.pathname])

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Pular para o conteúdo
      </a>
      <Header />
      <main className={styles.main} id="main-content" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
