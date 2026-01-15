import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useGlobalLoadingStore = defineStore('globalLoading', () => {
  // Active loaders registry (just IDs)
  const loaders = ref<Set<string>>(new Set())

  // Check if any loading is active
  const isLoading = computed(() => loaders.value.size > 0)

  // Start loading
  function startLoading(id: string) {
    loaders.value.add(id)
  }

  // Stop loading
  function stopLoading(id: string) {
    loaders.value.delete(id)
  }

  // Stop all loaders
  function stopAll() {
    loaders.value.clear()
  }

  return {
    loaders,
    isLoading,
    startLoading,
    stopLoading,
    stopAll,
  }
})
