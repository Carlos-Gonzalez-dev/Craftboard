<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { X, Check, Plus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { usePanes } from '../composables/usePanes'
import { PANE_KEYS, keyboardShortcutsEnabled } from '../composables/useKeyboardShortcuts'

const { panes, activePaneId, switchPane, savePanes } = usePanes()

const editingPaneId = ref<string | null>(null)
const editingPaneName = ref('')
const paneTabsContainer = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const draggedPaneId = ref<string | null>(null)
const dragOverPaneId = ref<string | null>(null)

const emit = defineEmits<{
  'create-pane': []
}>()

const startEditingPane = (paneId: string) => {
  const pane = panes.value.find((p) => p.id === paneId)
  if (pane) {
    editingPaneId.value = paneId
    editingPaneName.value = pane.name
  }
}

const savePaneName = (paneId: string) => {
  const pane = panes.value.find((p) => p.id === paneId)
  if (pane && editingPaneName.value.trim()) {
    pane.name = editingPaneName.value.trim()
    savePanes()
  }
  editingPaneId.value = null
  editingPaneName.value = ''
}

const cancelEditingPane = () => {
  editingPaneId.value = null
  editingPaneName.value = ''
}

const handlePaneDoubleClick = (paneId: string, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  startEditingPane(paneId)
}

const deletePane = (paneId: string) => {
  if (panes.value.length === 1) {
    alert('Cannot delete the last pane')
    return
  }

  if (confirm('Are you sure you want to delete this pane and all its widgets?')) {
    const index = panes.value.findIndex((p) => p.id === paneId)
    if (index !== -1) {
      panes.value.splice(index, 1)
      if (activePaneId.value === paneId) {
        activePaneId.value = panes.value[0]?.id || ''
      }
      savePanes()
    }
  }
}

const checkScrollButtons = () => {
  if (!paneTabsContainer.value) return

  const { scrollLeft, scrollWidth, clientWidth } = paneTabsContainer.value
  canScrollLeft.value = scrollLeft > 0
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1
}

const scrollPanesLeft = () => {
  if (paneTabsContainer.value) {
    paneTabsContainer.value.scrollBy({ left: -200, behavior: 'smooth' })
  }
}

const scrollPanesRight = () => {
  if (paneTabsContainer.value) {
    paneTabsContainer.value.scrollBy({ left: 200, behavior: 'smooth' })
  }
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      checkScrollButtons()
      if (paneTabsContainer.value) {
        paneTabsContainer.value.addEventListener('scroll', checkScrollButtons)
        window.addEventListener('resize', checkScrollButtons)
      }
    }, 100)
  })
})

watch(
  () => panes.value.length,
  () => {
    nextTick(() => {
      setTimeout(() => {
        checkScrollButtons()
      }, 100)
    })
  },
)

// Drag and drop handlers
const handleDragStart = (paneId: string, event: DragEvent) => {
  draggedPaneId.value = paneId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', paneId)
  }
}

const handleDragOver = (paneId: string, event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  if (draggedPaneId.value && draggedPaneId.value !== paneId) {
    dragOverPaneId.value = paneId
  }
}

const handleDragLeave = () => {
  dragOverPaneId.value = null
}

const handleDrop = (targetPaneId: string, event: DragEvent) => {
  event.preventDefault()
  dragOverPaneId.value = null

  if (!draggedPaneId.value || draggedPaneId.value === targetPaneId) {
    draggedPaneId.value = null
    return
  }

  const draggedIndex = panes.value.findIndex((p) => p.id === draggedPaneId.value)
  const targetIndex = panes.value.findIndex((p) => p.id === targetPaneId)

  if (draggedIndex !== -1 && targetIndex !== -1) {
    // Reorder panes
    const [draggedPane] = panes.value.splice(draggedIndex, 1)
    panes.value.splice(targetIndex, 0, draggedPane)
    savePanes()
  }

  draggedPaneId.value = null
}

const handleDragEnd = () => {
  draggedPaneId.value = null
  dragOverPaneId.value = null
}
</script>

