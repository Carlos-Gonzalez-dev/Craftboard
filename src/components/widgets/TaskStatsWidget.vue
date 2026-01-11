<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RefreshCw, Loader, CheckSquare, Calendar, AlertCircle, TrendingUp } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { fetchTasks, getApiUrl, getCacheExpiryMs, type CraftTask } from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
}>()

const { isCompactView } = useWidgetView()

const isLoading = ref(false)
const error = ref<string | null>(null)
const lastUpdated = ref<number | null>(null)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

const inboxTasks = ref<CraftTask[]>([])
const activeTasks = ref<CraftTask[]>([])
const upcomingTasks = ref<CraftTask[]>([])
const logbookTasks = ref<CraftTask[]>([])

const hasApiConfig = computed(() => !!getApiUrl())

// Cache keys (same as TasksView)
const CACHE_PREFIX = 'tasks-cache-'

// Helper functions from TasksView
function getTaskStatus(task: CraftTask): 'todo' | 'done' | 'canceled' {
  if (task.taskInfo?.state) {
    return task.taskInfo.state
  }
  if (task.canceledAt) {
    return 'canceled'
  }
  if (task.completedAt) {
    return 'done'
  }
  return 'todo'
}

function extractTitleFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^-\s*\[[x\s~]\]\s*/, '')
    .replace(/^\s*-\s*\[[x\s~]\]\s*/, '')
    .trim()
}

function isTaskOverdue(task: CraftTask): boolean {
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return false

  const taskStatus = getTaskStatus(task)
  if (taskStatus !== 'todo') return false

  const taskDate = new Date(scheduleDate)
  taskDate.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return taskDate < today
}

function getDaysOverdue(task: CraftTask): number {
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return 0

  const taskDate = new Date(scheduleDate)
  taskDate.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - taskDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

function isRecurringTask(task: CraftTask): boolean {
  return !!task.repeat
}

// Cache helpers (same as TasksView)
function getCacheKey(filter: string) {
  return `${CACHE_PREFIX}${filter}`
}

function getCachedData(filter: string) {
  try {
    const cacheKey = getCacheKey(filter)
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    const cacheExpiryMs = getCacheExpiryMs()

    if (cacheExpiryMs === 0) return null // Caching disabled

    if (now - timestamp < cacheExpiryMs) {
      return data
    }

    localStorage.removeItem(cacheKey)
    return null
  } catch {
    return null
  }
}

function setCachedData(filter: string, data: CraftTask[]) {
  try {
    const cacheKey = getCacheKey(filter)
    const cacheData = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.error('Error saving cache:', error)
  }
}

// Get all tasks combined (inbox, active, upcoming, and logbook)
const allTasks = computed(() => {
  const all = [
    ...inboxTasks.value,
    ...activeTasks.value,
    ...upcomingTasks.value,
    ...logbookTasks.value,
  ]
  // Remove duplicates by id
  const unique = new Map<string, CraftTask>()
  all.forEach((task) => {
    if (!unique.has(task.id)) {
      unique.set(task.id, task)
    }
  })
  return Array.from(unique.values())
})

// Filter valid tasks (with titles)
const validTasks = computed(() => {
  return allTasks.value.filter((task) => {
    const title = extractTitleFromMarkdown(task.markdown || '')
    return title && title.trim() !== ''
  })
})

// Calculate stats
const totalTasks = computed(() => validTasks.value.length)

const tasksByStatus = computed(() => {
  const statusCounts = {
    todo: 0,
    done: 0,
    canceled: 0,
  }

  validTasks.value.forEach((task) => {
    const status = getTaskStatus(task)
    statusCounts[status]++
  })

  return statusCounts
})

const overdueTasks = computed(() => {
  return validTasks.value.filter((task) => {
    const status = getTaskStatus(task)
    return status === 'todo' && isTaskOverdue(task)
  })
})

const overdueCount = computed(() => overdueTasks.value.length)

const recurringTasks = computed(() => {
  return validTasks.value.filter((task) => isRecurringTask(task))
})

const recurringCount = computed(() => recurringTasks.value.length)

// Tasks by date (last 7 days)
const tasksByDate = computed(() => {
  const last7Days: Record<string, { scheduled: number; completed: number }> = {}
  const today = new Date()

  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    last7Days[dateStr] = { scheduled: 0, completed: 0 }
  }

  // Count tasks by schedule date and completion date
  validTasks.value.forEach((task) => {
    const status = getTaskStatus(task)

    // Count scheduled tasks
    if (task.taskInfo?.scheduleDate) {
      const scheduleDateStr = task.taskInfo.scheduleDate.split('T')[0]
      if (last7Days.hasOwnProperty(scheduleDateStr)) {
        last7Days[scheduleDateStr].scheduled++
      }
    }

    // Count completed tasks
    if (status === 'done' && task.completedAt) {
      const completedDateStr = task.completedAt.split('T')[0]
      if (last7Days.hasOwnProperty(completedDateStr)) {
        last7Days[completedDateStr].completed++
      }
    }
  })

  return Object.entries(last7Days).map(([date, counts]) => ({
    date,
    label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
    scheduled: counts.scheduled,
    completed: counts.completed,
  }))
})

