import { ref, watch } from 'vue'

export const PANES_STORAGE_KEY = 'craftboard-panes'
export const ACTIVE_PANE_KEY = 'craftboard-active-pane'

export interface Pane {
  id: string
  name: string
  widgets: any[]
}

// Singleton state - shared across all usePanes() calls
const panes = ref<Pane[]>([])
const activePaneId = ref<string>('')

// Initialize watchers and listeners only once
let initialized = false

const loadPanes = () => {
  try {
    const savedPanes = localStorage.getItem(PANES_STORAGE_KEY)
    const savedActivePane = localStorage.getItem(ACTIVE_PANE_KEY)

    if (savedPanes) {
      panes.value = JSON.parse(savedPanes)
      activePaneId.value = savedActivePane || panes.value[0]?.id || ''
    } else {
      panes.value = [
        {
          id: 'default',
          name: 'Main',
          widgets: [],
        },
      ]
      activePaneId.value = 'default'
      savePanes()
    }
  } catch (e) {
    console.error('Failed to load panes:', e)
    panes.value = [
      {
        id: 'default',
        name: 'Main',
        widgets: [],
      },
    ]
    activePaneId.value = 'default'
  }
}

const savePanes = () => {
  try {
    localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(panes.value))
    localStorage.setItem(ACTIVE_PANE_KEY, activePaneId.value)
  } catch (e) {
    console.error('Failed to save panes:', e)
  }
}

const switchPane = (paneId: string) => {
  activePaneId.value = paneId
  savePanes()
}

export function usePanes() {
  // Initialize watchers and listeners only once
  if (!initialized) {
    initialized = true

    // Watch for localStorage changes from other tabs/windows
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === PANES_STORAGE_KEY && e.newValue) {
          panes.value = JSON.parse(e.newValue)
        }
        if (e.key === ACTIVE_PANE_KEY && e.newValue) {
          activePaneId.value = e.newValue
        }
      })
    }

    // Watch for changes and save
    watch(
      () => panes.value,
      () => {
        savePanes()
      },
      { deep: true },
    )

    watch(activePaneId, () => {
      savePanes()
    })
  }

  return {
    panes,
    activePaneId,
    loadPanes,
    savePanes,
    switchPane,
  }
}
