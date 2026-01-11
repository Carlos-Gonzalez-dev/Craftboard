<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  RefreshCw,
  Loader,
  FileText,
  Calendar,
  Library,
  Folder,
  TrendingUp,
  Clock,
} from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { useStatsApiStore } from '../../stores/statsApi'
import {
  getApiUrl,
  type CraftDocument,
  type Collection,
  type CraftFolder,
} from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
}>()

const { isCompactView } = useWidgetView()

const statsApiStore = useStatsApiStore()

const isLoading = ref(false)
const error = ref<string | null>(null)
const lastUpdated = ref<number | null>(null)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

const documents = computed(() => statsApiStore.documents)
const collections = computed(() => statsApiStore.collections)
const folders = computed(() => statsApiStore.folders)

const hasApiConfig = computed(() => !!getApiUrl())

// Calculate stats
const totalDocuments = computed(() => {
  return documents.value.filter((d) => !d.dailyNoteDate).length
})

const totalDailyNotes = computed(() => {
  return documents.value.filter((d) => d.dailyNoteDate).length
})

const totalCollections = computed(() => {
  return collections.value.length
})

const totalFolders = computed(() => {
  return folders.value.length
})

// Chart data
const overviewChartData = computed(() => {
  const total =
    totalDocuments.value + totalDailyNotes.value + totalCollections.value + totalFolders.value
  if (total === 0) return { segments: [], total: 0 }

  const segments = [
    { label: 'Documents', value: totalDocuments.value, color: '#6366f1' },
    { label: 'Daily Notes', value: totalDailyNotes.value, color: '#a855f7' },
    { label: 'Collections', value: totalCollections.value, color: '#22c55e' },
    { label: 'Folders', value: totalFolders.value, color: '#f97316' },
  ].filter((s) => s.value > 0)

  return { segments, total }
})

const activityChartData = computed(() => {
  const max = Math.max(documentsUpdatedToday.value, documentsUpdatedThisWeek.value, 1)
  return {
    today: documentsUpdatedToday.value,
    week: documentsUpdatedThisWeek.value,
    max,
    todayPercent: (documentsUpdatedToday.value / max) * 100,
    weekPercent: (documentsUpdatedThisWeek.value / max) * 100,
  }
})

// Documents created over time (last 7 days)
const documentsByDate = computed(() => {
  const last7Days: Record<string, number> = {}
  const today = new Date()

  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    last7Days[dateStr] = 0
  }

  // Count documents by creation date
  documents.value.forEach((doc) => {
    if (doc.createdAt) {
      const dateStr = doc.createdAt.split('T')[0]
      if (last7Days.hasOwnProperty(dateStr)) {
        last7Days[dateStr]++
      }
    }
  })

  return Object.entries(last7Days).map(([date, count]) => ({
    date,
    label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
    count,
  }))
})

const maxDailyCount = computed(() => {
  return Math.max(...documentsByDate.value.map((d) => d.count), 1)
})

// Calculate pie chart offset for segments
const getPieChartOffset = (index: number) => {
  let offset = 0
  for (let i = 0; i < index; i++) {
    const segment = overviewChartData.value.segments[i]
    offset -= (segment.value / overviewChartData.value.total) * 314.16
  }
  return offset
}

const documentsUpdatedToday = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return documents.value.filter((doc) => {
    if (!doc.lastModifiedAt) return false
    const modifiedDate = new Date(doc.lastModifiedAt)
    modifiedDate.setHours(0, 0, 0, 0)
    return modifiedDate.getTime() === today.getTime()
  }).length
})

const documentsUpdatedThisWeek = computed(() => {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)

  return documents.value.filter((doc) => {
    if (!doc.lastModifiedAt) return false
    const modifiedDate = new Date(doc.lastModifiedAt)
    return modifiedDate >= weekAgo
  }).length
})

