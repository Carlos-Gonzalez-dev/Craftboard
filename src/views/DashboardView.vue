<script setup lang="ts">
import { ref, watch, onMounted, computed, inject, type Ref } from 'vue'
import {
  Plus,
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
  Bookmark,
  Quote,
  Rss,
  Timer,
  TimerReset,
  Monitor,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-vue-next'
import GridLayout from '../components/GridLayout.vue'
import type { Widget } from '../types/widget'
import { useWidgetView } from '../composables/useWidgetView'
import { usePanes, type Pane } from '../composables/usePanes'
import ViewSubheader from '../components/ViewSubheader.vue'
import PaneTabs from '../components/PaneTabs.vue'

const STORAGE_KEY = 'craftboard-widgets'

// Use shared pane state
const { panes, activePaneId, loadPanes, savePanes } = usePanes()
const isUpdating = ref(false)
const injectedShowAddModal = inject<Ref<boolean> | undefined>('showAddWidgetModal')
const localShowAddModal = ref(false)
const showAddModal = injectedShowAddModal || localShowAddModal

// Pane management
const showPaneNameModal = ref(false)
const newPaneName = ref('')

const openAddWidgetModal = () => {
  if (injectedShowAddModal) {
    injectedShowAddModal.value = true
  } else {
    showAddModal.value = true
  }
}

// Widget view mode
const { isCompactView } = useWidgetView()

// Check if bookmarks and RSS are configured (use collections document ID only)
const hasBookmarksConfig = computed(() => {
  const docId = localStorage.getItem('collections-document-id')
  return !!docId && docId.trim() !== ''
})

const hasRSSConfig = computed(() => {
  const docId = localStorage.getItem('collections-document-id')
  return !!docId && docId.trim() !== ''
})

const widgets = computed(() => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  return activePane?.widgets || []
})

// Widget categories for add widget modal
interface WidgetOption {
  type: string
  name: string
  description: string
  icon: any
  condition?: () => boolean
}

interface WidgetCategory {
  name: string
  widgets: WidgetOption[]
}

const widgetCategories: WidgetCategory[] = [
  {
    name: 'Stats',
    widgets: [
      {
        type: 'collection-chart',
        name: 'Collection Stats',
        description: 'View charts and statistics about your collections',
        icon: Library,
      },
      {
        type: 'stats',
        name: 'Workspace Stats',
        description: 'View statistics about your Craft workspace',
        icon: BarChart3,
      },
      {
        type: 'task-stats',
        name: 'Task Stats',
        description: 'View charts and statistics about your tasks',
        icon: CheckSquare,
      },
    ],
  },
  {
    name: 'Craft',
    widgets: [
      {
        type: 'bookmark',
        name: 'Bookmark',
        description: 'Display a single bookmark from your Bookmarks collection',
        icon: Bookmark,
        condition: () => hasBookmarksConfig.value,
      },
      {
        type: 'collection',
        name: 'Craft Collection',
        description: 'Display data from your Craft collections',
        icon: Library,
      },
      {
        type: 'daily-note',
        name: 'Daily Note',
        description: "View today's daily note from Craft with date navigation",
        icon: Calendar,
      },
      {
        type: 'graph',
        name: 'Graph',
        description: 'Visualize relationships between documents and folders',
        icon: Network,
      },
      {
        type: 'pin-block',
        name: 'Pin Block',
        description: 'Pin Craft blocks',
        icon: LinkIcon,
      },
      {
        type: 'document-tasks',
        name: 'PIN Document',
        description: 'Display tasks from a specific Craft document',
        icon: CheckSquare,
      },
      {
        type: 'quote',
        name: 'Quote',
        description: 'Display a random quote from your Quotes collection',
        icon: Quote,
      },
      {
        type: 'rss',
        name: 'RSS Feed',
        description: 'Display a single RSS feed from your RSS collection',
        icon: Rss,
        condition: () => hasRSSConfig.value,
      },
    ],
  },
  {
    name: 'Productivity',
    widgets: [
      {
        type: 'notes',
        name: 'Checklist',
        description: 'Simple checklist for tasks',
        icon: CheckSquare,
      },
      {
        type: 'pomodoro',
        name: 'Pomodoro Timer',
        description: 'Focus timer with 25-minute work sessions and breaks',
        icon: Timer,
      },
      {
        type: 'markdown',
        name: 'Scratchpad',
        description: 'Write and preview markdown notes',
        icon: FileText,
      },
      {
        type: 'stopwatch',
        name: 'Stopwatch',
        description: 'Track elapsed time with start, pause, and reset',
        icon: TimerReset,
      },
    ],
  },
  {
    name: 'Utilities',
    widgets: [
      {
        type: 'clock',
        name: 'Clock',
        description: 'Display current time',
        icon: Clock,
      },
      {
        type: 'iframe',
        name: 'iFrame',
        description: 'Embed external content via URL or iframe code',
        icon: Monitor,
      },
      {
        type: 'pin-url',
        name: 'Pin URL',
        description: 'Pin external links with preview',
        icon: ExternalLink,
      },
    ],
  },
]

