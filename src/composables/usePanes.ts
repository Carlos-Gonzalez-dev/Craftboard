import { ref, watch, nextTick } from 'vue'

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
// Flags to prevent saving when syncing from storage events
let isSyncingPanes = false
const isSyncingActivePane = false

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
      savePanesOnly()
      saveActivePaneOnly()
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

// Save only panes data (not activePaneId)
const savePanesOnly = () => {
  try {
    localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(panes.value))
  } catch (e) {
    console.error('Failed to save panes:', e)
  }
}

// Save only activePaneId (not panes)
const saveActivePaneOnly = () => {
  try {
    localStorage.setItem(ACTIVE_PANE_KEY, activePaneId.value)
  } catch (e) {
    console.error('Failed to save active pane:', e)
  }
}

// Save both (for explicit saves like creating/deleting panes)
const savePanes = () => {
  savePanesOnly()
  saveActivePaneOnly()
}

const switchPane = (paneId: string) => {
  activePaneId.value = paneId
  saveActivePaneOnly()
}

export function usePanes() {
  // Initialize watchers and listeners only once
  if (!initialized) {
    initialized = true

    // Watch for localStorage changes from other tabs/windows
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        // Handle panes changes from other tabs
        if (e.key === PANES_STORAGE_KEY && e.newValue) {
          isSyncingPanes = true
          try {
            panes.value = JSON.parse(e.newValue)
          } finally {
            // Reset flag after Vue's reactivity cycle completes
            nextTick(() => {
              isSyncingPanes = false
            })
          }
        }
        // Don't sync activePaneId from other tabs - each tab keeps its own active pane
      })
    }

    // Watch for panes changes and save (but not when syncing from storage)
    watch(
      () => panes.value,
      () => {
        if (!isSyncingPanes) {
          savePanesOnly()
        }
      },
      { deep: true },
    )

    // Watch for activePaneId changes - save locally only
    watch(activePaneId, () => {
      if (!isSyncingActivePane) {
        saveActivePaneOnly()
      }
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
