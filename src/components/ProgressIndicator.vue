<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  completed: number
  total: number
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: 'Loading...',
})

const progressPercentage = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.completed / props.total) * 100)
})
</script>

<template>
  <div class="progress-indicator">
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: progressPercentage + '%' }"></div>
    </div>
    <p class="progress-text">
      {{ message }}...
      <span v-if="progressPercentage > 0">{{ progressPercentage }}%</span>
    </p>
  </div>
</template>

<style scoped>
.progress-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 300px;
  max-width: 500px;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1 0%, #4f46e5 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
}

.progress-text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>
