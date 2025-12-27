<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  CheckSquare,
  RefreshCw,
  FileText,
  Calendar,
  Search,
  RotateCw,
  Link as LinkIcon,
  Settings,
} from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import {
  fetchTasks,
  searchDocuments,
  fetchDocuments,
  getCacheExpiryMs,
  getCraftLinkPreference,
  openCraftLink,
  type CraftTask,
  type CraftDocument,
} from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

// Configuration
const isConfiguring = ref(!props.widget.data?.documentId)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const error = ref<string | null>(null)

// Data
const documentId = ref<string | null>(props.widget.data?.documentId || null)
const documentTitle = ref<string | null>(props.widget.data?.documentTitle || null)
const tasks = ref<CraftTask[]>([])
const isLoading = ref(false)
const dailyNotes = ref<Map<string, CraftDocument>>(new Map())
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

// Cache keys
const CACHE_PREFIX = 'tasks-cache-'

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Search documents with debounce
const performSearch = async () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  searchDebounceTimer = setTimeout(async () => {
    isSearching.value = true
    error.value = null

    try {
      const results = await searchDocuments(searchQuery.value)
      const limitedResults = results.slice(0, 5)

      searchResults.value = limitedResults.map((doc) => ({
        id: doc.id,
        title: doc.title,
        snippet: doc.snippet,
      }))
    } catch (err) {
      console.error('Search error:', err)
      error.value = err instanceof Error ? err.message : 'Failed to search'
    } finally {
      isSearching.value = false
    }
  }, 500)
}

// Select a document
const selectDocument = async (docId: string, title: string) => {
  documentId.value = docId
  documentTitle.value = title
  isConfiguring.value = false

  emit('update:data', {
    documentId: docId,
    documentTitle: title,
  })
  emit('update:title', title)

  await loadTasks(true)
}

// Cache helpers
const getCachedData = (): CraftTask[] | null => {
  if (!documentId.value) return null
  const cacheKey = `${CACHE_PREFIX}document-${documentId.value}`
  const cached = localStorage.getItem(cacheKey)
  if (!cached) return null

  try {
    const { data, timestamp } = JSON.parse(cached)
    const cacheExpiryMs = getCacheExpiryMs()
    if (cacheExpiryMs === 0) return null // Caching disabled

    const cacheAge = Date.now() - timestamp
    if (cacheAge > cacheExpiryMs) {
      localStorage.removeItem(cacheKey)
      return null
    }
    return data
  } catch {
    return null
  }
}

const setCachedData = (data: CraftTask[]) => {
  if (!documentId.value) return
  const cacheKey = `${CACHE_PREFIX}document-${documentId.value}`
  localStorage.setItem(
    cacheKey,
    JSON.stringify({
      data,
      timestamp: Date.now(),
    }),
  )
}

// Load tasks for the document
const loadTasks = async (forceRefresh = false) => {
  if (!documentId.value) {
    tasks.value = []
    return
  }

  error.value = null

  // Try cache first if not forcing refresh (before setting loading state)
  if (!forceRefresh) {
    const cached = getCachedData()
    if (cached) {
      tasks.value = cached
      // Still load daily notes for date navigation (but don't show loading for this)
      await loadDailyNotes()
      return
    }
  }

  // Only set loading state if we need to fetch from API
  isLoading.value = true
  totalApiCalls.value = 3
  completedApiCalls.value = 0

  try {

    // Fetch all tasks from different scopes
    const [inboxResult, activeResult, upcomingResult] = await Promise.all([
      fetchTasks('inbox').then((result) => {
        completedApiCalls.value++
        return result
      }),
      fetchTasks('active').then((result) => {
        completedApiCalls.value++
        return result
      }),
      fetchTasks('upcoming').then((result) => {
        completedApiCalls.value++
        return result
      }),
    ])

    // Combine all tasks
    const allTasks = [
      ...inboxResult.items,
      ...activeResult.items,
      ...upcomingResult.items,
    ]

    // Filter tasks for this document
    const documentTasks = allTasks.filter(
      (task) => task.location?.documentId === documentId.value,
    )

    tasks.value = documentTasks
    setCachedData(documentTasks)

    // Load daily notes for date navigation
    await loadDailyNotes()
  } catch (err) {
    console.error('Error loading tasks:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load tasks'
    completedApiCalls.value = totalApiCalls.value // Mark all as completed on error
  } finally {
    isLoading.value = false
  }
}

// Refresh tasks
const refreshTasks = () => {
  loadTasks(true)
}

// Helper function to extract title from markdown
function extractTitleFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^-\s*\[[x\s~]\]\s*/, '')
    .replace(/^\s*-\s*\[[x\s~]\]\s*/, '')
    .trim()
}

