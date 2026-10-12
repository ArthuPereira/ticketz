import type {
  AuthToken,
  LoginPayload,
  RegisterPayload,
  User,
} from '../types/auth'
import { apiRequest } from './client'

export async function registerUser(
  payload: RegisterPayload,
  signal?: AbortSignal,
): Promise<User> {
  const response = await apiRequest<User, RegisterPayload>('/auth/register', {
    body: payload,
    method: 'POST',
    signal,
  })

  return response.data
}

export async function loginUser(
  payload: LoginPayload,
  signal?: AbortSignal,
): Promise<AuthToken> {
  const response = await apiRequest<AuthToken, LoginPayload>('/auth/login', {
    body: payload,
    method: 'POST',
    signal,
  })

  return response.data
}

export async function getCurrentUser(signal?: AbortSignal): Promise<User> {
  const response = await apiRequest<User>('/auth/me', { signal })
  return response.data
}