// Selected category for tabs
const selectedCategory = ref<string>('')

// Computed property for sorted categories
const sortedCategories = computed(() => {
  return [...widgetCategories].sort((a, b) => a.name.localeCompare(b.name))
})

// Initialize selected category when modal opens
watch(showAddModal, (isOpen) => {
  if (isOpen && sortedCategories.value.length > 0) {
    selectedCategory.value = sortedCategories.value[0].name
  }
})

// Get widgets for selected category
const widgetsForCategory = computed(() => {
  const category = widgetCategories.find((c) => c.name === selectedCategory.value)
  if (!category) return []
  return category.widgets.filter((widget) => !widget.condition || widget.condition())
})

const defaultWidgets: Widget[] = [
  {
    id: '1',
    type: 'markdown',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    title: 'Scratchpad',
  },
  {
    id: '2',
    type: 'clock',
    x: 4,
    y: 0,
    w: 2,
    h: 2,
    title: 'Clock',
  },
  {
    id: '3',
    type: 'notes',
    x: 4,
    y: 2,
    w: 2,
    h: 2,
    title: 'Checklist',
  },
]

onMounted(() => {
  isUpdating.value = true
  // Load panes from localStorage
  loadPanes()
  
  // If still no panes exist, create default with default widgets
  if (panes.value.length === 0) {
    panes.value = [
      {
        id: 'default',
        name: 'Main',
        widgets: defaultWidgets,
      },
    ]
    activePaneId.value = 'default'
    savePanes()
  }
  
  setTimeout(() => {
    isUpdating.value = false
  }, 100)
})

// Pane management
const createPane = () => {
  if (!newPaneName.value.trim()) {
    alert('Please enter a pane name')
    return
  }

  const newPane: Pane = {
    id: `pane-${Date.now()}`,
    name: newPaneName.value.trim(),
    widgets: [],
  }

  panes.value.push(newPane)
  activePaneId.value = newPane.id
  showPaneNameModal.value = false
  newPaneName.value = ''
  savePanes()
}

const switchPane = (paneId: string) => {
  activePaneId.value = paneId
  savePanes()
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
        activePaneId.value = panes.value[0].id
      }
      savePanes()
    }
  }
}

// Rename pane functionality
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

// Drag and drop for panes
const draggedPaneId = ref<string | null>(null)
const draggedOverPaneId = ref<string | null>(null)

const handleDragStart = (e: DragEvent, paneId: string) => {
  draggedPaneId.value = paneId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', paneId)
  }
  ;(e.target as HTMLElement).style.opacity = '0.5'
}

const handleDragEnd = (e: DragEvent) => {
  ;(e.target as HTMLElement).style.opacity = '1'
  draggedPaneId.value = null
  draggedOverPaneId.value = null
}

const handleDragOver = (e: DragEvent, paneId: string) => {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  if (draggedPaneId.value && draggedPaneId.value !== paneId) {
    draggedOverPaneId.value = paneId
  }
}

