<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Play, Pause, RotateCcw, Coffee } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useActiveTimers } from '../../composables/useActiveTimers'
import { usePanes } from '../../composables/usePanes'
import type { Widget } from '../../types/widget'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
}>()

const route = useRoute()
const { registerTimer, unregisterTimer, updateTimer, getTimer } = useActiveTimers()
const { activePaneId } = usePanes()

// Timer states
type TimerType = 'work' | 'shortBreak' | 'longBreak'
const timerType = ref<TimerType>('work')
const isRunning = ref(false)
const isPaused = ref(false)
const timeRemaining = ref(25 * 60) // 25 minutes in seconds
const completedPomodoros = ref(0)
const intervalId = ref<number | null>(null)
const startTimestamp = ref<number | null>(null) // Timestamp when timer started
const pausedTimeRemaining = ref<number | null>(null) // Time remaining when paused
const timeRemainingAtStart = ref<number | null>(null) // Time remaining when timer was started (for timestamp calculation)
const persistentNotificationId = ref<string | null>(null) // For iOS persistent notification
let wakeLock: any = null // Wake Lock API reference

// Timer durations (in seconds)
const WORK_DURATION = 25 * 60 // 25 minutes
const SHORT_BREAK_DURATION = 5 * 60 // 5 minutes
const LONG_BREAK_DURATION = 15 * 60 // 15 minutes
const POMODOROS_UNTIL_LONG_BREAK = 4

// Load saved state
const loadState = () => {
  if (props.widget.data) {
    timerType.value = props.widget.data.timerType || 'work'
    completedPomodoros.value = props.widget.data.completedPomodoros || 0

    // If timer was running, recalculate time based on timestamp
    if (
      props.widget.data.isRunning &&
      !props.widget.data.isPaused &&
      props.widget.data.startTimestamp
    ) {
      const elapsed = Math.floor((Date.now() - props.widget.data.startTimestamp) / 1000)
      const originalTime =
        props.widget.data.timeRemainingAtStart || getDefaultDuration(timerType.value)
      const newTimeRemaining = Math.max(0, originalTime - elapsed)

      if (newTimeRemaining <= 0) {
        // Timer completed while away - mark for completion after load
        timeRemaining.value = 0
        isRunning.value = false
        isPaused.value = false
        startTimestamp.value = null
        timeRemainingAtStart.value = null
        // Will be handled in onMounted
      } else {
        timeRemaining.value = newTimeRemaining
        startTimestamp.value = props.widget.data.startTimestamp
        timeRemainingAtStart.value = originalTime
        isRunning.value = true
        isPaused.value = false
      }
    } else if (props.widget.data.isPaused && props.widget.data.pausedTimeRemaining !== undefined) {
      timeRemaining.value = props.widget.data.pausedTimeRemaining
      pausedTimeRemaining.value = props.widget.data.pausedTimeRemaining
      isPaused.value = true
      isRunning.value = false
    } else {
      timeRemaining.value = props.widget.data.timeRemaining || getDefaultDuration(timerType.value)
    }
  } else {
    timeRemaining.value = getDefaultDuration('work')
  }
}

const getDefaultDuration = (type: TimerType): number => {
  switch (type) {
    case 'work':
      return WORK_DURATION
    case 'shortBreak':
      return SHORT_BREAK_DURATION
    case 'longBreak':
      return LONG_BREAK_DURATION
  }
}

const saveState = () => {
  emit('update:data', {
    timerType: timerType.value,
    timeRemaining: timeRemaining.value,
    completedPomodoros: completedPomodoros.value,
    isRunning: isRunning.value,
    isPaused: isPaused.value,
    startTimestamp: startTimestamp.value,
    timeRemainingAtStart: timeRemainingAtStart.value,
    pausedTimeRemaining: pausedTimeRemaining.value,
  })
}

// Get widget display name
const widgetDisplayName = computed(() => {
  return props.widget.title || props.widget.name || 'Pomodoro Timer'
})

