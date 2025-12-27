<script setup lang="ts">
import { ref, watch } from 'vue'
import { GridLayout } from 'grid-layout-plus'
import type { Widget } from '../types/widget'
import WidgetContainer from './widgets/WidgetContainer.vue'
import { useWidgetView } from '../composables/useWidgetView'

const props = defineProps<{
  widgets: Widget[]
}>()

const emit = defineEmits<{
  'update:widgets': [widgets: Widget[]]
  'update:title': [id: string, title: string]
  'update:color': [id: string, color: string]
  'update:data': [id: string, data: any]
}>()

const layout = ref(
  props.widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    static: w.data?.draggingEnabled === false, // Static if dragging is disabled
  })),
)

// Sync layout when widgets change (including when switching panes)
// Watch widget IDs to detect when the widget set changes
watch(
  () => props.widgets.map((w) => w.id).join(','),
  () => {
    layout.value = props.widgets.map((w) => {
      const existing = layout.value.find((l) => l.i === w.id)
      return {
        i: w.id,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        static: w.data?.draggingEnabled === false || (existing?.static ?? false),
      }
    })
  },
  { immediate: false },
)

const handleLayoutUpdate = (newLayout: any[]) => {
  const updatedWidgets = props.widgets.map((widget) => {
    const layoutItem = newLayout.find((l) => l.i === widget.id)
    if (layoutItem) {
      return {
        ...widget,
        x: layoutItem.x,
        y: layoutItem.y,
        w: layoutItem.w,
        h: layoutItem.h,
      }
    }
    return widget
  })
  
  emit('update:widgets', updatedWidgets)
}

const removeWidget = (id: string) => {
  emit(
    'update:widgets',
    props.widgets.filter((w) => w.id !== id),
  )
}

const updateTitle = (id: string, title: string) => {
  emit('update:title', id, title)
}

const updateColor = (id: string, color: string) => {
  emit('update:color', id, color)
}

const updateData = (id: string, data: any) => {
  emit('update:data', id, data)
}

const handleToggleDrag = (id: string, enabled: boolean) => {
  const item = layout.value.find((l) => l.i === id)
  if (item) {
    item.static = !enabled
  }
}

// Get widget for item ID, with logging if not found
const getWidgetForItem = (itemId: string) => {
  const widget = props.widgets.find((w) => w.id === itemId)
  if (!widget) {
    console.warn(
      `[GridLayout] Widget not found for item ID: ${itemId}`,
      `\n  Layout items: ${layout.value.map((l) => l.i).join(', ')}`,
      `\n  Available widget IDs: ${props.widgets.map((w) => w.id).join(', ')}`,
      `\n  Total widgets: ${props.widgets.length}`,
      `\n  Total layout items: ${layout.value.length}`
    )
  }
  return widget
}

// Widget view mode
const { isCompactView } = useWidgetView()
</script>

<template>
  <div class="grid-container">
    <!-- Desktop Grid Layout -->
    <GridLayout
      v-model:layout="layout"
      @layout-updated="handleLayoutUpdate"
      :col-num="24"
      :row-height="80"
      :is-draggable="!isCompactView"
      :is-resizable="!isCompactView"
      :vertical-compact="false"
      :margin="[16, 16]"
      :use-css-transforms="true"
      :class="['desktop-grid', { 'compact-view': isCompactView }]"
    >
      <template #item="{ item }">
        <WidgetContainer
          v-if="getWidgetForItem(item.i)"
          :widget="getWidgetForItem(item.i)!"
          @remove="removeWidget(item.i)"
          @update:title="updateTitle(item.i, $event)"
          @update:color="updateColor(item.i, $event)"
          @update:data="updateData(item.i, $event)"
          @toggle-drag="handleToggleDrag(item.i, $event)"
        />
      </template>
    </GridLayout>

    <!-- Mobile Horizontal Scroll Layout -->
    <div class="mobile-scroll-container">
      <div class="mobile-scroll">
        <div v-for="widget in props.widgets" :key="widget.id" class="mobile-widget">
          <WidgetContainer
            :widget="widget"
            @remove="removeWidget(widget.id)"
            @update:title="updateTitle(widget.id, $event)"
            @update:color="updateColor(widget.id, $event)"
            @update:data="updateData(widget.id, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-container {
  min-height: 100%;
  height: 100%;
}

.desktop-grid {
  display: block;
}

.mobile-scroll-container {
  display: none;
}

/* Resize handle visibility */
:deep(.vgl-item__resizer) {
  width: 20px;
  height: 20px;
  right: 4px;
  bottom: 4px;
  background: transparent;
  border: none;
  opacity: 0.5;
  transition:
    opacity 0.2s,
    transform 0.2s;
  border-radius: 0 0 8px 0;
  cursor: se-resize;
}

:deep(.vgl-item__resizer::after) {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 30%,
    var(--text-tertiary) 30%,
    var(--text-tertiary) 40%,
    transparent 40%,
    transparent 50%,
    var(--text-tertiary) 50%,
    var(--text-tertiary) 60%,
    transparent 60%,
    transparent 70%,
    var(--text-tertiary) 70%,
    var(--text-tertiary) 80%,
    transparent 80%
  );
}

:deep(.vgl-item__resizer:before) {
  display: none;
}

:deep(.vgl-item:hover .vgl-item__resizer),
:deep(.vgl-item__resizer:hover) {
  opacity: 1;
}

/* Hide resize handles in compact view */
:deep(.compact-view .vgl-item__resizer) {
  display: none !important;
}

/* Also hide drag handles in compact view */
:deep(.compact-view .vgl-item) {
  cursor: default !important;
}

/* Mobile Layout */
@media (max-width: 768px) {
  .grid-container {
    padding: 0;
    height: fit-content;
    overflow: hidden;
  }

  .desktop-grid {
    display: none;
  }

  .mobile-scroll-container {
    display: block;
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 8px);
    padding: 8px 0;
    overflow: hidden;
  }

  .mobile-scroll {
    display: flex;
    gap: 16px;
    padding: 0 16px;
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 8px);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }

  .mobile-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .mobile-scroll::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 3px;
  }

  .mobile-scroll::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .mobile-widget {
    flex-shrink: 0;
    width: calc(100vw - 48px);
    min-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);
    max-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);
    height: auto;
    scroll-snap-align: center;
    margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 48px);
    padding-bottom: 200px;
  }

  .mobile-widget :deep(.widget-container) {
    min-height: 100%;
    max-height: 100%;
    height: 100%;
  }
}

/* Small phones - slightly smaller widgets */
@media (max-width: 380px) {
  .mobile-widget {
    width: calc(100vw - 32px);
  }

  .mobile-scroll {
    padding: 0 12px;
    gap: 12px;
  }
}
</style>