// Helper function to get task status
function getTaskStatus(task: CraftTask): string {
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

// Helper function to get due date
function getDueDate(task: CraftTask): string | null {
  return task.taskInfo?.scheduleDate || task.taskInfo?.deadlineDate || null
}

// Helper function to format due date
function formatDueDate(task: CraftTask): string {
  const dueDate = getDueDate(task)
  if (!dueDate) return ''

  const date = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const taskDate = new Date(date)
  taskDate.setHours(0, 0, 0, 0)

  const diffTime = taskDate.getTime() - today.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Check if task is overdue
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

// Check if task has deadline
function hasDeadline(task: CraftTask): boolean {
  return !!task.taskInfo?.deadlineDate
}

function getDaysUntilDeadline(task: CraftTask): number | null {
  const deadlineDate = task.taskInfo?.deadlineDate
  if (!deadlineDate) return null

  const deadline = new Date(deadlineDate)
  deadline.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = deadline.getTime() - today.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

function isDeadlineApproaching(task: CraftTask): boolean {
  const days = getDaysUntilDeadline(task)
  return days !== null && days <= 3 && days >= 0
}

function isDeadlineOverdue(task: CraftTask): boolean {
  const days = getDaysUntilDeadline(task)
  return days !== null && days < 0
}

// Check if task is recurring
function isRecurringTask(task: CraftTask): boolean {
  return !!task.repeat
}

// Helper function to get document ID
function getDocumentId(task: CraftTask): string | null {
  return task.location?.documentId || null
}

// Helper function to get document title
function getDocumentTitle(task: CraftTask): string | null {
  return task.location?.title || null
}

// Open task in Craft
async function openTaskInCraft(task: CraftTask) {
  const docId = task.location?.documentId || task.id
  // Try to get clickableLink from daily notes cache
  const dailyNote = dailyNotes.value.get(docId)
  const clickableLink = dailyNote?.clickableLink
  await openCraftLink(task.id, docId, clickableLink)
}

// Open document in Craft
async function openDocumentInCraft(task: CraftTask) {
  const docId = getDocumentId(task)
  if (docId) {
    // Try to get clickableLink from daily notes cache
    const dailyNote = dailyNotes.value.get(docId)
    const clickableLink = dailyNote?.clickableLink
    await openCraftLink(docId, docId, clickableLink)
  }
}

// Open the configured document
async function openConfiguredDocument() {
  if (documentId.value) {
    // Try to get clickableLink from daily notes cache
    const dailyNote = dailyNotes.value.get(documentId.value)
    const clickableLink = dailyNote?.clickableLink
    await openCraftLink(documentId.value, documentId.value, clickableLink)
  }
}

// Load daily notes
const loadDailyNotes = async () => {
  try {
    const result = await fetchDocuments({ location: 'daily_notes', fetchMetadata: true })
    const notesMap = new Map<string, CraftDocument>()
    
    result.items.forEach((doc) => {
      if (doc.dailyNoteDate) {
        notesMap.set(doc.dailyNoteDate, doc)
      }
    })
    
    dailyNotes.value = notesMap
  } catch (error) {
    console.error('Error loading daily notes:', error)
    dailyNotes.value = new Map()
  }
}

// Format date as YYYY-MM-DD for Craft
const formatDateForCraft = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Get daily note for a date
const getDailyNoteForDate = (date: Date): CraftDocument | null => {
  const dateStr = formatDateForCraft(date)
  return dailyNotes.value.get(dateStr) || null
}

// Check if a daily note exists for a date
const hasDailyNote = (date: Date): boolean => {
  const dateStr = formatDateForCraft(date)
  return dailyNotes.value.has(dateStr)
}

// Open day in Craft
async function openDayInCraft(date: Date) {
  const dailyNote = getDailyNoteForDate(date)

  // Only open if daily note exists and has a clickableLink
  if (!dailyNote || !dailyNote.clickableLink) {
    return
  }

  const preference = getCraftLinkPreference()

  if (preference === 'web') {
    // Use the clickableLink from the daily note
    window.open(dailyNote.clickableLink, '_blank')
  } else {
    // For app, use the document ID
    const documentId = dailyNote.id
    if (documentId) {
      await openCraftLink(documentId, documentId)
    }
  }
}

// Handle due date click
function handleDueDateClick(task: CraftTask) {
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return

  const date = new Date(scheduleDate)
  date.setHours(0, 0, 0, 0)
  if (hasDailyNote(date)) {
    openDayInCraft(date)
  }
}

// Reconfigure - allow user to choose a different document
const reconfigure = () => {
  isConfiguring.value = true
  searchQuery.value = ''
  searchResults.value = []
}

// Filter displayed tasks (only todo)
const displayedTasks = computed(() => {
  return tasks.value
    .filter((task) => {
      const status = getTaskStatus(task)
      return status === 'todo'
    })
    .sort((a, b) => {
      const dateA = a.taskInfo?.scheduleDate
      const dateB = b.taskInfo?.scheduleDate
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (dateA && dateB) {
        const taskDateA = new Date(dateA)
        taskDateA.setHours(0, 0, 0, 0)
        const taskDateB = new Date(dateB)
        taskDateB.setHours(0, 0, 0, 0)

        const isFutureA = taskDateA >= today
        const isFutureB = taskDateB >= today

        if (isFutureA && !isFutureB) return -1
        if (!isFutureA && isFutureB) return 1
        return taskDateA.getTime() - taskDateB.getTime()
      }

      if (dateA && !dateB) return -1
      if (!dateA && dateB) return 1

      const titleA = extractTitleFromMarkdown(a.markdown).toLowerCase()
      const titleB = extractTitleFromMarkdown(b.markdown).toLowerCase()
      return titleA.localeCompare(titleB)
    })
})

// Initialize
onMounted(() => {
  if (documentId.value) {
    loadTasks()
  }
})

// Watch for document changes
watch(
  () => props.widget.data?.documentId,
  (newDocId) => {
    if (newDocId && newDocId !== documentId.value) {
      documentId.value = newDocId
      documentTitle.value = props.widget.data?.documentTitle || null
      loadTasks()
    }
  },
)
</script>

<template>
  <div class="document-tasks-widget">
    <!-- Configuration Mode -->
    <div v-if="isConfiguring" class="config-mode">
      <div class="search-section">
        <div class="search-input-wrapper">
          <Search :size="18" class="search-icon" />
          <input
            v-model="searchQuery"
            @input="performSearch"
            @keyup.enter="performSearch"
            type="text"
            placeholder="Search for a document..."
            class="search-input"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div v-if="isSearching" class="loading-state">
          <div class="spinner"></div>
          <span>Searching...</span>
        </div>

        <div v-if="searchResults.length > 0" class="search-results">
          <button
            v-for="result in searchResults"
            :key="result.id"
            @click="selectDocument(result.id, result.title)"
            class="search-result-item"
          >
            <FileText :size="16" />
            <div class="result-info">
              <div class="result-title">{{ result.title }}</div>
              <div v-if="result.snippet" class="result-snippet">
                {{ result.snippet.replace(/\*\*/g, '').substring(0, 100) }}...
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Display Mode -->
    <div v-else class="widget-content">
      <div v-if="error" class="error-message">{{ error }}</div>

      <div v-if="isLoading" class="loading-state">
        <ProgressIndicator
          :completed="completedApiCalls"
          :total="totalApiCalls"
          message="Loading tasks"
        />
      </div>

      <div v-else-if="displayedTasks.length === 0" class="empty-state">
        <CheckSquare :size="32" class="empty-icon" />
        <p class="empty-text">No tasks found</p>
      </div>

      <div v-else class="tasks-table-container">
        <table class="tasks-table">
          <thead>
            <tr>
              <th class="col-title">Title</th>
              <th class="col-due-date">Due Date</th>
              <th class="col-overdue">Overdue</th>
              <th class="col-deadline">Deadline</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in displayedTasks"
              :key="task.id"
              class="task-row"
              :class="`status-${getTaskStatus(task)}`"
            >
              <td class="col-title">
                <span class="task-title" @click="openTaskInCraft(task)">
                  {{ extractTitleFromMarkdown(task.markdown) }}
                </span>
                <RotateCw
                  v-if="isRecurringTask(task)"
                  :size="12"
                  class="recurring-icon-inline"
                  title="Recurring task"
                />
              </td>
              <td class="col-due-date">
                <div
                  v-if="getDueDate(task)"
                  class="task-meta"
                  :class="{ 'task-due-date-clickable': task.taskInfo?.scheduleDate && hasDailyNote(new Date(task.taskInfo.scheduleDate)) }"
                  @click.stop="handleDueDateClick(task)"
                >
                  <Calendar :size="14" />
                  <span>{{ formatDueDate(task) }}</span>
                </div>
                <span v-else class="task-meta-empty">—</span>
              </td>
              <td class="col-overdue">
                <span
                  v-if="isTaskOverdue(task)"
                  class="overdue-badge"
                  :title="`Overdue by ${getDaysOverdue(task)} day${getDaysOverdue(task) !== 1 ? 's' : ''}`"
                >
                  {{ getDaysOverdue(task) }}d
                </span>
                <span v-else class="task-meta-empty">—</span>
              </td>
              <td class="col-deadline">
                <span
                  v-if="hasDeadline(task) && getDaysUntilDeadline(task) !== null"
                  class="deadline-badge"
                  :class="{
                    'deadline-overdue': isDeadlineOverdue(task),
                    'deadline-approaching':
                      isDeadlineApproaching(task) && !isDeadlineOverdue(task),
                  }"
                  :title="
                    isDeadlineOverdue(task)
                      ? `Deadline overdue by ${Math.abs(getDaysUntilDeadline(task) || 0)} day${Math.abs(getDaysUntilDeadline(task) || 0) !== 1 ? 's' : ''}`
                      : `Deadline in ${getDaysUntilDeadline(task)} day${getDaysUntilDeadline(task) !== 1 ? 's' : ''}`
                  "
                >
                  {{
                    isDeadlineOverdue(task)
                      ? `-${Math.abs(getDaysUntilDeadline(task) || 0)}d`
                      : `${getDaysUntilDeadline(task)}d`
                  }}
                </span>
                <span v-else class="task-meta-empty">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer with action buttons -->
      <div v-if="!isLoading" class="widget-footer">
        <button
          v-if="documentId"
          @click="openConfiguredDocument"
          class="footer-button"
          title="Open document in Craft"
        >
          <LinkIcon :size="14" />
        </button>
        <button v-if="displayedTasks.length > 0" @click="refreshTasks" class="footer-button" title="Refresh tasks">
          <RefreshCw :size="14" />
        </button>
        <button @click="reconfigure" class="footer-button" title="Configure document">
          <Settings :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.document-tasks-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-mode {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.search-result-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.result-snippet {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 38px; /* Space for footer buttons */
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.widget-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.refresh-button {
  padding: 6px;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.error-message {
  padding: 12px 16px;
  color: var(--btn-danger-bg);
  font-size: 13px;
  background: rgba(244, 63, 94, 0.1);
  border-radius: 4px;
  margin: 12px 16px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-secondary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--btn-primary-bg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  text-align: center;
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.tasks-table-container {
  flex: 1;
  overflow-x: auto;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-tertiary);
}

.tasks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.tasks-table thead {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 1;
}

.tasks-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-primary);
  white-space: nowrap;
}

.tasks-table tbody tr {
  border-bottom: 1px solid var(--border-secondary);
  transition: background 0.15s ease;
}

.tasks-table tbody tr:hover {
  background: var(--bg-primary);
}

.tasks-table tbody tr:last-child {
  border-bottom: none;
}

.tasks-table td {
  padding: 8px 10px;
  vertical-align: middle;
  font-weight: 500;
  color: var(--text-secondary);
}

.col-title {
  min-width: 200px;
  max-width: 400px;
}

.col-due-date {
  width: 140px;
}

.col-overdue {
  width: 100px;
  text-align: center;
}

.col-deadline {
  width: 100px;
  text-align: center;
}

.task-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: color 0.2s ease;
  display: inline-block;
}

.task-title:hover {
  color: var(--btn-primary-bg);
}

.recurring-icon-inline {
  display: inline-block;
  margin-left: 6px;
  color: var(--text-secondary);
  opacity: 0.7;
  vertical-align: middle;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.task-meta-empty {
  color: var(--text-tertiary);
  font-size: 12px;
}

.task-due-date-clickable {
  cursor: pointer;
  transition: color 0.2s ease;
}

.task-due-date-clickable:hover {
  color: var(--btn-primary-bg);
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
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
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

.tasks-table .overdue-badge,
.tasks-table .deadline-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.tasks-table .overdue-badge {
  background: #ef4444;
  color: white;
}

.tasks-table .deadline-badge {
  background: #f59e0b;
  color: white;
}

.tasks-table .deadline-badge.deadline-overdue {
  background: #ef4444;
}

.tasks-table .deadline-badge.deadline-approaching {
  background: #f59e0b;
}
</style>