// Format time display
const formattedTime = computed(() => {
  const minutes = Math.floor(timeRemaining.value / 60)
  const seconds = timeRemaining.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

// Progress percentage
const progress = computed(() => {
  const defaultDuration = getDefaultDuration(timerType.value)
  return ((defaultDuration - timeRemaining.value) / defaultDuration) * 100
})

// Timer label
const timerLabel = computed(() => {
  switch (timerType.value) {
    case 'work':
      return 'Focus Time'
    case 'shortBreak':
      return 'Short Break'
    case 'longBreak':
      return 'Long Break'
  }
})

// Start timer
const startTimer = () => {
  if (timeRemaining.value <= 0) {
    resetTimer()
    return
  }

  isRunning.value = true
  isPaused.value = false

  // If resuming from pause, use the paused time
  if (pausedTimeRemaining.value !== null) {
    timeRemaining.value = pausedTimeRemaining.value
    pausedTimeRemaining.value = null
  }

  // Save the time remaining at start for timestamp-based calculation
  timeRemainingAtStart.value = timeRemaining.value
  startTimestamp.value = Date.now()

  // Request wake lock to keep screen on (optional, user can disable in browser)
  requestWakeLock()

  // Update app badge with initial time
  updateAppBadge(timeRemaining.value)

  // Check if timer already exists (might have been kept alive from previous mount)
  const existingTimer = getTimer(props.widget.id)
  if (!existingTimer) {
    // Register in active timers only if not already registered
    registerTimer({
      id: props.widget.id,
      widgetName: widgetDisplayName.value,
      timeRemaining: timeRemaining.value,
      totalDuration: getDefaultDuration(timerType.value),
      isRunning: true,
      timerType: timerLabel.value,
      route: route.path,
      paneId: activePaneId.value,
      startTimestamp: startTimestamp.value,
      timeRemainingAtStart: timeRemainingAtStart.value,
      color: props.widget.color,
      icon: 'timer',
    })
  } else {
    // Timer exists, just update the route and timestamps
    // Don't overwrite isCompleted if it's already set
    const updates: any = {
      route: route.path,
      paneId: activePaneId.value,
      timeRemaining: timeRemaining.value,
      startTimestamp: startTimestamp.value,
      timeRemainingAtStart: timeRemainingAtStart.value,
      isRunning: true,
    }

    // Preserve isCompleted if it exists
    if (!existingTimer.isCompleted) {
      updateTimer(props.widget.id, updates)
    }
  }

  saveState()

  intervalId.value = window.setInterval(() => {
    // Get updated time from global timer
    const globalTimer = getTimer(props.widget.id)
    if (globalTimer) {
      timeRemaining.value = globalTimer.timeRemaining

      // Check if timer is marked as completed
      if (globalTimer.isCompleted) {
        completeTimer()
        return
      }

      // Save state every 5 seconds
      if (startTimestamp.value) {
        const elapsed = Math.floor((Date.now() - startTimestamp.value) / 1000)
        if (elapsed % 5 === 0) {
          saveState()
        }

        // Update app badge every minute
        if (elapsed % 60 === 0) {
          updateAppBadge(timeRemaining.value)
        }

        // Update persistent notification every 30 seconds (less frequently to avoid spam)
        if (elapsed % 30 === 0 && timeRemaining.value > 10) {
          updatePersistentNotification()
        }
      }
    }
  }, 1000)
}

// Pause timer
const pauseTimer = () => {
  isRunning.value = false
  isPaused.value = true
  pausedTimeRemaining.value = timeRemaining.value
  startTimestamp.value = null
  if (intervalId.value) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }

  // Release wake lock
  releaseWakeLock()

  // Clear app badge
  clearAppBadge()

  // Unregister from active timers
  unregisterTimer(props.widget.id)

  saveState()
}

// Reset timer
const resetTimer = () => {
  isRunning.value = false
  isPaused.value = false
  startTimestamp.value = null
  timeRemainingAtStart.value = null
  pausedTimeRemaining.value = null
  if (intervalId.value) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }

  // Release wake lock and clear badge
  releaseWakeLock()
  clearAppBadge()

  // Unregister from active timers
  unregisterTimer(props.widget.id)

  timeRemaining.value = getDefaultDuration(timerType.value)
  saveState()
}

// Complete timer
const completeTimer = () => {
  isRunning.value = false
  isPaused.value = false
  startTimestamp.value = null
  timeRemainingAtStart.value = null
  pausedTimeRemaining.value = null
  if (intervalId.value) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }

  // Keep timer at 0 to show completed state
  timeRemaining.value = 0

  // Don't unregister - timer will stay visible as completed
  // The global composable already marks it as isCompleted: true

  // Play notification sound
  playNotificationSound()

  // Vibrate if supported (iOS/Android)
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200])
  }

  // Clear app badge
  clearAppBadge()

  // Release wake lock
  releaseWakeLock()

  // Show browser notification if permission granted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Pomodoro Timer', {
      body:
        timerType.value === 'work'
          ? '🎯 Focus session complete! Time for a break.'
          : '☕ Break complete! Ready to focus?',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: true,
      vibrate: [200, 100, 200],
    })
  }

  // Don't auto-switch timer type - let user dismiss and manually start next session
  // Just update the completed pomodoros count if it was a work session
  if (timerType.value === 'work') {
    completedPomodoros.value++
  }

  saveState()
}

// Play notification sound
const playNotificationSound = () => {
  try {
    // Create audio context and play a beep
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  } catch (e) {
    console.warn('Could not play notification sound:', e)
  }
}

// Request notification permission
const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

// Update app badge with time remaining (for iOS home screen icon)
const updateAppBadge = async (seconds: number) => {
  if ('setAppBadge' in navigator) {
    try {
      const minutes = Math.ceil(seconds / 60)
      await (navigator as any).setAppBadge(minutes)
    } catch (e) {
      console.debug('Could not update app badge:', e)
    }
  }
}

