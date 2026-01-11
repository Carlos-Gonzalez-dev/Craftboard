import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApiCache } from '../composables/useApiCache'
import {
  fetchDocuments,
  listCollections,
  fetchFolders,
  type CraftDocument,
  type Collection,
  type CraftFolder,
} from '../utils/craftApi'

export interface StatsData {
  documents: CraftDocument[]
  collections: Collection[]
  folders: CraftFolder[]
}

export const useStatsApiStore = defineStore('statsApi', () => {
  const cache = useApiCache('stats-cache-')

  const documents = ref<CraftDocument[]>([])
  const collections = ref<Collection[]>([])
  const folders = ref<CraftFolder[]>([])

  const data = computed(
    (): StatsData => ({
      documents: documents.value,
      collections: collections.value,
      folders: folders.value,
    }),
  )

  async function initializeStats(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = cache.getCachedData<StatsData>('all')
      // Validate cached data is in correct format (arrays, not objects with items)
      if (
        cached &&
        Array.isArray(cached.documents) &&
        Array.isArray(cached.collections) &&
        Array.isArray(cached.folders)
      ) {
        documents.value = cached.documents
        collections.value = cached.collections
        folders.value = cached.folders
        return
      }
    }

    await fetchStats()
  }

  async function refreshStats() {
    await initializeStats(true)
  }

  async function fetchStats() {
    // Fetch all data in parallel (fetchMetadata: true to get lastModifiedAt/createdAt)
    const [docsResponse, cols, foldersResponse] = await Promise.all([
      fetchDocuments({ fetchMetadata: true }),
      listCollections(),
      fetchFolders(),
    ])

    documents.value = docsResponse.items
    collections.value = cols
    folders.value = foldersResponse.items

    const statsData: StatsData = {
      documents: docsResponse.items,
      collections: cols,
      folders: foldersResponse.items,
    }

    cache.setCachedData('all', statsData)
  }

  function clearAllCache() {
    cache.clearAllCache()
    documents.value = []
    collections.value = []
    folders.value = []
  }

  return {
    data,
    documents,
    collections,
    folders,
    initializeStats,
    refreshStats,
    clearAllCache,
  }
})
