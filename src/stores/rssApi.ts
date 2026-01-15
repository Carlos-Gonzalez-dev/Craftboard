import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCollectionItems } from '../utils/craftApi'
import { fetchRSSFeed, type RSSFeed } from '../utils/rssParser'
import { useApiCache } from '../composables/useApiCache'

export interface RSSCollectionItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
}

export const useRSSApiStore = defineStore('rssApi', () => {
  // State
  const rssItems = ref<RSSCollectionItem[]>([])
  const rssFeeds = ref<Record<string, RSSFeed>>({})
  const loadingFeeds = ref<Set<string>>(new Set())
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)
  const currentCollectionId = ref<string | null>(null)

  // Cache composable
  const cache = useApiCache('rss-cache-')

  /**
   * Fetch collection items from API
   */
  const fetchCollectionItems = async (collectionId: string): Promise<RSSCollectionItem[]> => {
    try {
      const items = await getCollectionItems(collectionId)
      completedApiCalls.value++

      // Filter items with mandatory fields (title, URL, Category)
      const validItems: RSSCollectionItem[] = []
      for (const item of items) {
        const properties = item.properties || {}

        // Title comes from item.title, not properties
        let title = item.title || ''
        // Replace "Untitled" with empty string
        if (title.trim().toLowerCase() === 'untitled') {
          title = ''
        }
        // Try different property name variations (case-insensitive)
        const url = properties.URL || properties.url || properties['URL'] || properties['url'] || ''
        const category =
          properties.Category ||
          properties.category ||
          properties['Category'] ||
          properties['category'] ||
          ''
        const tags =
          properties.tags || properties.Tags || properties['tags'] || properties['Tags'] || []

        // Only include items with mandatory fields (title can be empty, but URL and category are required)
        if (url && category) {
          validItems.push({
            id: item.id,
            title: String(title),
            url: String(url),
            category: String(category),
            tags: Array.isArray(tags) ? tags.map((t: any) => String(t)) : [],
          })
        }
      }

      rssItems.value = validItems
      return validItems
    } catch (err) {
      console.error('Error fetching collection items:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch RSS collection items'
      completedApiCalls.value++
      throw err
    }
  }

  /**
   * Save feeds to cache
   */
  const saveFeedsToCache = () => {
    if (currentCollectionId.value) {
      cache.setCachedData(currentCollectionId.value, {
        items: rssItems.value,
        feeds: rssFeeds.value,
      })
    }
  }

  /**
   * Fetch a single RSS feed
   */
  const fetchFeedForItem = async (item: RSSCollectionItem, forceRefresh = false): Promise<void> => {
    // Skip if already loading (unless forcing refresh)
    if (!forceRefresh && (rssFeeds.value[item.id] || loadingFeeds.value.has(item.id))) {
      return
    }

    // Clear existing feed if forcing refresh
    if (forceRefresh) {
      delete rssFeeds.value[item.id]
    }

    loadingFeeds.value.add(item.id)

    try {
      const feed = await fetchRSSFeed(item.url)

      if (feed) {
        rssFeeds.value[item.id] = feed
        // Update cache with new feed
        saveFeedsToCache()
      } else {
        console.warn(`Failed to fetch or parse feed for ${item.title}`)
      }
    } catch (err) {
      console.error(`Error fetching RSS feed for ${item.title}:`, err)
    } finally {
      loadingFeeds.value.delete(item.id)
    }
  }

  /**
   * Fetch all feeds for current items
   */
  const fetchAllFeeds = async (): Promise<void> => {
    const feedPromises = rssItems.value.map((item) => fetchFeedForItem(item))
    await Promise.all(feedPromises)
  }

  /**
   * Initialize RSS data (load items and feeds)
   */
  const initializeRSS = async (collectionId: string, forceRefresh = false): Promise<void> => {
    if (!collectionId) {
      error.value = 'RSS collection ID not configured'
      return
    }

    currentCollectionId.value = collectionId
    isLoading.value = true
    error.value = null

    try {
      // Check cache first
      if (!forceRefresh) {
        const cached = cache.getCachedData<{
          items: RSSCollectionItem[]
          feeds: Record<string, RSSFeed>
        }>(collectionId)
        if (cached && Array.isArray(cached.items)) {
          rssItems.value = cached.items
          rssFeeds.value = cached.feeds || {}
          isLoading.value = false
          // Don't fetch feeds again - use cached data
          return
        }
      } else {
        cache.clearCache(collectionId)
      }

      // Don't clear rssItems/rssFeeds here - keep existing data while reloading

      // Fetch collection items
      totalApiCalls.value = 1
      completedApiCalls.value = 0

      const items = await fetchCollectionItems(collectionId)
      rssItems.value = items

      // Cache items (feeds will be cached as they are fetched)
      saveFeedsToCache()

      // Fetch RSS feeds
      await fetchAllFeeds()
    } catch (err) {
      console.error('Failed to initialize RSS:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load RSS feeds'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh RSS data (force fetch from API)
   */
  const refreshRSS = async (collectionId: string): Promise<void> => {
    return initializeRSS(collectionId, true)
  }

  /**
   * Refresh a single feed
   */
  const refreshFeed = async (item: RSSCollectionItem): Promise<void> => {
    await fetchFeedForItem(item, true)
  }

  return {
    // State
    rssItems: computed(() => rssItems.value),
    rssFeeds: computed(() => rssFeeds.value),
    loadingFeeds: computed(() => loadingFeeds.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),

    // Methods
    initializeRSS,
    refreshRSS,
    refreshFeed,
    fetchAllFeeds,
    fetchFeedForItem,
    clearCache: (collectionId: string) => cache.clearCache(collectionId),
    clearAllCache: () => cache.clearAllCache(),
  }
})
