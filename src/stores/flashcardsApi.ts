import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getApiUrl, getApiToken } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'

export interface FlashcardItem {
  id: string
  [key: string]: any
}

export interface DeckItem {
  id: string
  [key: string]: any
}

export const useFlashcardsApiStore = defineStore('flashcardsApi', () => {
  const cache = useApiCache('flashcards-cache-')

  const decks = ref<DeckItem[]>([])
  const flashcards = ref<FlashcardItem[]>([])
  const isLoading = ref(false)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)

  const getHeaders = () => {
    const token = getApiToken()
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  const getCacheKey = (decksId: string, flashcardsId: string): string => {
    return `${decksId}-${flashcardsId}`
  }

  const fetchCollectionData = async (
    decksCollectionId: string,
    flashcardsCollectionId: string,
    forceRefresh = false,
  ) => {
    const apiBaseUrl = getApiUrl()
    if (!apiBaseUrl || !decksCollectionId || !flashcardsCollectionId) {
      isLoading.value = false
      return
    }

    const cacheKey = getCacheKey(decksCollectionId, flashcardsCollectionId)

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = cache.getCachedData<{
        decks: DeckItem[]
        flashcards: FlashcardItem[]
      }>(cacheKey)
      if (cached) {
        decks.value = cached.decks || []
        flashcards.value = cached.flashcards || []
        isLoading.value = false
        return
      }
    } else {
      cache.clearCache(cacheKey)
    }

    isLoading.value = true
    completedApiCalls.value = 0

    try {
      // Fetch decks
      const decksUrl = `${apiBaseUrl}/collections/${decksCollectionId}/items`
      const decksResponse = await fetch(decksUrl, {
        method: 'GET',
        headers: getHeaders(),
      })
      if (!decksResponse.ok) {
        if (decksResponse.status === 404) {
          throw new Error(
            'Deck collection not found. Please check your Collection IDs in Settings > API.',
          )
        }
        throw new Error(
          `Failed to fetch decks (${decksResponse.status}). Please check your Collection IDs in Settings > API.`,
        )
      }
      const decksData = await decksResponse.json()
      completedApiCalls.value++

      // Fetch flashcards
      const flashcardsUrl = `${apiBaseUrl}/collections/${flashcardsCollectionId}/items`
      const flashcardsResponse = await fetch(flashcardsUrl, {
        method: 'GET',
        headers: getHeaders(),
      })
      if (!flashcardsResponse.ok) {
        if (flashcardsResponse.status === 404) {
          throw new Error(
            'Flashcard collection not found. Please check your Collection IDs in Settings > API.',
          )
        }
        throw new Error(
          `Failed to fetch flashcards (${flashcardsResponse.status}). Please check your Collection IDs in Settings > API.`,
        )
      }
      const flashcardsData = await flashcardsResponse.json()
      completedApiCalls.value++

      const decksItems = decksData.items || []
      const flashcardsItems = flashcardsData.items || []

      decks.value = decksItems
      flashcards.value = flashcardsItems

      // Cache the data
      cache.setCachedData(cacheKey, {
        decks: decksItems,
        flashcards: flashcardsItems,
      })
    } catch (error) {
      console.error('Error loading flashcards data:', error)
      completedApiCalls.value += 2
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const initializeFlashcards = async (
    decksCollectionId: string,
    flashcardsCollectionId: string,
    forceRefresh = false,
  ) => {
    totalApiCalls.value = 0
    completedApiCalls.value = 0

    const cacheKey = getCacheKey(decksCollectionId, flashcardsCollectionId)
    if (forceRefresh || !cache.getCachedData(cacheKey)) {
      totalApiCalls.value = 2 // decks + flashcards
    }

    await fetchCollectionData(decksCollectionId, flashcardsCollectionId, forceRefresh)
  }

  const refreshFlashcards = async (decksCollectionId: string, flashcardsCollectionId: string) => {
    const cacheKey = getCacheKey(decksCollectionId, flashcardsCollectionId)
    cache.clearCache(cacheKey)
    await initializeFlashcards(decksCollectionId, flashcardsCollectionId, true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  return {
    decks: computed(() => decks.value),
    flashcards: computed(() => flashcards.value),
    isLoading: computed(() => isLoading.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeFlashcards,
    refreshFlashcards,
    clearAllCache,
  }
})
