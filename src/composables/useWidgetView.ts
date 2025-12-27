import { ref, watch } from 'vue'

const STORAGE_KEY = 'widget-view-mode'
const isCompactView = ref<boolean>(
  localStorage.getItem(STORAGE_KEY) === 'compact'
)

watch(isCompactView, (newValue) => {
  localStorage.setItem(STORAGE_KEY, newValue ? 'compact' : 'normal')
})

export const useWidgetView = () => {
  const toggleViewMode = () => {
    isCompactView.value = !isCompactView.value
  }

  return {
    isCompactView,
    toggleViewMode,
  }
}