const maxDailyCount = computed(() => {
  return Math.max(...tasksByDate.value.map((d) => Math.max(d.scheduled, d.completed)), 1)
})

// Status distribution chart
const statusChartData = computed(() => {
  const total = totalTasks.value
  if (total === 0) return { segments: [], total: 0 }

  const segments = [
    { label: 'Todo', value: tasksByStatus.value.todo, color: '#6366f1' },
    { label: 'Done', value: tasksByStatus.value.done, color: '#22c55e' },
    { label: 'Canceled', value: tasksByStatus.value.canceled, color: '#6b7280' },
  ].filter((s) => s.value > 0)

  return { segments, total }
})

// Calculate pie chart offset for segments
const getPieChartOffset = (index: number) => {
  let offset = 0
  for (let i = 0; i < index; i++) {
    const segment = statusChartData.value.segments[i]
    offset -= (segment.value / statusChartData.value.total) * 314.16
  }
  return offset
}

// Overdue distribution
const overdueDistribution = computed(() => {
  const distribution: Record<string, number> = {
    '1-3 days': 0,
    '4-7 days': 0,
    '8-14 days': 0,
    '15+ days': 0,
  }

  overdueTasks.value.forEach((task) => {
    const days = getDaysOverdue(task)
    if (days >= 1 && days <= 3) {
      distribution['1-3 days']++
    } else if (days >= 4 && days <= 7) {
      distribution['4-7 days']++
    } else if (days >= 8 && days <= 14) {
      distribution['8-14 days']++
    } else if (days >= 15) {
      distribution['15+ days']++
    }
  })

  return Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }))
})

const maxOverdueCount = computed(() => {
  return Math.max(...overdueDistribution.value.map((d) => d.count), 1)
})