const handleDragLeave = () => {
  draggedOverPaneId.value = null
}

const handleDrop = (e: DragEvent, targetPaneId: string) => {
  e.preventDefault()
  if (!draggedPaneId.value || draggedPaneId.value === targetPaneId) {
    draggedPaneId.value = null
    draggedOverPaneId.value = null
    return
  }

  const draggedIndex = panes.value.findIndex((p) => p.id === draggedPaneId.value)
  const targetIndex = panes.value.findIndex((p) => p.id === targetPaneId)

  if (draggedIndex !== -1 && targetIndex !== -1) {
    const [draggedPane] = panes.value.splice(draggedIndex, 1)
    panes.value.splice(targetIndex, 0, draggedPane)
    savePanes()
  }

  draggedPaneId.value = null
  draggedOverPaneId.value = null
}

// Widget management for active pane
const updateWidgetTitle = (id: string, newTitle: string) => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  if (activePane) {
    const widget = activePane.widgets.find((w) => w.id === id)
    if (widget) {
      widget.title = newTitle
      savePanes()
    }
  }
}

const updateWidgetColor = (id: string, newColor: string) => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  if (activePane) {
    const widget = activePane.widgets.find((w) => w.id === id)
    if (widget) {
      widget.color = newColor
      savePanes()
    }
  }
}

const updateWidgetData = (id: string, newData: any) => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  if (activePane) {
    const widget = activePane.widgets.find((w) => w.id === id)
    if (widget) {
      widget.data = newData
      savePanes()
    }
  }
}

const handleWidgetsUpdate = (updatedWidgets: Widget[]) => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  if (activePane) {
    activePane.widgets = updatedWidgets
    savePanes()
  }
}

// Watch for pane changes to save
watch(
  () => panes.value,
  () => {
    if (!isUpdating.value) {
      savePanes()
    }
  },
  { deep: true },
)

const defaultColors = [
  'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', // Indigo
  'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', // Purple
  'linear-gradient(135deg, #22c55e 0%, #15803d 100%)', // Green
  'linear-gradient(135deg, #f97316 0%, #c2410c 100%)', // Orange
  'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', // Pink
  'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)', // Cyan
]

