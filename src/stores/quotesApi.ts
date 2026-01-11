import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getCollectionItems } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'

export interface QuoteItem {
  id: string
  title: string
  category: string
  author: string
}

export const useQuotesApiStore = defineStore('quotesApi', () => {
  const cache = useApiCache('quotes-cache-')

  const quotes = ref<QuoteItem[]>([])
  const isLoading = ref(false)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)

  const fetchQuotes = async (collectionId: string, forceRefresh = false) => {
    const cacheKey = collectionId

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = cache.getCachedData<QuoteItem[]>(cacheKey)
      if (cached) {
        quotes.value = cached
        isLoading.value = false
        return
      }
    } else {
      cache.clearCache(cacheKey)
    }

    isLoading.value = true
    completedApiCalls.value = 0
    totalApiCalls.value = 1

    try {
      const items = await getCollectionItems(collectionId)
      completedApiCalls.value++

      const validItems: QuoteItem[] = items
        .map((item: any) => {
          const properties = item.properties || {}
          let title = item.title || ''
          if (title.trim().toLowerCase() === 'untitled') {
            title = ''
          }
          const category =
            properties.Category ||
            properties.category ||
            properties['Category'] ||
            properties['category'] ||
            ''
          const author =
            properties.Author ||
            properties.author ||
            properties['Author'] ||
            properties['author'] ||
            ''

          if (title && category) {
            return {
              id: item.id,
              title: String(title),
              category: String(category),
              author: String(author),
            }
          }
          return null
        })
        .filter((item: QuoteItem | null): item is QuoteItem => item !== null)

      quotes.value = validItems

      // Cache items
      cache.setCachedData(cacheKey, validItems)
    } catch (error) {
      console.error('Error loading quotes:', error)
      completedApiCalls.value++
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const initializeQuotes = async (collectionId: string, forceRefresh = false) => {
    await fetchQuotes(collectionId, forceRefresh)
  }

  const refreshQuotes = async (collectionId: string) => {
    cache.clearCache(collectionId)
    await fetchQuotes(collectionId, true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  return {
    quotes: computed(() => quotes.value),
    isLoading: computed(() => isLoading.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeQuotes,
    refreshQuotes,
    clearAllCache,
  }
})
