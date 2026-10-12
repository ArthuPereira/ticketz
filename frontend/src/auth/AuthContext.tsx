import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { getCurrentUser, loginUser } from '../api/auth.api'
import { queryClient } from '../app/queryClient'
import type { User } from '../types/auth'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../utils/storage'
import { AuthContext } from './auth-context'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const [user, setUser] = useState<User | null>(null)
  const [isRestoring, setIsRestoring] = useState(() => token !== null)

  const clearSession = useCallback(() => {
    clearAuthToken()
    setToken(null)
    setUser(null)
    setIsRestoring(false)
    queryClient.clear()
  }, [])

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, clearSession)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, clearSession)
    }
  }, [clearSession])

  useEffect(() => {
    if (!token || user) {
      return
    }

    const controller = new AbortController()

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser(controller.signal)
        setUser(currentUser)
      } catch {
        if (!controller.signal.aborted) {
          clearSession()
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRestoring(false)
        }
      }
    }

    void restoreSession()
    return () => controller.abort()
  }, [clearSession, token, user])

  const login = useCallback(async (email: string, senha: string) => {
    const authToken = await loginUser({ email, senha })
    setAuthToken(authToken.access_token)

    try {
      const currentUser = await getCurrentUser()
      setToken(authToken.access_token)
      setUser(currentUser)
      setIsRestoring(false)
    } catch (error) {
      clearAuthToken()
      setToken(null)
      setUser(null)
      throw error
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: token !== null && user !== null,
      isOrganizer: user?.papel === 'organizer',
      isRestoring,
      login,
      logout: clearSession,
    }),
    [clearSession, isRestoring, login, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
