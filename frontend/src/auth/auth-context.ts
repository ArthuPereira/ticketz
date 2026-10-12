import { createContext } from 'react'

import type { User } from '../types/auth'

export interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isOrganizer: boolean
  isRestoring: boolean
  login(email: string, senha: string): Promise<void>
  logout(): void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