const addWidget = (
  type:
    | 'markdown'
    | 'clock'
    | 'notes'
    | 'collection'
    | 'daily-note'
    | 'pin-block'
    | 'pin-url'
    | 'stats'
    | 'task-stats'
    | 'collection-chart'
    | 'graph'
    | 'bookmark'
    | 'quote'
    | 'rss'
    | 'pomodoro'
    | 'document-tasks'
    | 'stopwatch'
    | 'iframe',
) => {
  const activePane = panes.value.find((p) => p.id === activePaneId.value)
  if (!activePane) return

  const colorIndex = activePane.widgets.length % defaultColors.length
  const widgetWidth =
    type === 'clock'
      ? 6
      : type === 'stopwatch'
        ? 5
        : type === 'pomodoro'
          ? 6
          : type === 'collection'
            ? 14
            : type === 'daily-note'
              ? 8
              : type === 'document-tasks'
                ? 8
              : type === 'pin-block'
                ? 5
              : type === 'pin-url'
                ? 5
              : type === 'iframe'
                ? 8
              : type === 'stats'
                ? 10
              : type === 'task-stats'
                ? 10
              : type === 'collection-chart'
                ? 10
              : type === 'graph'
                ? 6
              : type === 'bookmark'
                ? 5
              : type === 'quote'
                ? 5
              : type === 'rss'
                ? 6
              : type === 'markdown'
                ? 5
              : type === 'notes'
                ? 6
              : 4
  const widgetHeight =
    type === 'clock'
      ? 3
      : type === 'stopwatch'
        ? 3
        : type === 'pomodoro'
          ? 4
          : type === 'collection'
            ? 4
            : type === 'daily-note'
              ? 4
              : type === 'document-tasks'
                ? 3
              : type === 'pin-block'
                ? 3
              : type === 'pin-url'
                ? 3
              : type === 'iframe'
                ? 4
              : type === 'stats'
                ? 8
              : type === 'task-stats'
                ? 8
              : type === 'collection-chart'
                ? 8
              : type === 'graph'
                ? 3
              : type === 'bookmark'
                ? 3
              : type === 'quote'
                ? 3
              : type === 'rss'
                ? 5
              : type === 'markdown'
                ? 3
              : type === 'notes'
                ? 3
              : 2

  // Find next available position
  const xPosition = 0
  let yPosition = 0

  // Simple positioning: find the max Y and add below
  if (activePane.widgets.length > 0) {
    const maxY = Math.max(...activePane.widgets.map((w) => w.y + w.h))
    yPosition = maxY
  }

  const newWidget: Widget = {
    id: `${Date.now()}`,
    type,
    x: xPosition,
    y: yPosition,
    w: widgetWidth,
    h: widgetHeight,
    title:
      type === 'markdown'
        ? 'Scratchpad'
        : type === 'clock'
          ? 'Clock'
          : type === 'stopwatch'
            ? 'Stopwatch'
            : type === 'collection'
              ? 'Craft Collection'
              : type === 'daily-note'
                ? 'Daily Note'
                : type === 'pin-block'
                    ? 'Pin Block'
                    : type === 'pin-url'
                      ? 'Pin URL'
                      : type === 'iframe'
                        ? 'iFrame'
                        : type === 'stats'
                        ? 'Workspace Stats'
                        : type === 'task-stats'
                          ? 'Task Stats'
                          : type === 'collection-chart'
                            ? 'Collection Stats'
                            : type === 'graph'
                            ? 'Graph'
                          : type === 'bookmark'
                            ? 'Bookmark'
                            : type === 'quote'
                              ? 'Quote'
                              : type === 'rss'
                                ? 'RSS Feed'
                                : type === 'pomodoro'
                                  ? 'Pomodoro Timer'
                                  : type === 'document-tasks'
                                    ? 'PIN Document'
                                    : 'Checklist',
    color: defaultColors[colorIndex],
  }
  activePane.widgets.push(newWidget)
  savePanes()
  showAddModal.value = false
}

</script>

<template>
  <div class="dashboard-view">
    <GridLayout
      :widgets="widgets"
      @update:widgets="handleWidgetsUpdate"
      @update:title="updateWidgetTitle"
      @update:color="updateWidgetColor"
      @update:data="updateWidgetData"
    />

    <!-- New Pane Modal -->
    <div v-if="showPaneNameModal" class="modal-overlay" @click.self="showPaneNameModal = false">
      <div class="modal pane-modal">
        <h2>Create New Pane</h2>
        <p class="modal-description">Enter a name for your new pane</p>

        <div class="form-group">
          <input
            v-model="newPaneName"
            @keyup.enter="createPane"
            type="text"
            placeholder="Pane name..."
            class="pane-name-input"
            autofocus
          />
        </div>

        <div class="button-group">
          <button @click="createPane" class="create-button">Create</button>
          <button @click="((showPaneNameModal = false), (newPaneName = ''))" class="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Add Widget Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <button @click="showAddModal = false" class="modal-close-button">
          <X :size="20" />
        </button>
        <h2>Add Widget</h2>
        <p class="modal-description">Choose a widget type to add to your dashboard</p>

        <!-- Category Tabs -->
        <div class="widget-category-tabs">
          <button
            v-for="category in sortedCategories"
            :key="category.name"
            @click="selectedCategory = category.name"
            :class="['category-tab', { active: selectedCategory === category.name }]"
          >
            {{ category.name }}
          </button>
        </div>

        <!-- Widget Options -->
        <div class="widget-options">
          <div class="category-widgets">
            <button
              v-for="widget in widgetsForCategory"
              :key="widget.type"
              @click="addWidget(widget.type as any)"
              class="widget-option"
            >
              <div class="widget-icon">
                <component :is="widget.icon" :size="24" />
              </div>
              <div class="widget-info">
                <h3>{{ widget.name }}</h3>
                <p>{{ widget.description }}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>


  </div>
