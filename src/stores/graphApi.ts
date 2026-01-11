import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchDocuments, fetchFolders, listCollections } from '../utils/craftApi'
import type { CraftDocument, CraftFolder } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'
import { useTagsApiStore } from './tagsApi'

export interface GraphCollection {
  id: string
  name: string
  documentId: string
}

export interface TagDocumentRelation {
  documentId: string
  title: string
  tags: string[]
  dailyNoteDate?: string
}

export const useGraphApiStore = defineStore('graphApi', () => {
  const cache = useApiCache('graph-cache-')
  const tagsApiStore = useTagsApiStore()

  const documents = ref<CraftDocument[]>([])
  const folders = ref<CraftFolder[]>([])
  const collections = ref<GraphCollection[]>([])
  const tagDocuments = ref<Map<string, TagDocumentRelation>>(new Map())
  const userTags = ref<string[]>([])
  const isLoading = ref(false)
  const isLoadingTags = ref(false)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)

  const fetchAllData = async (forceRefresh = false) => {
    const cacheKey = 'all-data'

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cached = cache.getCachedData<{
        documents: CraftDocument[]
        folders: CraftFolder[]
        collections: GraphCollection[]
      }>(cacheKey)
      if (cached) {
        documents.value = cached.documents
        folders.value = cached.folders
        collections.value = cached.collections
        isLoading.value = false
        return
      }
    } else {
      cache.clearCache(cacheKey)
    }

    isLoading.value = true
    completedApiCalls.value = 0
    totalApiCalls.value = 0

    try {
      // Count total folders (including nested) for progress tracking
      const countFolders = (folderList: CraftFolder[]): number => {
        let count = 0
        for (const folder of folderList) {
          count++
          if (folder.folders && folder.folders.length > 0) {
            count += countFolders(folder.folders)
          }
        }
        return count
      }

      // First, fetch folders to count them
      const foldersResult = await fetchFolders().catch(() => ({ items: [] }))
      folders.value = foldersResult.items

      // Calculate total API calls: 2 (folders + collections) + number of folders
      totalApiCalls.value = 2 + countFolders(folders.value)
      completedApiCalls.value = 1 // Folders fetched

      // Fetch collections
      const collectionsResult = await listCollections()
        .then((items) => {
          completedApiCalls.value++
          return { items }
        })
        .catch(() => {
          completedApiCalls.value++
          return { items: [] }
        })

      collections.value = collectionsResult.items

      const allDocuments: CraftDocument[] = []
      const specialLocations: Record<string, 'unsorted' | 'trash' | 'templates' | 'daily_notes'> = {
        unsorted: 'unsorted',
        trash: 'trash',
        templates: 'templates',
        daily_notes: 'daily_notes',
      }

      async function fetchFolderDocuments(folder: CraftFolder) {
        try {
          const location = specialLocations[folder.id]
          const result = await fetchDocuments(
            location
              ? { location, fetchMetadata: true }
              : { folderId: folder.id, fetchMetadata: true },
          )

          completedApiCalls.value++

          result.items.forEach((doc) => {
            allDocuments.push({ ...doc, folderId: folder.id })
          })

          if (!location && folder.folders && folder.folders.length > 0) {
            await Promise.all(folder.folders.map((subfolder) => fetchFolderDocuments(subfolder)))
          }
        } catch (e) {
          completedApiCalls.value++
          console.error(`Error fetching documents for folder ${folder.name}:`, e)
        }
      }

      await Promise.all(folders.value.map((folder) => fetchFolderDocuments(folder)))
      documents.value = allDocuments

      // Cache the data
      cache.setCachedData(cacheKey, {
        documents: allDocuments,
        folders: folders.value,
        collections: collections.value,
      })
    } catch (e) {
      console.error('Error fetching graph data:', e)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  const initializeGraph = async (forceRefresh = false) => {
    await fetchAllData(forceRefresh)
  }

  const refreshGraph = async () => {
    cache.clearCache('all-data')
    await fetchAllData(true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  /**
   * Fetch tag relations using shared cache from tagsApi
   * Reads user tags from localStorage and fetches document relationships
   */
  const fetchTagRelations = async (forceRefresh = false) => {
    // Read user tags from localStorage
    const TAGS_STORAGE_KEY = 'craftboard-tags'
    const stored = localStorage.getItem(TAGS_STORAGE_KEY)
    let tags: string[] = []

    if (stored) {
      try {
        tags = JSON.parse(stored)
      } catch {
        tags = []
      }
    }

    userTags.value = tags

    if (tags.length === 0) {
      tagDocuments.value = new Map()
      return
    }

    isLoadingTags.value = true

    try {
      const result = await tagsApiStore.getDocumentsByTags(tags, forceRefresh)
      tagDocuments.value = result
    } catch (e) {
      console.error('Error fetching tag relations:', e)
      tagDocuments.value = new Map()
    } finally {
      isLoadingTags.value = false
    }
  }

  /**
   * Refresh tag relations
   */
  const refreshTagRelations = async () => {
    await fetchTagRelations(true)
  }

  return {
    documents: computed(() => documents.value),
    folders: computed(() => folders.value),
    collections: computed(() => collections.value),
    tagDocuments: computed(() => tagDocuments.value),
    userTags: computed(() => userTags.value),
    isLoading: computed(() => isLoading.value),
    isLoadingTags: computed(() => isLoadingTags.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeGraph,
    refreshGraph,
    fetchTagRelations,
    refreshTagRelations,
    clearAllCache,
  }
})
