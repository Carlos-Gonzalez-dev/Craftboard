<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import MarkdownWidget from './MarkdownWidget.vue'
import ClockWidget from './ClockWidget.vue'
import StopwatchWidget from './StopwatchWidget.vue'
import NotesWidget from './NotesWidget.vue'
import CollectionWidget from './CollectionWidget.vue'
import DailyNoteWidget from './DailyNoteWidget.vue'
import PinBlockWidget from './PinBlockWidget.vue'
import PinUrlWidget from './PinUrlWidget.vue'
import WorkspaceStatsWidget from './WorkspaceStatsWidget.vue'
import TaskStatsWidget from './TaskStatsWidget.vue'
import CollectionChartWidget from './CollectionChartWidget.vue'
import GraphWidget from './GraphWidget.vue'
import BookmarkWidget from './BookmarkWidget.vue'
import QuoteWidget from './QuoteWidget.vue'
import RSSWidget from './RSSWidget.vue'
import PomodoroTimerWidget from './PomodoroTimerWidget.vue'
import DocumentTasksWidget from './DocumentTasksWidget.vue'
import IframeWidget from './IframeWidget.vue'
import {
  X,
  GripVertical,
  Pencil,
  Check,
  Palette,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  FileText,
  Clock,
  CheckSquare,
  Library,
  Calendar,
  Pin,
  Link as LinkIcon,
  ExternalLink,
  BarChart3,
  Network,
  Lock,
  Bookmark,
  Quote,
  Rss,
  Timer,
  TimerReset,
  Monitor,
} from 'lucide-vue-next'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  remove: []
  'update:title': [title: string]
  'update:color': [color: string]
  'update:data': [data: any]
  'toggle-drag': [enabled: boolean]
}>()

const isFullscreen = ref(false)

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  showButtons.value = false
}

const HEADER_COLORS = [
  {
    name: 'Indigo',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    darkGradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  },
  {
    name: 'Purple',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    darkGradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  },
  {
    name: 'Pink',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    darkGradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
  },
  {
    name: 'Rose',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
    darkGradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
  },
  {
    name: 'Orange',
    gradient: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
    darkGradient: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
  },
  {
    name: 'Amber',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
    darkGradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
  },
  {
    name: 'Green',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
    darkGradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
  },
  {
    name: 'Teal',
    gradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
    darkGradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
  },
  {
    name: 'Cyan',
    gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
    darkGradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
  },
  {
    name: 'Blue',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    darkGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  },
  {
    name: 'Violet',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    darkGradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  },
  {
    name: 'Fuchsia',
    gradient: 'linear-gradient(135deg, #d946ef 0%, #a21caf 100%)',
    darkGradient: 'linear-gradient(135deg, #d946ef 0%, #a21caf 100%)',
  },
]

const isEditingTitle = ref(false)
const editedTitle = ref(props.widget.title)
const showColorPicker = ref(false)
const showButtons = ref(false)

const isDarkMode = ref(document.documentElement.getAttribute('data-theme') === 'dark')

// Watch for theme changes
const observer = new MutationObserver(() => {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark'
})

observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
})

const headerStyle = computed(() => {
  if (!props.widget.color) {
    const defaultColor = HEADER_COLORS[0]!
    return {
      background: isDarkMode.value ? defaultColor.darkGradient : defaultColor.gradient,
    }
  }

  // Find the matching color and use dark variant if in dark mode
  const matchingColor = HEADER_COLORS.find((c) => c.gradient === props.widget.color)
  if (matchingColor && isDarkMode.value) {
    return { background: matchingColor.darkGradient }
  }

  return { background: props.widget.color }
})