</template>

<style scoped>
.dashboard-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pane-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
  position: relative;
  backdrop-filter: blur(10px);
}

.pane-tabs-left {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border-primary) transparent;
}

.pane-tabs-left::-webkit-scrollbar {
  height: 4px;
}

.pane-tabs-left::-webkit-scrollbar-track {
  background: transparent;
}

.pane-tabs-left::-webkit-scrollbar-thumb {
  background: var(--border-primary);
  border-radius: 2px;
}

.pane-tabs-left::-webkit-scrollbar-thumb:hover {
  background: var(--border-secondary);
}

.pane-tabs-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.view-mode-buttons {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
}

.view-mode-button {
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
  transition: all 0.2s ease;
  white-space: nowrap;
}

.view-mode-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.view-mode-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.view-mode-button.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.add-widget-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: white;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
}

.add-widget-button:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.add-widget-button:active {
  transform: translateY(0);
}

.pane-modal {
  max-width: 380px;
}

.pane-name-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-sizing: border-box;
  background: var(--input-bg);
  color: var(--input-text);
}

.pane-name-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.button-group {
  display: flex;
  gap: 10px;
}

.create-button {
  flex: 1;
  padding: 10px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-button:hover {
  background: var(--btn-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.pane-tab-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.pane-tab-wrapper.dragging {
  opacity: 0.5;
}

.pane-tab-wrapper.drag-over {
  transform: translateX(4px);
}

.pane-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1.5px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  position: relative;
  user-select: none;
  min-width: 60px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.pane-tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.pane-tab.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.5);
  transform: translateY(-1px);
}

.pane-tab.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
  border-color: transparent;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
}

.pane-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
  width: 16px;
  height: 16px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pane-tab.active .pane-action-button {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.pane-tab:not(.active) .pane-action-button {
  background: transparent;
  color: var(--text-tertiary);
}

.pane-action-button:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.1);
}

.pane-tab:not(.active) .delete-button:hover {
  color: var(--btn-danger-bg);
  background: rgba(239, 68, 68, 0.1);
}