const mostRecentDocument = computed(() => {
  const docsWithDates = documents.value
    .filter((d) => d.lastModifiedAt && !d.dailyNoteDate)
    .sort((a, b) => {
      const dateA = new Date(a.lastModifiedAt!).getTime()
      const dateB = new Date(b.lastModifiedAt!).getTime()
      return dateB - dateA
    })

  return docsWithDates[0] || null
})

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const loadStats = async (forceRefresh: boolean = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  isLoading.value = true
  error.value = null
  totalApiCalls.value = 1
  completedApiCalls.value = 0

  try {
    await statsApiStore.initializeStats(forceRefresh)
    completedApiCalls.value++
    lastUpdated.value = Date.now()

    emit('update:data', {
      totalDocuments: totalDocuments.value,
      totalDailyNotes: totalDailyNotes.value,
      totalCollections: totalCollections.value,
      totalFolders: totalFolders.value,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load statistics'
    completedApiCalls.value = totalApiCalls.value
  } finally {
    isLoading.value = false
  }
}

const refresh = () => {
  loadStats(true)
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="stats-widget">
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading stats"
      />
    </div>

    <div v-else class="stats-content">
      <!-- Overview Chart -->
      <div class="stats-section">
        <h3 class="section-title">Overview</h3>
        <!-- Pie Chart -->
        <div v-if="overviewChartData.total > 0" class="chart-container">
          <svg viewBox="0 0 120 120" class="pie-chart">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--bg-tertiary)"
              stroke-width="20"
            />
            <g v-for="(segment, index) in overviewChartData.segments" :key="segment.label">
              <circle
                v-if="index === 0"
                cx="60"
                cy="60"
                r="50"
                fill="none"
                :stroke="segment.color"
                stroke-width="20"
                :stroke-dasharray="`${(segment.value / overviewChartData.total) * 314.16} 314.16`"
                stroke-dashoffset="0"
                transform="rotate(-90 60 60)"
              />
              <circle
                v-else
                cx="60"
                cy="60"
                r="50"
                fill="none"
                :stroke="segment.color"
                stroke-width="20"
                :stroke-dasharray="`${(segment.value / overviewChartData.total) * 314.16} 314.16`"
                :stroke-dashoffset="getPieChartOffset(index)"
                transform="rotate(-90 60 60)"
              />
            </g>
          </svg>
          <div class="chart-legend">
            <div
              v-for="segment in overviewChartData.segments"
              :key="segment.label"
              class="legend-item"
            >
              <div class="legend-color" :style="{ backgroundColor: segment.color }"></div>
              <span class="legend-label">{{ segment.label }}</span>
              <span class="legend-value">({{ segment.value }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Chart -->
      <div class="stats-section">
        <h3 class="section-title">Activity</h3>
        <!-- Bar Chart -->
        <div class="chart-container">
          <div class="bar-chart">
            <div class="bar-chart-label">Today</div>
            <div class="bar-chart-bar-container">
              <div
                class="bar-chart-bar"
                :style="{
                  width: `${activityChartData.todayPercent}%`,
                  backgroundColor: '#6366f1',
                }"
              >
                <span class="bar-value">{{ activityChartData.today }}</span>
              </div>
            </div>
          </div>
          <div class="bar-chart">
            <div class="bar-chart-label">This Week</div>
            <div class="bar-chart-bar-container">
              <div
                class="bar-chart-bar"
                :style="{
                  width: `${activityChartData.weekPercent}%`,
                  backgroundColor: '#a855f7',
                }"
              >
                <span class="bar-value">{{ activityChartData.week }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Documents Created Over Time -->
      <div v-if="documentsByDate.length > 0" class="stats-section">
        <h3 class="section-title">Created This Week</h3>
        <div class="timeline-chart">
          <div
            v-for="day in documentsByDate"
            :key="day.date"
            class="timeline-bar"
            :title="`${day.date}: ${day.count} documents`"
          >
            <div class="timeline-bars">
              <div
                class="timeline-bar-fill"
                :style="{ height: `${(day.count / maxDailyCount) * 100}%` }"
              ></div>
            </div>
            <div class="timeline-bar-label">{{ day.label }}</div>
            <div class="timeline-bar-value">{{ day.count }}</div>
          </div>
        </div>
      </div>

      <!-- Most Recent Document -->
      <div v-if="mostRecentDocument" class="stats-section">
        <h3 class="section-title">Most Recent</h3>
        <div class="activity-item recent-doc">
          <FileText :size="16" class="activity-icon" />
          <div class="activity-info">
            <div class="activity-doc-title">{{ mostRecentDocument.title || 'Untitled' }}</div>
            <div class="activity-time">
              {{
                mostRecentDocument.lastModifiedAt
                  ? formatTimeAgo(mostRecentDocument.lastModifiedAt)
                  : ''
              }}
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
.stats-widget {
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

:deep(.compact-view) .widget-footer {
  display: none !important;
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

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.activity-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.activity-info {
  flex: 1;
  min-width: 0;
}

.activity-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.activity-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}

.recent-doc .activity-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-doc-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.overview-with-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.activity-with-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bar-chart {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-chart-label {
  min-width: 70px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.bar-chart-bar-container {
  flex: 1;
  height: 24px;
  background-color: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
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

.timeline-chart {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 120px;
  padding: 8px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.timeline-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
  position: relative;
}

.timeline-bars {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  position: relative;
}

.timeline-bar-fill {
  flex: 1;
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.3s ease;
  position: relative;
  background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
}

.timeline-bar-label {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: auto;
}

.timeline-bar-value {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 2px;
}

@media (max-width: 767px) {
  .pie-chart {
    width: 100px;
    height: 100px;
  }

  .chart-container {
    padding: 10px;
  }

  .timeline-chart {
    height: 100px;
    gap: 6px;
  }

  .timeline-bar-label {
    font-size: 8px;
  }

  .timeline-bar-value {
    font-size: 9px;
  }
}
</style>
