import { ref } from 'vue'

const STORAGE_KEY = 'craftboard-theme'

const currentTheme = ref<'dark'>('dark')

export function useTheme() {
  const setTheme = () => {
    // Dark theme is the only theme
    currentTheme.value = 'dark'
    localStorage.setItem(STORAGE_KEY, 'dark')
    document.documentElement.setAttribute('data-theme', 'dark')
  }

  // Initialize theme on first load
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', 'dark')
  }

  return {
    currentTheme,
    setTheme,
  }
}