.pane-edit-form {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 2px solid var(--btn-primary-bg);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.pane-edit-input {
  flex: 1;
  min-width: 80px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.pane-edit-input:focus {
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.save-button {
  color: var(--btn-primary-bg);
}

.save-button:hover {
  background: rgba(99, 102, 241, 0.2);
  color: var(--btn-primary-bg);
}

.cancel-edit-button:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--btn-danger-bg);
}

.add-pane-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: 1.5px dashed var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.add-pane-tab:hover {
  background: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
  border-style: solid;
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

/* FAB Styles */
.fab {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  border: none;
  border-radius: 50%;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(168, 85, 247, 0.5);
  z-index: 100;
}

.fab:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(168, 85, 247, 0.6);
}

.fab:active {
  transform: scale(0.95);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 28px;
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  box-shadow: 0 8px 32px var(--shadow-dark);
  animation: slideUp 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

@media (min-width: 769px) {
  .modal {
    max-width: 720px;
  }
}

.modal-close-button {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  z-index: 10;
  padding: 0;
  flex-shrink: 0;
}

.modal-close-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal h2 {
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-description {
  margin: 0 0 20px 0;
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: 500;
}

/* Improved Add Widget Modal Styles */
.modal h2,
.modal-description {
  flex-shrink: 0;
}

.widget-category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-primary);
  overflow-x: auto;
  flex-shrink: 0;
}

.widget-category-tabs::-webkit-scrollbar {
  height: 4px;
}

.widget-category-tabs::-webkit-scrollbar-track {
  background: transparent;
}

.widget-category-tabs::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.category-tab {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.category-tab:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.category-tab.active {
  background: var(--bg-tertiary);
  border-color: #a855f7;
  color: #a855f7;
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.1);
}

.widget-options {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 0;
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.widget-category {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 4px;
}

.category-widgets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (min-width: 769px) {
  .category-widgets {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.widget-options::-webkit-scrollbar {
  width: 8px;
}

.widget-options::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 4px;
}

.widget-options::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.widget-options::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.widget-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px 12px 8px;
  background: linear-gradient(135deg, var(--bg-tertiary) 60%, var(--bg-secondary) 100%);
  border: 1.5px solid var(--border-primary);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 1.3, 0.6, 1);
  box-shadow: 0 2px 12px 0 rgba(99, 102, 241, 0.1);
  position: relative;
  min-width: 0;
  min-height: 110px;
  overflow: visible;
}

.widget-option:hover,
.widget-option:focus {
  border-color: #a855f7;
  box-shadow:
    0 0 0 2px #a855f7,
    0 4px 24px 0 rgba(99, 102, 241, 0.18);
  background: linear-gradient(135deg, var(--bg-secondary) 60%, var(--bg-tertiary) 100%);
  transform: translateY(-2px) scale(1.02);
  z-index: 2;
}

.widget-icon {
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  max-width: 48px;
  max-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  border: 2px solid rgba(99, 102, 241, 0.25);
  border-radius: 12px;
  box-shadow: 0 2px 8px 0 rgba(99, 102, 241, 0.1);
  color: #fff;
  margin-bottom: 6px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.widget-icon svg,
.widget-icon :deep(svg) {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.widget-info {
  text-align: center;
  width: 100%;
}

.widget-info h3 {
  margin: 0 0 2px 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.widget-info p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
  font-weight: 500;
  opacity: 0.85;
}

.cancel-button {
  width: 100%;
  padding: 10px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

/* Pane Modal Styles */
.pane-modal {
  max-width: 380px;
}

.form-group {
  margin-bottom: 20px;
}

.pane-name-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-sizing: border-box;
  background: var(--input-bg);
  color: var(--input-text);
}

.pane-name-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.button-group {
  display: flex;
  gap: 10px;
}

.create-button {
  flex: 1;
  padding: 10px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-button:hover {
  background: var(--btn-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.button-group .cancel-button {
  flex: 1;
  width: auto;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .pane-tabs {
    padding: 6px 12px;
    gap: 4px;
  }
  
  .add-widget-button {
    flex: 1;
    justify-content: center;
  }
  
  .view-mode-buttons {
    flex: 1;
  }
  
  .view-mode-button {
    flex: 1;
  }
  
  .dashboard-view {
    height: calc(100vh - var(--navbar-height, 100px) - var(--footer-height, 60px));
    min-height: 0;
    overflow: hidden;
  }
  
  .grid-container {
    height: 100%;
    overflow-y: auto;
  }

  .pane-tabs-left {
    gap: 4px;
  }

  .pane-tab {
    padding: 5px 10px;
    font-size: 11px;
    min-width: 50px;
  }

  .pane-action-button {
    width: 14px;
    height: 14px;
  }

  .add-pane-tab {
    padding: 5px 10px;
    font-size: 11px;
  }

  .add-pane-tab span {
    display: none;
  }

  .fab {
    bottom: 20px;
    left: 20px;
    transform: none;
    width: 50px;
    height: 50px;
  }

  .modal {
    padding: 20px;
    max-width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-close-button {
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
  }

  .widget-options {
    gap: 16px;
    max-height: 50vh;
    padding: 6px;
  }

  .widget-category {
    gap: 8px;
  }

  .category-title {
    font-size: 11px;
  }

  .category-widgets {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .widget-option {
    padding: 12px 6px 10px 6px;
    gap: 8px;
    min-height: 95px;
  }

  .widget-icon {
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    max-width: 40px;
    max-height: 40px;
  }

  .widget-icon svg,
  .widget-icon :deep(svg) {
    width: 20px;
    height: 20px;
  }

  .widget-info h3 {
    font-size: 14px;
  }

  .widget-info p {
    font-size: 12px;
  }
}
</style>
