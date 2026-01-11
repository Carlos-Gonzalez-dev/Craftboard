import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApiCache } from '../composables/useApiCache'
import {
  listCollections,
  getCollectionSchema,
  getCollectionItems,
  type Collection,
  type CollectionSchema,
  type CollectionItem,
} from '../utils/craftApi'

export interface CollectionData {
  collection: Collection
  schema: CollectionSchema
  items: CollectionItem[]
}

export const useCollectionsApiStore = defineStore('collectionsApi', () => {
  const cache = useApiCache('collections-cache-')

  // Store all collections list
  const collections = ref<Collection[]>([])

  // Store individual collection data (schema + items) by collection ID
  const collectionsData = ref<Map<string, CollectionData>>(new Map())

  const data = computed(() => collections.value)

  // Initialize list of all collections
  async function initializeCollections(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = cache.getCachedData<Collection[]>('list')
      if (cached) {
        collections.value = cached
        return
      }
    }

    await fetchCollections()
  }

  async function refreshCollections() {
    await initializeCollections(true)
  }

  async function fetchCollections() {
    const result = await listCollections()
    collections.value = result
    cache.setCachedData('list', result)
  }

  // Initialize a specific collection's schema and items
  async function initializeCollection(collectionId: string, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = cache.getCachedData<CollectionData>(collectionId)
      if (cached) {
        collectionsData.value.set(collectionId, cached)
        return cached
      }
    }

    return await fetchCollectionData(collectionId)
  }

  async function refreshCollection(collectionId: string) {
    return await initializeCollection(collectionId, true)
  }

  async function fetchCollectionData(collectionId: string): Promise<CollectionData> {
    // Fetch schema and items in parallel
    const [schema, items] = await Promise.all([
      getCollectionSchema(collectionId),
      getCollectionItems(collectionId),
    ])

    // Find collection info from the list
    const collection = collections.value.find((c) => c.id === collectionId)
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found in collections list`)
    }

    const collectionData: CollectionData = {
      collection,
      schema,
      items,
    }

    collectionsData.value.set(collectionId, collectionData)
    cache.setCachedData(collectionId, collectionData)

    return collectionData
  }

  function getCollection(collectionId: string): CollectionData | undefined {
    return collectionsData.value.get(collectionId)
  }

  function clearAllCache() {
    cache.clearAllCache()
    collections.value = []
    collectionsData.value.clear()
  }

  return {
    data,
    collections: computed(() => collections.value),
    collectionsData: computed(() => collectionsData.value),
    initializeCollections,
    refreshCollections,
    initializeCollection,
    refreshCollection,
    getCollection,
    clearAllCache,
  }
})
