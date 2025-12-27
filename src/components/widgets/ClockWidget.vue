<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const currentTime = ref(new Date())
let interval: number | undefined

const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const formatSeconds = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
    second: '2-digit',
    hour12: false,
  })
}

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

const formatWeekAndYear = (date: Date) => {
  const weekNumber = getWeekNumber(date)
  const year = date.getFullYear()
  return `Week ${weekNumber}, ${year}`
}

onMounted(() => {
  interval = window.setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (interval) {
    clearInterval(interval)
  }
})
</script>

<template>
  <div class="clock-widget">
    <div class="clock-display">
      <div class="time">{{ formatTime(currentTime) }}:{{ formatSeconds(currentTime) }}</div>
    </div>
    <div class="date">{{ formatDate(currentTime) }}</div>
    <div class="week-year">{{ formatWeekAndYear(currentTime) }}</div>
  </div>
</template>

<style scoped>
.clock-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  padding: 8px;
}

.clock-display {
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

.date {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.week-year {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-align: center;
  letter-spacing: 0.5px;
}
</style>
