import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCollectionItems } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'

export interface BookmarkItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
  env?: 'dev' | 'staging' | 'prod'
}

export const useBookmarksApiStore = defineStore('bookmarksApi', () => {
  // State
  const bookmarks = ref<BookmarkItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)

  // Cache composable
  const cache = useApiCache('bookmarks-cache-')

  /**
   * Fetch collection items from API
   */
  const fetchCollectionItems = async (collectionId: string): Promise<BookmarkItem[]> => {
    try {
      const items = await getCollectionItems(collectionId)
      completedApiCalls.value++

      // Filter items with mandatory fields (title, URL, Category)
      const validItems: BookmarkItem[] = items
        .map((item: any) => {
          const properties = item.properties || {}

          // Title comes from item.title, not properties
          let title = item.title || ''
          // Replace "Untitled" with empty string
          if (title.trim().toLowerCase() === 'untitled') {
            title = ''
          }
          // Try different property name variations (case-insensitive)
          const url =
            properties.URL || properties.url || properties['URL'] || properties['url'] || ''
          const category =
            properties.Category ||
            properties.category ||
            properties['Category'] ||
            properties['category'] ||
            ''
          const tags =
            properties.tags || properties.Tags || properties['tags'] || properties['Tags'] || []
          const env =
            properties.env || properties.Env || properties['env'] || properties['Env'] || ''

          // Only include items with mandatory fields (title can be empty, but URL and category are required)
          if (url && category) {
            return {
              id: item.id,
              title: String(title),
              url: String(url),
              category: String(category),
              tags: Array.isArray(tags) ? tags.map((t: any) => String(t)) : [],
              env: env && ['dev', 'staging', 'prod'].includes(String(env).toLowerCase())
                ? (String(env).toLowerCase() as 'dev' | 'staging' | 'prod')
                : undefined,
            }
          }
          return null
        })
        .filter((item: BookmarkItem | null): item is BookmarkItem => item !== null)

      bookmarks.value = validItems
      return validItems
    } catch (err) {
      console.error('Error fetching collection items:', err)
      error.value =
        err instanceof Error ? err.message : 'Failed to fetch bookmarks collection items'
      completedApiCalls.value++
      throw err
    }
  }

  /**
   * Initialize bookmarks data (load items)
   */
  const initializeBookmarks = async (collectionId: string, forceRefresh = false): Promise<void> => {
    if (!collectionId) {
      error.value = 'Bookmarks collection ID not configured'
      return
    }

    isLoading.value = true
    error.value = null
    bookmarks.value = []

    try {
      // Check cache first
      if (!forceRefresh) {
        const cached = cache.getCachedData<BookmarkItem[]>(collectionId)
        if (cached) {
          bookmarks.value = cached
          isLoading.value = false
          return
        }
      } else {
        cache.clearCache(collectionId)
      }

      // Fetch collection items
      totalApiCalls.value = 1
      completedApiCalls.value = 0

      const items = await fetchCollectionItems(collectionId)
      bookmarks.value = items

      // Cache items
      cache.setCachedData(collectionId, items)
    } catch (err) {
      console.error('Failed to initialize bookmarks:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load bookmarks'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh bookmarks data (force fetch from API)
   */
  const refreshBookmarks = async (collectionId: string): Promise<void> => {
    return initializeBookmarks(collectionId, true)
  }

  return {
    // State
    bookmarks: computed(() => bookmarks.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),

    // Methods
    initializeBookmarks,
    refreshBookmarks,
    clearCache: (collectionId: string) => cache.clearCache(collectionId),
    clearAllCache: () => cache.clearAllCache(),
  }
})