// Clear app badge
const clearAppBadge = async () => {
  if ('clearAppBadge' in navigator) {
    try {
      await (navigator as any).clearAppBadge()
    } catch (e) {
      console.debug('Could not clear app badge:', e)
    }
  }
}

// Create or update persistent notification (for iOS lock screen)
const updatePersistentNotification = async () => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const minutes = Math.floor(timeRemaining.value / 60)
      const seconds = timeRemaining.value % 60
      const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

      const timerTypeText = timerType.value === 'work' ? '🎯 Focus' : '☕ Break'
      const body = `${timerTypeText} - ${timeText} remaining`

      // Close previous notification if exists
      if (persistentNotificationId.value) {
        // Notifications auto-close, but we'll track the ID
      }

      const notification = new Notification('Pomodoro Timer', {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `pomodoro-${props.widget.id}`, // Use tag to replace existing notification
        requireInteraction: false, // Allow it to be persistent but not annoying
        silent: true, // Don't make sound on updates
      })

      persistentNotificationId.value = notification.tag || null

      // Auto-close after a short time to avoid clutter
      setTimeout(() => {
        notification.close()
      }, 3000)
    } catch (e) {
      console.debug('Could not create persistent notification:', e)
    }
  }
}

// Request wake lock to keep screen on
const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen')
      console.log('Wake Lock acquired')

      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock released')
      })
    } catch (e) {
      console.debug('Could not acquire wake lock:', e)
    }
  }
}

// Release wake lock
const releaseWakeLock = async () => {
  if (wakeLock !== null) {
    try {
      await wakeLock.release()
      wakeLock = null
    } catch (e) {
      console.debug('Could not release wake lock:', e)
    }
  }
}

// Switch timer type manually
const switchTimerType = (type: TimerType) => {
  if (isRunning.value) {
    pauseTimer()
  }
  timerType.value = type
  timeRemaining.value = getDefaultDuration(type)
  saveState()
}

onMounted(() => {
  loadState()
  requestNotificationPermission()

  // If timer was running, restart it and register in the global bar
  if (
    isRunning.value &&
    !isPaused.value &&
    startTimestamp.value &&
    timeRemainingAtStart.value !== null
  ) {
    startTimer()
  }
})

onUnmounted(() => {
  // Only clear the interval, but keep the timer registered
  // so it shows in the active timers bar even when switching panes
  if (intervalId.value) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }
  // Release wake lock and clear badge on unmount
  releaseWakeLock()
  clearAppBadge()
})
</script>

<template>
  <div class="pomodoro-widget">
    <div class="pomodoro-header">
      <div class="timer-label">{{ timerLabel }}</div>
      <div class="completed-count">
        <Coffee :size="14" />
        <span>{{ completedPomodoros }}</span>
      </div>
    </div>

    <div class="timer-display">
      <div class="time">{{ formattedTime }}</div>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
      </div>
    </div>

    <div class="timer-controls">
      <button
        v-if="!isRunning"
        @click="startTimer"
        class="control-button start-button"
        title="Start"
      >
        <Play :size="18" />
      </button>
      <button v-else @click="pauseTimer" class="control-button pause-button" title="Pause">
        <Pause :size="18" />
      </button>
      <button @click="resetTimer" class="control-button reset-button" title="Reset">
        <RotateCcw :size="18" />
      </button>
    </div>

    <div class="timer-type-selector">
      <button
        @click="switchTimerType('work')"
        :class="['type-button', { active: timerType === 'work' }]"
        title="Focus Time (25 min)"
      >
        Work
      </button>
      <button
        @click="switchTimerType('shortBreak')"
        :class="['type-button', { active: timerType === 'shortBreak' }]"
        title="Short Break (5 min)"
      >
        Break
      </button>
      <button
        @click="switchTimerType('longBreak')"
        :class="['type-button', { active: timerType === 'longBreak' }]"
        title="Long Break (15 min)"
      >
        Long
      </button>
    </div>
  </div>
</template>

<style scoped>
.pomodoro-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  padding: 8px;
}

.pomodoro-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 8px;
}

.timer-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.completed-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.timer-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.time {
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  letter-spacing: 2px;
}

.progress-bar-container {
  width: 100%;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1 0%, #4f46e5 100%);
  border-radius: 3px;
  transition: width 1s linear;
}

.timer-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.control-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
}

.start-button {
  background: linear-gradient(135deg, #22c55e 0%, #15803d 100%);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

.start-button:hover {
  background: linear-gradient(135deg, #16a34a 0%, #166534 100%);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.pause-button {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.pause-button:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.reset-button {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
}

.reset-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  transform: scale(1.05);
}

.timer-type-selector {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 0 8px;
}

.type-button {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.type-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border-color: transparent;
}

.type-button.active:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
}
</style>
