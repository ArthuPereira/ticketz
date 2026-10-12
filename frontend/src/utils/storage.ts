export const AUTH_TOKEN_KEY = 'ticketz:access-token'
export const AUTH_SESSION_EXPIRED_EVENT = 'ticketz:session-expired'

export function getAuthToken(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  return sessionStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
}

export function expireAuthSession(): void {
  clearAuthToken()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))
  }
}
