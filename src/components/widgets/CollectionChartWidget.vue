<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RefreshCw, Loader, Library, TrendingUp, BarChart3 } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { useCollectionsApiStore } from '../../stores/collectionsApi'
import { getApiUrl, type Collection } from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
}>()

const { isCompactView } = useWidgetView()

const collectionsApiStore = useCollectionsApiStore()

const isLoading = ref(false)
const error = ref<string | null>(null)
const lastUpdated = ref<number | null>(null)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

const collections = computed(() => collectionsApiStore.data)

const hasApiConfig = computed(() => !!getApiUrl())

// Calculate stats
const totalCollections = computed(() => collections.value.length)

const totalItems = computed(() => {
  return collections.value.reduce((sum, collection) => sum + collection.itemCount, 0)
})

const averageItemsPerCollection = computed(() => {
  if (collections.value.length === 0) return 0
  return Math.round(totalItems.value / collections.value.length)
})

// Collections by item count
const collectionsBySize = computed(() => {
  const sizeRanges = {
    '0-10': 0,
    '11-50': 0,
    '51-100': 0,
    '101-500': 0,
    '500+': 0,
  }

  collections.value.forEach((collection) => {
    const count = collection.itemCount
    if (count === 0) {
      sizeRanges['0-10']++
    } else if (count <= 10) {
      sizeRanges['0-10']++
    } else if (count <= 50) {
      sizeRanges['11-50']++
    } else if (count <= 100) {
      sizeRanges['51-100']++
    } else if (count <= 500) {
      sizeRanges['101-500']++
    } else {
      sizeRanges['500+']++
    }
  })

  return Object.entries(sizeRanges)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }))
})

const maxSizeCount = computed(() => {
  return Math.max(...collectionsBySize.value.map((d) => d.count), 1)
})

// Top collections by item count
const topCollections = computed(() => {
  return [...collections.value]
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 5)
    .map((col) => ({
      name: col.name,
      count: col.itemCount,
    }))
})

// Collections distribution chart
const collectionsChartData = computed(() => {
  const total = totalCollections.value
  if (total === 0) return { segments: [], total: 0 }

  const segments = [
    {
      label: 'Small (0-10)',
      value: collectionsBySize.value.find((d) => d.label === '0-10')?.count || 0,
      color: '#6366f1',
    },
    {
      label: 'Medium (11-50)',
      value: collectionsBySize.value.find((d) => d.label === '11-50')?.count || 0,
      color: '#a855f7',
    },
    {
      label: 'Large (51-100)',
      value: collectionsBySize.value.find((d) => d.label === '51-100')?.count || 0,
      color: '#22c55e',
    },
    {
      label: 'XL (101-500)',
      value: collectionsBySize.value.find((d) => d.label === '101-500')?.count || 0,
      color: '#f97316',
    },
    {
      label: 'XXL (500+)',
      value: collectionsBySize.value.find((d) => d.label === '500+')?.count || 0,
      color: '#ef4444',
    },
  ].filter((s) => s.value > 0)

  return { segments, total }
})

// Calculate pie chart offset for segments
const getPieChartOffset = (index: number) => {
  let offset = 0
  for (let i = 0; i < index; i++) {
    const segment = collectionsChartData.value.segments[i]
    offset -= (segment.value / collectionsChartData.value.total) * 314.16
  }
  return offset
}

const loadCollections = async (forceRefresh = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  isLoading.value = true
  error.value = null
  totalApiCalls.value = 1
  completedApiCalls.value = 0

  try {
    await collectionsApiStore.initializeCollections(forceRefresh)
    completedApiCalls.value++

    lastUpdated.value = Date.now()

    // Save to widget data
    emit('update:data', {
      lastUpdated: lastUpdated.value,
      totalCollections: totalCollections.value,
      totalItems: totalItems.value,
    })
  } catch (err) {
    console.error('Failed to load collections:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load collection statistics'
    completedApiCalls.value++
  } finally {
    isLoading.value = false
  }
}

const refresh = () => {
  loadCollections(true)
}

onMounted(() => {
  loadCollections()
})
</script>

<template>
  <div class="collection-chart-widget">
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading collection stats"
      />
    </div>

    <div v-else class="stats-content">
      <!-- Overview Stats -->
      <div class="stats-section">
        <h3 class="section-title">Overview</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <Library :size="20" class="stat-icon" />
            <div class="stat-info">
              <div class="stat-value">{{ totalCollections }}</div>
              <div class="stat-label">Collections</div>
            </div>
          </div>
          <div class="stat-card">
            <BarChart3 :size="20" class="stat-icon items" />
            <div class="stat-info">
              <div class="stat-value">{{ totalItems }}</div>
              <div class="stat-label">Total Items</div>
            </div>
          </div>
          <div class="stat-card">
            <TrendingUp :size="20" class="stat-icon avg" />
            <div class="stat-info">
              <div class="stat-value">{{ averageItemsPerCollection }}</div>
              <div class="stat-label">Avg per Collection</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Collections -->
      <div v-if="topCollections.length > 0" class="stats-section">
        <h3 class="section-title">Top Collections</h3>
        <div class="chart-container">
          <div
            v-for="(collection, index) in topCollections"
            :key="collection.name"
            class="bar-chart-vertical"
          >
            <div class="bar-chart-label">{{ collection.name }}</div>
            <div class="bar-chart-bar-container">
              <div
                class="bar-chart-bar"
                :style="{
                  width: `${(collection.count / topCollections[0].count) * 100}%`,
                  backgroundColor: index === 0 ? '#6366f1' : '#a855f7',
                }"
              >
                <span class="bar-value">{{ collection.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer with refresh button -->
    <div v-if="!isLoading && !error && !isCompactView" class="widget-footer">
      <button @click="refresh" class="footer-button" title="Refresh" :disabled="isLoading">
        <RefreshCw :size="16" :class="{ spinning: isLoading }" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.collection-chart-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.error-message {
  padding: 16px;
  color: var(--btn-danger-bg);
  text-align: center;
  font-size: 13px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 13px;
}

.loader-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.stats-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
  gap: 16px;
  padding-bottom: 38px; /* Space for footer buttons */
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.stat-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.stat-icon.items {
  color: #6366f1;
}

.stat-icon.avg {
  color: #22c55e;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}

.chart-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.pie-chart {
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-label {
  color: var(--text-secondary);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.3px;
}

.legend-value {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 11px;
}

.bar-chart {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-chart-vertical {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-chart-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-chart-vertical .bar-chart-label {
  min-width: 0;
}

.bar-chart-bar-container {
  flex: 1;
  height: 24px;
  background-color: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.bar-chart-bar {
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px;
  transition: width 0.3s ease;
  min-width: fit-content;
}

.bar-value {
  color: white;
  font-size: 11px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.widget-footer {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
}

.footer-button {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-secondary);
  padding: 0;
}

.footer-button:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  color: var(--text-primary);
}

.footer-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-button .spinning {
  animation: spin 1s linear infinite;
}

@media (max-width: 767px) {
  .pie-chart {
    width: 100px;
    height: 100px;
  }

  .chart-container {
    padding: 10px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
