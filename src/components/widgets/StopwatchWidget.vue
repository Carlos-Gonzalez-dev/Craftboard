<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Play, Pause, RotateCcw } from 'lucide-vue-next'

const elapsed = ref(0) // in milliseconds
const isRunning = ref(false)
let interval: number | undefined

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
  const startTime = Date.now() - elapsed.value
  interval = window.setInterval(() => {
    elapsed.value = Date.now() - startTime
  }, 10) // Update every 10ms for smooth display
}

const pause = () => {
  isRunning.value = false
  if (interval) {
    clearInterval(interval)
    interval = undefined
  }
}

const reset = () => {
  isRunning.value = false
  elapsed.value = 0
  if (interval) {
    clearInterval(interval)
    interval = undefined
  }
}

const toggle = () => {
  if (isRunning.value) {
    pause()
  } else {
    start()
  }
}

onUnmounted(() => {
  if (interval) {
    clearInterval(interval)
  }
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
      <button @click="reset" class="control-button reset-button" title="Reset" :disabled="elapsed === 0">
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

