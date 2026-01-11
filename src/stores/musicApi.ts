import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getApiUrl, getApiToken } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'

export interface MusicItem {
  id: string
  title: string
  artist?: string
  genre?: string
  url?: string
  tags?: string[]
  [key: string]: any
}

export interface ArtistItem {
  id: string
  name: string
  [key: string]: any
}

export interface GenreItem {
  id: string
  name: string
  [key: string]: any
}

export const useMusicApiStore = defineStore('musicApi', () => {
  const cache = useApiCache('music-cache-')

  const music = ref<MusicItem[]>([])
  const artists = ref<ArtistItem[]>([])
  const genres = ref<GenreItem[]>([])
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

  const getCacheKey = (musicId: string, artistsId: string, genresId: string): string => {
    return `${musicId}-${artistsId}-${genresId}`
  }

  const fetchCollectionData = async (
    musicCollectionId: string,
    artistCollectionId: string,
    genreCollectionId: string,
    forceRefresh = false,
  ) => {
    const apiBaseUrl = getApiUrl()
    if (!apiBaseUrl || !musicCollectionId || !artistCollectionId || !genreCollectionId) {
      isLoading.value = false
      return
    }

    const cacheKey = getCacheKey(musicCollectionId, artistCollectionId, genreCollectionId)

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = cache.getCachedData<{
        music: MusicItem[]
        artists: ArtistItem[]
        genres: GenreItem[]
      }>(cacheKey)
      if (cached) {
        music.value = cached.music || []
        artists.value = cached.artists || []
        genres.value = cached.genres || []
        isLoading.value = false
        return
      }
    } else {
      cache.clearCache(cacheKey)
    }

    isLoading.value = true
    completedApiCalls.value = 0

    try {
      const [musicRes, artistsRes, genresRes] = await Promise.all([
        fetch(`${apiBaseUrl}/collections/${musicCollectionId}/items?maxDepth=-1`, {
          headers: getHeaders(),
        }),
        fetch(`${apiBaseUrl}/collections/${artistCollectionId}/items?maxDepth=-1`, {
          headers: getHeaders(),
        }),
        fetch(`${apiBaseUrl}/collections/${genreCollectionId}/items?maxDepth=-1`, {
          headers: getHeaders(),
        }),
      ])

      completedApiCalls.value += 3

      if (!musicRes.ok || !artistsRes.ok || !genresRes.ok) {
        throw new Error('Failed to fetch data from the server')
      }

      const [musicData, artistsData, genresData] = await Promise.all([
        musicRes.json(),
        artistsRes.json(),
        genresRes.json(),
      ])

      const musicItems = musicData.items || []
      const artistsItems = artistsData.items || []
      const genresItems = genresData.items || []

      music.value = musicItems
      artists.value = artistsItems
      genres.value = genresItems

      // Cache the data
      cache.setCachedData(cacheKey, {
        music: musicItems,
        artists: artistsItems,
        genres: genresItems,
      })
    } catch (error) {
      console.error('Error loading music data:', error)
      completedApiCalls.value += 3
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const initializeMusic = async (
    musicCollectionId: string,
    artistCollectionId: string,
    genreCollectionId: string,
    forceRefresh = false,
  ) => {
    totalApiCalls.value = 0
    completedApiCalls.value = 0

    const cacheKey = getCacheKey(musicCollectionId, artistCollectionId, genreCollectionId)
    if (forceRefresh || !cache.getCachedData(cacheKey)) {
      totalApiCalls.value = 3 // music + artists + genres
    }

    await fetchCollectionData(
      musicCollectionId,
      artistCollectionId,
      genreCollectionId,
      forceRefresh,
    )
  }

  const refreshMusic = async (
    musicCollectionId: string,
    artistCollectionId: string,
    genreCollectionId: string,
  ) => {
    const cacheKey = getCacheKey(musicCollectionId, artistCollectionId, genreCollectionId)
    cache.clearCache(cacheKey)
    await initializeMusic(musicCollectionId, artistCollectionId, genreCollectionId, true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  return {
    music: computed(() => music.value),
    artists: computed(() => artists.value),
    genres: computed(() => genres.value),
    isLoading: computed(() => isLoading.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeMusic,
    refreshMusic,
    clearAllCache,
  }
})
