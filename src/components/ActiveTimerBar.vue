<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink, X, CheckCircle, Timer, TimerReset } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { usePanes } from '../composables/usePanes'
import { useActiveTimers } from '../composables/useActiveTimers'
import type { ActiveTimer } from '../composables/useActiveTimers'

const props = defineProps<{
  timer: ActiveTimer
}>()

const router = useRouter()
const { switchPane } = usePanes()
const { unregisterTimer } = useActiveTimers()

const formattedTime = computed(() => {
  if (props.timer.timerType === 'stopwatch') {
    // For stopwatch, show total elapsed time
    const totalSeconds = props.timer.timeRemaining
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  
  // Countdown timer
  const minutes = Math.floor(props.timer.timeRemaining / 60)
  const seconds = props.timer.timeRemaining % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const progressPercentage = computed(() => {
  if (props.timer.isCompleted) return 100
  
  if (props.timer.timerType === 'stopwatch') {
    // For stopwatch, progress fills every minute (0-60 seconds)
    const secondsInCurrentMinute = props.timer.timeRemaining % 60
    return (secondsInCurrentMinute / 60) * 100
  }
  
  // Countdown timer
  if (props.timer.totalDuration === 0) return 0
  return ((props.timer.totalDuration - props.timer.timeRemaining) / props.timer.totalDuration) * 100
})

const navigateToTimer = async () => {
  if (props.timer.route) {
    await router.push(props.timer.route)
    // If timer has a paneId and we're on dashboard, switch to that pane
    if (props.timer.paneId && props.timer.route === '/') {
      switchPane(props.timer.paneId)
    }
  }
}

const timerLabel = computed(() => {
  if (props.timer.timerType) {
    return `${props.timer.widgetName} - ${props.timer.timerType}`
  }
  return props.timer.widgetName
})

const dismissTimer = () => {
  unregisterTimer(props.timer.id)
}

const widgetIcon = computed(() => {
  return props.timer.icon === 'stopwatch' ? TimerReset : Timer
})
</script>

<template>
  <div
    class="active-timer-bar"
    :class="{ 'is-running': timer.isRunning, 'is-completed': timer.isCompleted }"
  >
    <div
      class="timer-progress-bg"
      :style="{ 
        width: `${progressPercentage}%`,
        background: timer.isCompleted ? undefined : timer.color 
      }"
      :class="{ 'completed-bg': timer.isCompleted }"
    ></div>
    <div class="timer-content">
      <div class="timer-info">
        <component 
          :is="timer.isCompleted ? CheckCircle : widgetIcon" 
          :size="18" 
          :class="timer.isCompleted ? 'completed-icon' : 'widget-icon'"
          :style="{ color: timer.isCompleted ? undefined : timer.color }"
        />
        <span class="timer-name" :class="{ 'completed-text': timer.isCompleted }">
          {{ timer.isCompleted ? '✓ ' : '' }}{{ timerLabel }}
        </span>
        <span class="timer-time" :class="{ 'completed-text': timer.isCompleted }">
          {{ timer.isCompleted ? 'Completed!' : formattedTime }}
        </span>
      </div>
      <div class="timer-buttons">
        <button
          v-if="timer.route && !timer.isCompleted"
          @click="navigateToTimer"
          class="timer-nav-button"
          title="Go to timer"
        >
          <ExternalLink :size="14" />
        </button>
        <button
          v-if="timer.isCompleted"
          @click="dismissTimer"
          class="timer-dismiss-button"
          title="Dismiss"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.active-timer-bar {
  position: relative;
  width: 100%;
  height: 40px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  overflow: hidden;
}

.timer-progress-bg {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.25) 100%);
  transition: width 1s linear;
  z-index: 0;
}

.active-timer-bar.is-running .timer-progress-bg {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.3) 100%);
}

.active-timer-bar.is-completed {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.15) 100%);
  animation: pulse-complete 2s ease-in-out infinite;
  border-bottom-color: rgba(34, 197, 94, 0.5);
}

@keyframes pulse-complete {
  0%,
  100% {
    background: linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.15) 100%);
  }
  50% {
    background: linear-gradient(90deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.25) 100%);
  }
}

.timer-progress-bg.completed-bg {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.4) 100%);
}

.timer-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
}

.timer-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.completed-icon {
  color: #22c55e;
  animation: bounce-in 0.5s ease-out;
}

.widget-icon {
  opacity: 0.9;
  transition: opacity 0.2s ease;
}

@keyframes bounce-in {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.timer-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timer-name.completed-text {
  color: #22c55e;
  font-weight: 700;
}

.timer-time {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  letter-spacing: 1px;
}

.timer-time.completed-text {
  color: #22c55e;
  font-weight: 700;
  animation: pulse-text 1.5s ease-in-out infinite;
}

@keyframes pulse-text {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.timer-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.timer-nav-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.timer-nav-button:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--btn-primary-bg);
}

.timer-dismiss-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

.timer-dismiss-button:hover {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

@media (max-width: 640px) {
  .timer-name {
    font-size: 11px;
  }

  .timer-time {
    font-size: 14px;
  }

  .timer-content {
    padding: 0 12px;
  }

  .timer-info {
    gap: 12px;
  }
}
</style>
