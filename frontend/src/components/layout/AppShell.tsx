import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { LoadingSpinner } from '../common/LoadingSpinner'
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
        <Suspense fallback={<LoadingSpinner fullPage label="Carregando página" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
