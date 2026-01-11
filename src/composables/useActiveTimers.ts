import { ref, computed } from 'vue'

export interface ActiveTimer {
  id: string
  widgetName: string
  timeRemaining: number // For countdown timers
  totalDuration: number
  isRunning: boolean
  isCompleted: boolean
  timerType: 'work' | 'short-break' | 'long-break' | 'stopwatch'
  route: string
  paneId?: string
  startTimestamp: number
  timeRemainingAtStart: number
  elapsedAtStart?: number // For stopwatch (elapsed time when started)
  color?: string // Widget color
  icon?: string // Widget icon type ('timer' or 'stopwatch')
}

// Simple in-memory storage - no persistence across page reloads
const activeTimersMap = ref<Map<string, ActiveTimer>>(new Map())
const activeTimers = computed(() => Array.from(activeTimersMap.value.values()))

let globalIntervalId: number | null = null

const startGlobalTimerUpdate = () => {
  if (globalIntervalId !== null) return

  globalIntervalId = window.setInterval(() => {
    const now = Date.now()
    const newMap = new Map(activeTimersMap.value)
    let hasChanges = false

    newMap.forEach((timer, id) => {
      if (timer.isCompleted || !timer.isRunning) {
        return
      }

      // Handle stopwatch (counts up) differently from countdown timers
      if (timer.timerType === 'stopwatch') {
        const elapsedSinceStart = Math.floor((now - timer.startTimestamp) / 1000)
        const totalElapsed = (timer.elapsedAtStart || 0) + elapsedSinceStart

        if (totalElapsed !== timer.timeRemaining) {
          newMap.set(id, { ...timer, timeRemaining: totalElapsed })
          hasChanges = true
        }
      } else {
        // Countdown timer
        const elapsed = Math.floor((now - timer.startTimestamp) / 1000)
        const newTimeRemaining = Math.max(0, timer.timeRemainingAtStart - elapsed)

        if (newTimeRemaining !== timer.timeRemaining) {
          newMap.set(id, { ...timer, timeRemaining: newTimeRemaining })
          hasChanges = true
        }

        // If timer reached zero, mark it as completed
        if (newTimeRemaining <= 0) {
          newMap.set(id, { ...timer, timeRemaining: 0, isRunning: false, isCompleted: true })
          hasChanges = true
        }
      }
    })

    if (hasChanges) {
      activeTimersMap.value = newMap
    }
  }, 1000)
}

const stopGlobalTimerUpdate = () => {
  if (globalIntervalId !== null) {
    clearInterval(globalIntervalId)
    globalIntervalId = null
  }
}

export function useActiveTimers() {
  const registerTimer = (timer: ActiveTimer) => {
    const newMap = new Map(activeTimersMap.value)
    newMap.set(timer.id, timer)
    activeTimersMap.value = newMap

    if (timer.isRunning) {
      startGlobalTimerUpdate()
    }
  }

  const unregisterTimer = (id: string) => {
    const newMap = new Map(activeTimersMap.value)
    newMap.delete(id)
    activeTimersMap.value = newMap

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

      if (updates.isRunning !== undefined) {
        if (updates.isRunning) {
          startGlobalTimerUpdate()
        } else if (newMap.size === 0 || !Array.from(newMap.values()).some((t) => t.isRunning)) {
          stopGlobalTimerUpdate()
        }
      }
    }
  }

  const getTimer = (id: string) => {
    return activeTimersMap.value.get(id)
  }

  return {
    activeTimers,
    registerTimer,
    unregisterTimer,
    updateTimer,
    getTimer,
  }
}
