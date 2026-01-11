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
      if (cached) {
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
    // Fetch all data in parallel
    const [docs, cols, folds] = await Promise.all([
      fetchDocuments(),
      listCollections(),
      fetchFolders(),
    ])

    documents.value = docs
    collections.value = cols
    folders.value = folds

    const statsData: StatsData = {
      documents: docs,
      collections: cols,
      folders: folds,
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
    documents: computed(() => documents.value),
    collections: computed(() => collections.value),
    folders: computed(() => folders.value),
    initializeStats,
    refreshStats,
    clearAllCache,
  }
})
