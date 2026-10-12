export type UserRole = 'user' | 'organizer'

export interface User {
  id: number
  nome: string
  email: string
  papel: UserRole
}

export interface AuthToken {
  access_token: string
  token_type: 'bearer'
}

export interface RegisterPayload {
  nome: string
  email: string
  senha: string
  papel: UserRole
}

export interface LoginPayload {
  email: string
  senha: string
}