<template>
  <div class="pane-tabs-wrapper">
    <button
      v-if="canScrollLeft"
      @click="scrollPanesLeft"
      class="pane-scroll-button pane-scroll-left"
      title="Scroll left"
    >
      <ChevronLeft :size="16" />
    </button>
    <div ref="paneTabsContainer" class="pane-tabs-container">
      <div
        v-for="(pane, index) in panes"
        :key="pane.id"
        :class="[
          'pane-tab-wrapper',
          {
            active: pane.id === activePaneId,
            dragging: draggedPaneId === pane.id,
            'drag-over': dragOverPaneId === pane.id,
          },
        ]"
        :draggable="editingPaneId !== pane.id"
        @dragstart="handleDragStart(pane.id, $event)"
        @dragover="handleDragOver(pane.id, $event)"
        @dragleave="handleDragLeave"
        @drop="handleDrop(pane.id, $event)"
        @dragend="handleDragEnd"
      >
        <button
          v-if="editingPaneId !== pane.id"
          @click="switchPane(pane.id)"
          @dblclick="handlePaneDoubleClick(pane.id, $event)"
          :class="['pane-tab', { active: pane.id === activePaneId }]"
          title="Double-click to rename"
        >
          <span v-if="keyboardShortcutsEnabled && index < PANE_KEYS.length" class="pane-shortcut">
            {{ PANE_KEYS[index] }}
          </span>
          <span class="pane-name">{{ pane.name }}</span>
          <div class="pane-actions">
            <button
              v-if="panes.length > 1"
              @click.stop="deletePane(pane.id)"
              class="pane-action-button delete-button"
              title="Delete pane"
            >
              <X :size="12" />
            </button>
          </div>
        </button>
        <div v-else class="pane-edit-form">
          <input
            v-model="editingPaneName"
            @keyup.enter="savePaneName(pane.id)"
            @keyup.esc="cancelEditingPane"
            @blur="savePaneName(pane.id)"
            class="pane-edit-input"
            type="text"
            autofocus
          />
          <button
            @click="savePaneName(pane.id)"
            class="pane-action-button save-button"
            title="Save"
          >
            <Check :size="12" />
          </button>
          <button
            @click="cancelEditingPane"
            class="pane-action-button cancel-edit-button"
            title="Cancel"
          >
            <X :size="12" />
          </button>
        </div>
      </div>
      <button @click="$emit('create-pane')" class="add-pane-tab">
        <Plus :size="14" />
        <span>New</span>
      </button>
    </div>
    <button
      v-if="canScrollRight"
      @click="scrollPanesRight"
      class="pane-scroll-button pane-scroll-right"
      title="Scroll right"
    >
      <ChevronRight :size="16" />
    </button>
  </div>
</template>

<style scoped>
.pane-tabs-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
}

.pane-tabs-container {
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

.pane-tabs-container::-webkit-scrollbar {
  display: none;
}

.pane-scroll-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pane-scroll-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.pane-scroll-button:active {
  transform: scale(0.95);
}

.pane-tab-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.pane-tab-wrapper:not(:last-child) {
  margin-right: 2px;
}

.pane-tab {
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

.pane-tab-wrapper.dragging {
  opacity: 0.5;
}

.pane-tab-wrapper.drag-over {
  position: relative;
}

.pane-tab-wrapper.drag-over::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #6366f1;
  border-radius: 2px;
  z-index: 1;
}

.pane-tab-wrapper[draggable='true'] {
  cursor: grab;
}

.pane-tab-wrapper[draggable='true']:active {
  cursor: grabbing;
}

.pane-tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.pane-tab.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
  font-weight: 600;
}

.pane-tab.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.pane-shortcut {
  font-size: 8px;
  opacity: 0.4;
  font-weight: 700;
  text-transform: uppercase;
  min-width: 10px;
  text-align: center;
}

.pane-tab.active .pane-shortcut {
  opacity: 0.7;
}

.pane-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pane-tab:hover .pane-actions,
.pane-tab.active .pane-actions {
  opacity: 1;
}

.pane-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  color: inherit;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pane-action-button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.pane-action-button.delete-button:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.pane-edit-form {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
}

.pane-edit-input {
  flex: 1;
  min-width: 80px;
  padding: 4px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
}

.pane-edit-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.add-pane-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
  margin-left: 2px;
}

.add-pane-tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
</style>