// Extract color from gradient for compact view border
const getBorderColor = (gradient: string): string => {
  // Extract first color from gradient string
  // Format: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)
  const match = gradient.match(/#[0-9a-fA-F]{6}/)
  return match ? match[0] : '#6366f1' // Default to indigo if not found
}

const compactBorderStyle = computed(() => {
  const defaultColor = HEADER_COLORS[0]!
  const color =
    props.widget.color || (isDarkMode.value ? defaultColor.darkGradient : defaultColor.gradient)
  const borderColor = getBorderColor(color)
  return {
    borderTopColor: borderColor,
    borderTopWidth: '3px',
    borderTopStyle: 'solid' as const,
  }
})

const startEditTitle = () => {
  editedTitle.value = props.widget.title
  isEditingTitle.value = true
  showButtons.value = false
  setTimeout(() => {
    const input = document.querySelector('.title-input') as HTMLInputElement
    input?.focus()
    input?.select()
  }, 0)
}

const saveTitle = () => {
  if (editedTitle.value.trim()) {
    emit('update:title', editedTitle.value.trim())
  } else {
    editedTitle.value = props.widget.title
  }
  isEditingTitle.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    saveTitle()
  } else if (e.key === 'Escape') {
    editedTitle.value = props.widget.title
    isEditingTitle.value = false
  }
}

const toggleButtons = () => {
  showButtons.value = !showButtons.value
  if (!showButtons.value) {
    showColorPicker.value = false
  }
}

const toggleColorPicker = () => {
  showColorPicker.value = !showColorPicker.value
}

const selectColor = (gradient: string) => {
  emit('update:color', gradient)
  showColorPicker.value = false
}

const handleRemove = () => {
  if (confirm(`Are you sure you want to delete "${props.widget.title}"?`)) {
    emit('remove')
  }
}

const handleDataUpdate = (data: any) => {
  emit('update:data', data)
}

const handleTitleUpdate = (title: string) => {
  emit('update:title', title)
}

const getWidgetIcon = (type: Widget['type']) => {
  switch (type) {
    case 'markdown':
      return FileText
    case 'clock':
      return Clock
    case 'stopwatch':
      return TimerReset
    case 'notes':
      return CheckSquare
    case 'collection':
      return Library
    case 'daily-note':
      return Calendar
    case 'pin-block':
      return LinkIcon
    case 'pin-url':
      return ExternalLink
    case 'stats':
      return BarChart3
    case 'task-stats':
      return CheckSquare
    case 'collection-chart':
      return Library
    case 'graph':
      return Network
    case 'bookmark':
      return Bookmark
    case 'quote':
      return Quote
    case 'rss':
      return Rss
    case 'pomodoro':
      return Timer
    case 'document-tasks':
      return CheckSquare
    default:
      return FileText
  }
}

const widgetIcon = computed(() => getWidgetIcon(props.widget.type))

// Track if dragging is enabled for this widget (default true, or from widget.data)
const isDraggingEnabled = ref(props.widget.data?.draggingEnabled !== false)

// Watch for changes to widget.data.draggingEnabled
watch(
  () => props.widget.data?.draggingEnabled,
  (newValue) => {
    isDraggingEnabled.value = newValue !== false
  },
)

const toggleDragging = (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  isDraggingEnabled.value = !isDraggingEnabled.value
  emit('update:data', {
    ...props.widget.data,
    draggingEnabled: isDraggingEnabled.value,
  })
  emit('toggle-drag', isDraggingEnabled.value)
}

// Widget view mode
const { isCompactView } = useWidgetView()
</script>

