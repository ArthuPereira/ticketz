import { LogOut } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import styles from './Navigation.module.css'

function getLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${styles.link} ${styles.active}` : styles.link
}

export function Navigation() {
  const { isAuthenticated, isOrganizer, isRestoring, logout, user } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <nav aria-label="Navegação principal" className={styles.navigation}>
      <ul className={styles.list}>
        <li>
          <NavLink className={getLinkClass} end to="/">
            Eventos
          </NavLink>
        </li>
        {!isRestoring && isAuthenticated && (
          <>
            <li>
              <NavLink className={getLinkClass} to="/meus-ingressos">
                Meus ingressos
              </NavLink>
            </li>
            {isOrganizer && (
              <li>
                <NavLink className={getLinkClass} to="/organizador/eventos">
                  Organizar
                </NavLink>
              </li>
            )}
            <li className={styles.account}>
              <span className={styles.userName} title={user?.nome}>
                {user?.nome}
              </span>
              <button
                aria-label={`Sair da conta${user?.nome ? ` de ${user.nome}` : ''}`}
                className={styles.logout}
                onClick={handleLogout}
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
                Sair
              </button>
            </li>
          </>
        )}
        {!isRestoring && !isAuthenticated && (
          <>
            <li>
              <NavLink className={getLinkClass} to="/cadastro">
                Cadastro
              </NavLink>
            </li>
            <li>
              <NavLink className={`${styles.link} ${styles.login}`} to="/login">
                Entrar
              </NavLink>
            </li>
          </>
        )}
        {isRestoring && (
          <li>
            <span aria-live="polite" className={styles.restoring}>
              Verificando sessão…
            </span>
          </li>
        )}
      </ul>
    </nav>
  )
}
