/**
 * EXAMPLE: How to use the Tags API Store in other components
 *
 * The store is completely reusable and can be used in any
 * component or composable that needs access to tags logic.
 */

import { useTagsApiStore } from '@/stores/tagsApi'
import { computed } from 'vue'

export function useMyTagsLogic() {
  const tagsApiStore = useTagsApiStore()

  // Option 1: Use the store state directly
  const logs = computed(() => tagsApiStore.logs)
  const isLoading = computed(() => tagsApiStore.isLoading)
  const error = computed(() => tagsApiStore.error)

  // Option 2: Call store methods
  const loadTags = async (tags: string[]) => {
    await tagsApiStore.loadLogs(tags)
  }

  const refreshTags = async (tags: string[]) => {
    await tagsApiStore.refreshLogs(tags)
  }

  // Option 3: Use utility methods from the store
  const extractTags = (markdown: string) => {
    return tagsApiStore.extractMatchingTags(markdown)
  }

  // Option 4: Clear cache
  const clearCache = (tags: string[]) => {
    tagsApiStore.clearCache(tags)
  }

  return {
    logs,
    isLoading,
    error,
    loadTags,
    refreshTags,
    extractTags,
    clearCache,
  }
}

/**
 * EXAMPLE: Composable to combine multiple stores
 *
 * In the future, when we have stores for RSS, Tasks, etc.
 */

export function useAllDataLoading() {
  const tagsApiStore = useTagsApiStore()
  // const rssApiStore = useRSSApiStore()  // Coming soon
  // const tasksApiStore = useTasksApiStore()  // Coming soon

  const isAnyLoading = computed(() => {
    return tagsApiStore.isLoading
    // || rssApiStore.isLoading
    // || tasksApiStore.isLoading
  })

  const allErrors = computed(() => {
    const errors = []
    if (tagsApiStore.error) errors.push(`Tags: ${tagsApiStore.error}`)
    // if (rssApiStore.error) errors.push(`RSS: ${rssApiStore.error}`)
    // if (tasksApiStore.error) errors.push(`Tasks: ${tasksApiStore.error}`)
    return errors
  })

  return {
    isAnyLoading,
    allErrors,
  }
}
