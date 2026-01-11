import { getCacheExpiryMs } from '../utils/craftApi'

interface CachedData<T> {
  data: T
  timestamp: number
}

/**
 * Generic composable for managing API cache with localStorage
 * Provides reusable cache methods for all API stores
 *
 * @param cachePrefix - Prefix for cache keys (e.g., 'tags-cache-', 'rss-cache-')
 * @returns Object with cache management methods
 */
export function useApiCache(cachePrefix: string) {
  /**
   * Generate cache key from identifier
   */
  const getCacheKey = (identifier: string): string => {
    return `${cachePrefix}${identifier}`
  }

  /**
   * Get cached data if valid (not expired)
   */
  const getCachedData = <T>(identifier: string): T | null => {
    try {
      const cacheKey = getCacheKey(identifier)
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached) as CachedData<T>
      const now = Date.now()
      const cacheExpiryMs = getCacheExpiryMs()

      // Check if cache is still valid
      if (cacheExpiryMs > 0 && now - timestamp < cacheExpiryMs) {
        return data
      }

      // Cache expired, remove it
      localStorage.removeItem(cacheKey)
      return null
    } catch (err) {
      console.error('Error reading cache:', err)
      return null
    }
  }

  /**
   * Save data to cache with timestamp
   */
  const setCachedData = <T>(identifier: string, data: T): void => {
    try {
      const cacheKey = getCacheKey(identifier)
      const cacheData: CachedData<T> = {
        data,
        timestamp: Date.now(),
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    } catch (err) {
      console.error('Error saving cache:', err)
    }
  }

  /**
   * Clear cache for specific identifier
   */
  const clearCache = (identifier: string): void => {
    try {
      const cacheKey = getCacheKey(identifier)
      localStorage.removeItem(cacheKey)
    } catch (err) {
      console.error('Error clearing cache:', err)
    }
  }

  /**
   * Clear all cache entries with the given prefix
   */
  const clearAllCache = (): void => {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach((key) => {
        if (key.startsWith(cachePrefix)) {
          localStorage.removeItem(key)
        }
      })
    } catch (err) {
      console.error('Error clearing all cache:', err)
    }
  }

  return {
    getCacheKey,
    getCachedData,
    setCachedData,
    clearCache,
    clearAllCache,
  }
}
