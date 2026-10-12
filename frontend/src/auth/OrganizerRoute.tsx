import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ForbiddenPage } from '../pages/ForbiddenPage'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { useAuth } from '../hooks/useAuth'

export function OrganizerRoute() {
  const { isAuthenticated, isOrganizer, isRestoring } = useAuth()
  const location = useLocation()

  if (isRestoring) {
    return <LoadingSpinner label="Verificando suas permissões" />
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  if (!isOrganizer) {
    return <ForbiddenPage />
  }

  return <Outlet />
}
