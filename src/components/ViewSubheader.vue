<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

defineProps<{
  showRight?: boolean
}>()

defineSlots<{
  default?: () => any
  right?: () => any
}>()

const leftContainer = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const checkScrollButtons = () => {
  if (!leftContainer.value) return

  const { scrollLeft, scrollWidth, clientWidth } = leftContainer.value
  canScrollLeft.value = scrollLeft > 0
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1
}

const scrollLeft = () => {
  if (leftContainer.value) {
    leftContainer.value.scrollBy({ left: -200, behavior: 'smooth' })
  }
}

const scrollRight = () => {
  if (leftContainer.value) {
    leftContainer.value.scrollBy({ left: 200, behavior: 'smooth' })
  }
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      checkScrollButtons()
      if (leftContainer.value) {
        leftContainer.value.addEventListener('scroll', checkScrollButtons)
        window.addEventListener('resize', checkScrollButtons)
      }
    }, 100)
  })
})

onUnmounted(() => {
  if (leftContainer.value) {
    leftContainer.value.removeEventListener('scroll', checkScrollButtons)
    window.removeEventListener('resize', checkScrollButtons)
  }
})
</script>

<template>
  <div class="view-subheader">
    <div ref="leftContainer" class="view-subheader-left">
      <button
        v-if="canScrollLeft"
        @click="scrollLeft"
        class="subheader-scroll-button subheader-scroll-left"
        title="Scroll left"
      >
        <ChevronLeft :size="16" />
      </button>
      <slot />
      <button
        v-if="canScrollRight"
        @click="scrollRight"
        class="subheader-scroll-button subheader-scroll-right"
        title="Scroll right"
      >
        <ChevronRight :size="16" />
      </button>
    </div>
    <div v-if="showRight || $slots.right" class="view-subheader-right">
      <slot name="right" />
    </div>
  </div>
</template>

<style scoped>
.view-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  background: transparent;
  border-bottom: none;
  flex-shrink: 0;
  min-height: 40px;
  position: relative;
}

@media (max-width: 768px) {
  .view-subheader {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .view-subheader-right {
    order: 2;
    justify-content: flex-start;
    width: 100%;
    flex-direction: row;
    gap: 8px;
  }
}

.view-subheader-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
  scroll-behavior: smooth;
  position: relative;
}

.view-subheader-left::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

.subheader-scroll-button {
  position: sticky;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 5;
}

.subheader-scroll-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.subheader-scroll-left {
  left: 0;
}

.subheader-scroll-right {
  right: 0;
}

.view-subheader-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
}
</style>
