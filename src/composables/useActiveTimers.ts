import { ref, computed, onUnmounted, watch } from 'vue'

export interface ActiveTimer {
  id: string
  widgetName: string
  timeRemaining: number // in seconds
  totalDuration: number // in seconds
  isRunning: boolean
  timerType?: string // e.g., 'work', 'shortBreak', etc.
  route?: string // route to navigate to
  paneId?: string // pane ID for dashboard navigation
  startTimestamp?: number // timestamp when timer started
  timeRemainingAtStart?: number // time remaining when timer started (for calculation)
}

const STORAGE_KEY = 'active-timers'

// Load timers from localStorage
const loadTimersFromStorage = (): Map<string, ActiveTimer> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const timers = JSON.parse(stored) as ActiveTimer[]
      return new Map(timers.map(timer => [timer.id, timer]))
    }
  } catch (error) {
    console.error('Error loading active timers from storage:', error)
  }
  return new Map()
}

// Save timers to localStorage
const saveTimersToStorage = (timers: Map<string, ActiveTimer>) => {
  try {
    const timersArray = Array.from(timers.values())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timersArray))
  } catch (error) {
    console.error('Error saving active timers to storage:', error)
  }
}

// Global state - shared across all components, initialized from localStorage
const activeTimersMap = ref<Map<string, ActiveTimer>>(loadTimersFromStorage())

// Watch for changes and save to localStorage
watch(activeTimersMap, (newMap) => {
  saveTimersToStorage(newMap)
}, { deep: true })

// Global interval for updating timers
let globalIntervalId: number | null = null

// Start global timer update loop
const startGlobalTimerUpdate = () => {
  if (globalIntervalId !== null) return // Already running

  globalIntervalId = window.setInterval(() => {
    const now = Date.now()
    const newMap = new Map(activeTimersMap.value)
    let hasChanges = false

    newMap.forEach((timer, id) => {
      if (timer.isRunning && timer.startTimestamp && timer.timeRemainingAtStart !== undefined) {
        const elapsed = Math.floor((now - timer.startTimestamp) / 1000)
        const newTimeRemaining = Math.max(0, timer.timeRemainingAtStart - elapsed)
        
        if (newTimeRemaining !== timer.timeRemaining) {
          newMap.set(id, { ...timer, timeRemaining: newTimeRemaining })
          hasChanges = true
        }

        // If timer reached zero, mark it as not running
        if (newTimeRemaining <= 0 && timer.isRunning) {
          newMap.set(id, { ...timer, timeRemaining: 0, isRunning: false })
          hasChanges = true
        }
      }
    })

    if (hasChanges) {
      activeTimersMap.value = newMap
    }
  }, 1000)
}

// Stop global timer update loop if no timers are active
const stopGlobalTimerUpdate = () => {
  if (globalIntervalId !== null) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
}

// Initialize: start global update if there are running timers
const hasRunningTimers = Array.from(activeTimersMap.value.values()).some(t => t.isRunning)
if (hasRunningTimers) {
  startGlobalTimerUpdate()
}

export function useActiveTimers() {
  const registerTimer = (timer: ActiveTimer) => {
    const newMap = new Map(activeTimersMap.value)
    newMap.set(timer.id, timer)
    activeTimersMap.value = newMap
    
    // Start global update loop if not already running
    if (timer.isRunning) {
      startGlobalTimerUpdate()
    }
  }

  const unregisterTimer = (id: string) => {
    const newMap = new Map(activeTimersMap.value)
    newMap.delete(id)
    activeTimersMap.value = newMap
    
    // Stop global update loop if no more timers
    if (newMap.size === 0) {
      stopGlobalTimerUpdate()
    }
  }

  const updateTimer = (id: string, updates: Partial<ActiveTimer>) => {
    const timer = activeTimersMap.value.get(id)
    if (timer) {
      const newMap = new Map(activeTimersMap.value)
      const updatedTimer = { ...timer, ...updates }
      newMap.set(id, updatedTimer)
      activeTimersMap.value = newMap
      
      // Start or stop global update based on running state
      const hasRunningTimers = Array.from(newMap.values()).some(t => t.isRunning)
      if (hasRunningTimers) {
        startGlobalTimerUpdate()
      } else {
        stopGlobalTimerUpdate()
      }
    }
  }

  const getTimer = (id: string) => {
    return activeTimersMap.value.get(id)
  }

  const timers = computed(() => Array.from(activeTimersMap.value.values()))

  return {
    activeTimers: timers,
    registerTimer,
    unregisterTimer,
    updateTimer,
    getTimer,
  }
}
