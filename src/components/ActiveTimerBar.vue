<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { usePanes } from '../composables/usePanes'
import type { ActiveTimer } from '../composables/useActiveTimers'

const props = defineProps<{
  timer: ActiveTimer
}>()

const router = useRouter()
const { switchPane } = usePanes()

const formattedTime = computed(() => {
  const minutes = Math.floor(props.timer.timeRemaining / 60)
  const seconds = props.timer.timeRemaining % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const progressPercentage = computed(() => {
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
</script>

<template>
  <div class="active-timer-bar" :class="{ 'is-running': timer.isRunning }">
    <div class="timer-progress-bg" :style="{ width: `${progressPercentage}%` }"></div>
    <div class="timer-content">
      <div class="timer-info">
        <span class="timer-name">{{ timerLabel }}</span>
        <span class="timer-time">{{ formattedTime }}</span>
      </div>
      <button
        v-if="timer.route"
        @click="navigateToTimer"
        class="timer-nav-button"
        title="Go to timer"
      >
        <ExternalLink :size="14" />
      </button>
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

.timer-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timer-time {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  letter-spacing: 1px;
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