<template>
  <div
    class="widget-container"
    :class="{
      fullscreen: isFullscreen && false,
      'compact-view': isCompactView,
    }"
    :style="isCompactView ? compactBorderStyle : {}"
  >
    <div
      v-if="!isCompactView"
      class="widget-header"
      :class="{ draggable: isDraggingEnabled }"
      :style="headerStyle"
      @dblclick="!isEditingTitle && toggleFullscreen()"
    >
      <div
        class="drag-handle"
        @click="toggleDragging"
        @dblclick.stop
        :title="isDraggingEnabled ? 'Disable dragging' : 'Enable dragging'"
      >
        <GripVertical v-if="isDraggingEnabled" :size="12" />
        <Lock v-else :size="12" />
      </div>

      <component :is="widgetIcon" :size="12" class="widget-type-icon" />

      <input
        v-if="isEditingTitle"
        v-model="editedTitle"
        @blur="saveTitle"
        @keydown="handleKeydown"
        @dblclick.stop
        class="title-input"
        type="text"
      />
      <span v-else class="widget-title">{{ widget.title }}</span>

      <div v-if="showButtons && !isEditingTitle" class="action-buttons" @dblclick.stop>
        <button
          @click="toggleFullscreen"
          @dblclick.stop
          class="edit-button"
          :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
        >
          <Maximize2 v-if="!isFullscreen" :size="14" />
          <Minimize2 v-else :size="14" />
        </button>
        <button @click="startEditTitle" @dblclick.stop class="edit-button" title="Edit title">
          <Pencil :size="14" />
        </button>
        <button @click="toggleColorPicker" @dblclick.stop class="edit-button" title="Change color">
          <Palette :size="14" />
        </button>
        <button @click="handleRemove" @dblclick.stop class="remove-button">
          <X :size="16" />
        </button>
      </div>

      <button
        v-if="isEditingTitle"
        @click="saveTitle"
        @dblclick.stop
        class="edit-button"
        title="Save title"
      >
        <Check :size="14" />
      </button>

      <button
        v-if="!isEditingTitle"
        @click="toggleButtons"
        @dblclick.stop
        class="menu-button"
        title="Menu"
      >
        <MoreHorizontal :size="16" />
      </button>

      <div v-if="showColorPicker" class="color-picker">
        <button
          v-for="color in HEADER_COLORS"
          :key="color.name"
          @click="selectColor(color.gradient)"
          :style="{ background: isDarkMode ? color.darkGradient : color.gradient }"
          :title="color.name"
          class="color-option"
        ></button>
      </div>
    </div>
    <div class="widget-content no-drag">
      <MarkdownWidget v-if="widget.type === 'markdown'" :widget="widget" />
      <ClockWidget v-else-if="widget.type === 'clock'" />
      <StopwatchWidget v-else-if="widget.type === 'stopwatch'" :widget="widget" />
      <NotesWidget v-else-if="widget.type === 'notes'" :widget="widget" />
      <CollectionWidget
        v-else-if="widget.type === 'collection'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <DailyNoteWidget
        v-else-if="widget.type === 'daily-note'"
        :widget="widget"
        @update:data="handleDataUpdate"
      />
      <PinBlockWidget
        v-else-if="widget.type === 'pin-block'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <PinUrlWidget
        v-else-if="widget.type === 'pin-url'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <WorkspaceStatsWidget
        v-else-if="widget.type === 'stats'"
        :widget="widget"
        @update:data="handleDataUpdate"
      />
      <TaskStatsWidget
        v-else-if="widget.type === 'task-stats'"
        :widget="widget"
        @update:data="handleDataUpdate"
      />
      <CollectionChartWidget
        v-else-if="widget.type === 'collection-chart'"
        :widget="widget"
        @update:data="handleDataUpdate"
      />
      <GraphWidget
        v-else-if="widget.type === 'graph'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <BookmarkWidget
        v-else-if="widget.type === 'bookmark'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <QuoteWidget
        v-else-if="widget.type === 'quote'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <RSSWidget
        v-else-if="widget.type === 'rss'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <PomodoroTimerWidget
        v-else-if="widget.type === 'pomodoro'"
        :widget="widget"
        @update:data="handleDataUpdate"
      />
      <DocumentTasksWidget
        v-else-if="widget.type === 'document-tasks'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
      <IframeWidget
        v-else-if="widget.type === 'iframe'"
        :widget="widget"
        @update:data="handleDataUpdate"
        @update:title="handleTitleUpdate"
      />
    </div>
    <div v-if="!isCompactView" class="widget-footer">
      <slot name="footer"></slot>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="isFullscreen" class="fullscreen-overlay">
      <div class="widget-container fullscreen">
        <div
          class="widget-header"
          :class="{ draggable: isDraggingEnabled }"
          :style="headerStyle"
          @dblclick="toggleFullscreen()"
        >
          <div
            class="drag-handle"
            @click="toggleDragging"
            @dblclick.stop
            :title="isDraggingEnabled ? 'Disable dragging' : 'Enable dragging'"
          >
            <GripVertical v-if="isDraggingEnabled" :size="12" />
            <Lock v-else :size="12" />
          </div>
          <component :is="widgetIcon" :size="12" class="widget-type-icon" />
          <span class="widget-title">{{ widget.title }}</span>

          <button
            @click="toggleFullscreen"
            @dblclick.stop
            class="edit-button"
            title="Exit fullscreen"
          >
            <Minimize2 :size="14" />
          </button>
        </div>
        <div class="widget-content no-drag">
          <MarkdownWidget v-if="widget.type === 'markdown'" :widget="widget" />
          <ClockWidget v-else-if="widget.type === 'clock'" />
          <StopwatchWidget v-else-if="widget.type === 'stopwatch'" :widget="widget" />
          <NotesWidget v-else-if="widget.type === 'notes'" :widget="widget" />
          <CollectionWidget
            v-else-if="widget.type === 'collection'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <DailyNoteWidget
            v-else-if="widget.type === 'daily-note'"
            :widget="widget"
            @update:data="handleDataUpdate"
          />
          <PinBlockWidget
            v-else-if="widget.type === 'pin-block'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <PinUrlWidget
            v-else-if="widget.type === 'pin-url'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <WorkspaceStatsWidget
            v-else-if="widget.type === 'stats'"
            :widget="widget"
            @update:data="handleDataUpdate"
          />
          <TaskStatsWidget
            v-else-if="widget.type === 'task-stats'"
            :widget="widget"
            @update:data="handleDataUpdate"
          />
          <CollectionChartWidget
            v-else-if="widget.type === 'collection-chart'"
            :widget="widget"
            @update:data="handleDataUpdate"
          />
          <GraphWidget
            v-else-if="widget.type === 'graph'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <BookmarkWidget
            v-else-if="widget.type === 'bookmark'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <QuoteWidget
            v-else-if="widget.type === 'quote'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <RSSWidget
            v-else-if="widget.type === 'rss'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <PomodoroTimerWidget
            v-else-if="widget.type === 'pomodoro'"
            :widget="widget"
            @update:data="handleDataUpdate"
          />
          <DocumentTasksWidget
            v-else-if="widget.type === 'document-tasks'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
          <IframeWidget
            v-else-if="widget.type === 'iframe'"
            :widget="widget"
            @update:data="handleDataUpdate"
            @update:title="handleTitleUpdate"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.widget-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--widget-bg);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: visible;
  pointer-events: auto;
  transition: all 0.25s ease;
  cursor: default;
}

