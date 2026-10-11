import { NavLink } from 'react-router-dom'

import styles from './Navigation.module.css'

function getLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${styles.link} ${styles.active}` : styles.link
}

export function Navigation() {
  return (
    <nav aria-label="Navegação principal" className={styles.navigation}>
      <ul className={styles.list}>
        <li>
          <NavLink className={getLinkClass} end to="/">
            Eventos
          </NavLink>
        </li>
        <li>
          <NavLink className={getLinkClass} to="/meus-ingressos">
            Meus ingressos
          </NavLink>
        </li>
        <li>
          <NavLink className={getLinkClass} to="/organizador/eventos">
            Organizar
          </NavLink>
        </li>
        <li>
          <NavLink className={`${styles.link} ${styles.login}`} to="/login">
            Entrar
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
