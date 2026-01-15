<script setup lang="ts">
import { computed } from 'vue'
import { useGlobalLoadingStore } from '../stores/globalLoading'

const globalLoadingStore = useGlobalLoadingStore()
const isLoading = computed(() => globalLoadingStore.isLoading)
</script>

<template>
  <div class="global-progress-bar-container" :class="{ visible: isLoading }">
    <div class="global-progress-bar"></div>
  </div>
</template>

<style scoped>
.global-progress-bar-container {
  position: relative;
  width: 100%;
  height: 3px;
  background: transparent;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.global-progress-bar-container.visible {
  opacity: 1;
}

.global-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 30%,
    rgba(168, 85, 247, 0.6) 45%,
    rgba(99, 102, 241, 0.8) 50%,
    rgba(168, 85, 247, 0.6) 55%,
    transparent 70%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 4s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Mobile */
@media (max-width: 768px) {
  .global-progress-bar-container {
    height: 2px;
  }
}
</style>
