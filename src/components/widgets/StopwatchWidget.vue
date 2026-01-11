<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Play, Pause, RotateCcw } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { usePanes } from '../../composables/usePanes'
import { useActiveTimers } from '../../composables/useActiveTimers'
import type { Widget } from '../../types/widget'

const props = defineProps<{
  widget: Widget
}>()

const route = useRoute()
const { activePaneId } = usePanes()
const { registerTimer, unregisterTimer, updateTimer, getTimer } = useActiveTimers()

const elapsed = ref(0) // in milliseconds
const isRunning = ref(false)
let interval: number | undefined
let startTimestamp = 0

const widgetDisplayName = computed(() => props.widget.title || props.widget.name || 'Stopwatch')

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

const start = () => {
  isRunning.value = true
  startTimestamp = Date.now()
  const startTime = Date.now() - elapsed.value

  // Register in active timers bar
  const elapsedSeconds = Math.floor(elapsed.value / 1000)
  registerTimer({
    id: props.widget.id,
    widgetName: widgetDisplayName.value,
    timeRemaining: elapsedSeconds,
    totalDuration: 60, // For progress bar (1 minute cycle)
    isRunning: true,
    isCompleted: false,
    timerType: 'stopwatch',
    route: route.path,
    paneId: activePaneId.value,
    startTimestamp: startTimestamp,
    timeRemainingAtStart: 0,
    elapsedAtStart: elapsedSeconds,
    color: props.widget.color,
    icon: 'stopwatch',
  })

  interval = window.setInterval(() => {
    elapsed.value = Date.now() - startTime

    // Sync with global timer
    const globalTimer = getTimer(props.widget.id)
    if (globalTimer) {
      elapsed.value = globalTimer.timeRemaining * 1000
    }
  }, 10) // Update every 10ms for smooth display

  saveState()
}

const pause = () => {
  isRunning.value = false
  if (interval) {
    clearInterval(interval)
    interval = undefined
  }

  // Update timer state but keep it in the bar
  const elapsedSeconds = Math.floor(elapsed.value / 1000)
  updateTimer(props.widget.id, {
    isRunning: false,
    timeRemaining: elapsedSeconds,
    elapsedAtStart: elapsedSeconds,
  })

  saveState()
}

const reset = () => {
  isRunning.value = false
  elapsed.value = 0
  if (interval) {
    clearInterval(interval)
    interval = undefined
  }

  // Remove from active timers bar
  unregisterTimer(props.widget.id)

  saveState()
}

const toggle = () => {
  if (isRunning.value) {
    pause()
  } else {
    start()
  }
}

const saveState = () => {
  const state = {
    elapsed: elapsed.value,
    isRunning: isRunning.value,
    timestamp: Date.now(), // Save current timestamp instead of startTimestamp
  }
  localStorage.setItem(`stopwatch-${props.widget.id}`, JSON.stringify(state))
}

const loadState = () => {
  const saved = localStorage.getItem(`stopwatch-${props.widget.id}`)
  if (saved) {
    try {
      const state = JSON.parse(saved)

      if (state.isRunning && state.timestamp) {
        // Calculate elapsed time including time since last save
        const timeSinceLastSave = Date.now() - state.timestamp
        elapsed.value = (state.elapsed || 0) + timeSinceLastSave
        isRunning.value = true
      } else {
        elapsed.value = state.elapsed || 0
        isRunning.value = false
      }
    } catch (e) {
      console.error('Failed to load stopwatch state:', e)
    }
  }
}

onMounted(() => {
  loadState()

  // If was running, restart with current elapsed time
  if (isRunning.value) {
    start()
  }
})

onUnmounted(() => {
  if (interval) {
    clearInterval(interval)
  }
  // Keep timer in bar when switching views
})
</script>

<template>
  <div class="stopwatch-widget">
    <div class="time-display">{{ formatTime(elapsed) }}</div>
    <div class="controls">
      <button v-if="!isRunning" @click="toggle" class="control-button start-button" title="Start">
        <Play :size="18" />
      </button>
      <button v-else @click="toggle" class="control-button pause-button" title="Pause">
        <Pause :size="18" />
      </button>
      <button
        @click="reset"
        class="control-button reset-button"
        title="Reset"
        :disabled="elapsed === 0 || isRunning"
      >
        <RotateCcw :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.stopwatch-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 24px;
}

.time-display {
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  letter-spacing: 2px;
}

.controls {
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

.reset-button:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  transform: scale(1.05);
}

.reset-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