const loadTasks = async (forceRefresh = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  isLoading.value = true
  error.value = null

  // Count API calls needed
  let apiCallCount = 0
  if (forceRefresh || !getCachedData('inbox')) apiCallCount++
  if (forceRefresh || !getCachedData('active')) apiCallCount++
  if (forceRefresh || !getCachedData('upcoming')) apiCallCount++
  if (forceRefresh || !getCachedData('logbook')) apiCallCount++

  totalApiCalls.value = apiCallCount
  completedApiCalls.value = 0

  try {
    // Load inbox tasks
    if (!forceRefresh) {
      const cachedInbox = getCachedData('inbox')
      if (cachedInbox) {
        inboxTasks.value = cachedInbox
      } else {
        const inboxResult = await fetchTasks('inbox')
        completedApiCalls.value++
        inboxTasks.value = inboxResult.items
        setCachedData('inbox', inboxResult.items)
      }
    } else {
      const inboxResult = await fetchTasks('inbox')
      completedApiCalls.value++
      inboxTasks.value = inboxResult.items
      setCachedData('inbox', inboxResult.items)
    }

    // Load active tasks
    if (!forceRefresh) {
      const cachedActive = getCachedData('active')
      if (cachedActive) {
        activeTasks.value = cachedActive
      } else {
        const activeResult = await fetchTasks('active')
        completedApiCalls.value++
        activeTasks.value = activeResult.items
        setCachedData('active', activeResult.items)
      }
    } else {
      const activeResult = await fetchTasks('active')
      completedApiCalls.value++
      activeTasks.value = activeResult.items
      setCachedData('active', activeResult.items)
    }

    // Load upcoming tasks
    if (!forceRefresh) {
      const cachedUpcoming = getCachedData('upcoming')
      if (cachedUpcoming) {
        upcomingTasks.value = cachedUpcoming
      } else {
        const upcomingResult = await fetchTasks('upcoming')
        completedApiCalls.value++
        upcomingTasks.value = upcomingResult.items
        setCachedData('upcoming', upcomingResult.items)
      }
    } else {
      const upcomingResult = await fetchTasks('upcoming')
      completedApiCalls.value++
      upcomingTasks.value = upcomingResult.items
      setCachedData('upcoming', upcomingResult.items)
    }

    // Load logbook tasks (completed/cancelled tasks)
    if (!forceRefresh) {
      const cachedLogbook = getCachedData('logbook')
      if (cachedLogbook) {
        logbookTasks.value = cachedLogbook
      } else {
        const logbookResult = await fetchTasks('logbook')
        completedApiCalls.value++
        logbookTasks.value = logbookResult.items
        setCachedData('logbook', logbookResult.items)
      }
    } else {
      const logbookResult = await fetchTasks('logbook')
      completedApiCalls.value++
      logbookTasks.value = logbookResult.items
      setCachedData('logbook', logbookResult.items)
    }

    lastUpdated.value = Date.now()

    // Save to widget data
    emit('update:data', {
      lastUpdated: lastUpdated.value,
      totalTasks: totalTasks.value,
      overdueCount: overdueCount.value,
    })
  } catch (err) {
    console.error('Failed to load tasks:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load task statistics'
  } finally {
    isLoading.value = false
  }
}

const refresh = () => {
  loadTasks(true)
}

onMounted(() => {
  loadTasks()
})
</script>

<template>
  <div class="task-stats-widget">
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading task stats"
      />
    </div>

    <div v-else class="stats-content">
      <!-- Overview Stats -->
      <div class="stats-section">
        <h3 class="section-title">Overview</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <CheckSquare :size="20" class="stat-icon" />
            <div class="stat-info">
              <div class="stat-value">{{ totalTasks }}</div>
              <div class="stat-label">Total Tasks</div>
            </div>
          </div>
          <div class="stat-card">
            <AlertCircle :size="20" class="stat-icon overdue" />
            <div class="stat-info">
              <div class="stat-value">{{ overdueCount }}</div>
              <div class="stat-label">Overdue</div>
            </div>
          </div>
          <div class="stat-card">
            <TrendingUp :size="20" class="stat-icon recurring" />
            <div class="stat-info">
              <div class="stat-value">{{ recurringCount }}</div>
              <div class="stat-label">Recurring</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status Distribution Chart -->
      <div v-if="statusChartData.total > 0" class="stats-section">
        <h3 class="section-title">Status Distribution</h3>
        <div class="chart-container">
          <svg viewBox="0 0 120 120" class="pie-chart">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--bg-tertiary)"
              stroke-width="20"
            />
            <g v-for="(segment, index) in statusChartData.segments" :key="segment.label">
              <circle
                v-if="index === 0"
                cx="60"
                cy="60"
                r="50"
                fill="none"
                :stroke="segment.color"
                stroke-width="20"
                :stroke-dasharray="`${(segment.value / statusChartData.total) * 314.16} 314.16`"
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
                :stroke-dasharray="`${(segment.value / statusChartData.total) * 314.16} 314.16`"
                :stroke-dashoffset="getPieChartOffset(index)"
                transform="rotate(-90 60 60)"
              />
            </g>
          </svg>
          <div class="chart-legend">
            <div
              v-for="segment in statusChartData.segments"
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

      <!-- Overdue Distribution -->
      <div v-if="overdueCount > 0" class="stats-section">
        <h3 class="section-title">Overdue Distribution</h3>
        <div class="chart-container">
          <div v-for="item in overdueDistribution" :key="item.label" class="bar-chart">
            <div class="bar-chart-label">{{ item.label }}</div>
            <div class="bar-chart-bar-container">
              <div
                class="bar-chart-bar overdue-bar"
                :style="{
                  width: `${(item.count / maxOverdueCount) * 100}%`,
                }"
              >
                <span class="bar-value">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tasks by Date -->
      <div v-if="tasksByDate.length > 0" class="stats-section">
        <h3 class="section-title">Activity This Week</h3>
        <div class="timeline-chart">
          <div
            v-for="day in tasksByDate"
            :key="day.date"
            class="timeline-bar"
            :title="`${day.date}: ${day.scheduled} scheduled, ${day.completed} completed`"
          >
            <div class="timeline-bars">
              <div
                class="timeline-bar-fill scheduled"
                :style="{ height: `${(day.scheduled / maxDailyCount) * 100}%` }"
              ></div>
              <div
                class="timeline-bar-fill completed"
                :style="{ height: `${(day.completed / maxDailyCount) * 100}%` }"
              ></div>
            </div>
            <div class="timeline-bar-label">{{ day.label }}</div>
            <div class="timeline-bar-value">
              <span class="scheduled-value">{{ day.scheduled }}</span>
              <span class="completed-value">{{ day.completed }}</span>
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
.task-stats-widget {
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

.stat-icon.overdue {
  color: #ef4444;
}

.stat-icon.recurring {
  color: #6366f1;
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

.bar-chart-bar.overdue-bar {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
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
}

.timeline-bar-fill.scheduled {
  background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
}

.timeline-bar-fill.completed {
  background: linear-gradient(180deg, #22c55e 0%, #15803d 100%);
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
  display: flex;
  gap: 4px;
}

.scheduled-value {
  color: #6366f1;
}

.completed-value {
  color: #22c55e;
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

  .timeline-chart {
    height: 100px;
    gap: 6px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
