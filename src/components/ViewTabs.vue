<script setup lang="ts">
defineProps<{
  tabs: Array<{ id: string; label: string; icon?: any; disabled?: boolean; isProject?: boolean }>
  activeTab: string
}>()

defineEmits<{
  'update:activeTab': [value: string]
}>()
</script>

<template>
  <div class="view-tabs-container">
    <div class="view-tabs">
      <template v-for="(tab, index) in tabs" :key="tab.id">
        <!-- Separator before first non-project tab -->
        <div
          v-if="index > 0 && tab.isProject === false && tabs[index - 1]?.isProject === true"
          class="tabs-separator"
        ></div>
        <button
          @click="!tab.disabled && $emit('update:activeTab', tab.id)"
          :class="['view-tab', { active: activeTab === tab.id, disabled: tab.disabled }]"
          :disabled="tab.disabled"
        >
          <component v-if="tab.icon" :is="tab.icon" :size="14" />
          <span>{{ tab.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.view-tabs-container {
  display: inline-flex;
  gap: 0;
  position: relative;
}

.view-tabs {
  display: inline-flex;
  gap: 0;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  align-items: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
}

.view-tabs::-webkit-scrollbar {
  display: none;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  user-select: none;
  min-width: 60px;
}

.view-tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.view-tab.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
  font-weight: 600;
}

.view-tab.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.view-tab.disabled,
.view-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.tabs-separator {
  width: 1px;
  height: 20px;
  background: var(--border-primary);
  margin: 0 4px;
  align-self: center;
}
</style>
