<script setup lang="ts">
defineProps<{
  title?: string
  disabled?: boolean
}>()

defineSlots<{
  default?: () => any
}>()
</script>

<template>
  <button
    :disabled="disabled"
    :title="title"
    class="subheader-button"
    :class="{ disabled: disabled }"
  >
    <slot />
  </button>
</template>

<style scoped>
.subheader-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.subheader-button:hover:not(.disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.subheader-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
