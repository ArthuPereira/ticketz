import type { CacheStats } from '../types/cache'
import { apiRequest } from './client'

export async function getCacheStats(signal?: AbortSignal): Promise<CacheStats> {
  const response = await apiRequest<CacheStats>('/cache/stats', { signal })
  return response.data
}
