export type CacheStatus = 'HIT' | 'MISS'

export interface ApiResponse<T> {
  data: T
  status: number
  cacheStatus: CacheStatus | null
}

export interface ApiErrorData {
  status: number
  detail: unknown
}

export interface ApiValidationIssue {
  loc?: Array<number | string>
  msg?: string
  type?: string
}

export type ApiFieldErrors = Record<string, string>