.widget-container:hover {
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.3);
}

.widget-container.fullscreen {
  position: fixed;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  max-width: 100vw;
  max-height: 100vh;
  z-index: 9999;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  border-radius: 0;
  margin: 0;
  overflow: auto;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #475569;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 7px 7px 0 0;
  position: relative;
  cursor: default;
}

.widget-header.draggable {
  cursor: move;
}

.drag-handle {
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
  cursor: pointer;
}

.drag-handle:hover {
  color: rgba(255, 255, 255, 0.9);
}

.widget-type-icon {
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.widget-title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.title-input {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 3px 6px;
  outline: none;
  font-family: inherit;
}

.title-input:focus {
  border-color: var(--btn-primary-bg);
}

.edit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.menu-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.action-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.remove-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.remove-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.widget-content {
  flex: 1;
  overflow: auto;
  padding: 10px;
  background: var(--widget-bg);
  border-radius: 0 0 8px 8px;
  color: var(--text-primary);
  position: relative;
}

.widget-container.compact-view .widget-content {
  border-radius: 12px;
  padding: 8px;
}

.widget-container.compact-view {
  border-radius: 12px;
  border-top: 3px solid;
  /* border-top-color is set via inline style */
}

.widget-container.compact-view .widget-footer {
  display: none !important;
}

/* Hide all footers in compact view */
.widget-container.compact-view :deep(.widget-footer) {
  display: none !important;
}

/* Remove padding-bottom for footer space in compact view */
.widget-container.compact-view :deep(.markdown-content),
.widget-container.compact-view :deep(.preview-mode),
.widget-container.compact-view :deep(.graph-content-wrapper),
.widget-container.compact-view :deep(.stats-content),
.widget-container.compact-view :deep(.config-state),
.widget-container.compact-view :deep(.display-state) {
  padding-bottom: 0 !important;
}

.widget-container.compact-view :deep(.stats-content) {
  padding-bottom: 12px !important; /* Keep regular padding, just remove footer space */
}

.widget-footer {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  pointer-events: none;
}

.widget-footer > * {
  pointer-events: auto;
}

.widget-container.fullscreen .widget-content {
  border-radius: 0;
  height: 100%;
}

.fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.05);
}

.fullscreen-overlay .widget-container {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

.color-picker {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-dark);
  z-index: 100;
}

.color-option {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px var(--shadow-medium);
}
</style>
