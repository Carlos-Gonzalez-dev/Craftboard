<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, inject, watch, nextTick, h } from 'vue'
import {
  CheckSquare,
  RefreshCw,
  Inbox,
  Calendar,
  CalendarDays,
  FileText,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CircleCheck,
} from 'lucide-vue-next'
import {
  getApiUrl,
  getCraftLinkPreference,
  openCraftLink,
  type CraftTask,
  type CraftDocument,
} from '../utils/craftApi'
import type { CalendarEvent } from '../utils/icalParser'
import { useRoute } from 'vue-router'
import { useTasksStore } from '../stores/tasks'
import { useTasksApiStore } from '../stores/tasksApi'
import ViewSubheader from '../components/ViewSubheader.vue'
import ViewTabs from '../components/ViewTabs.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const route = useRoute()
const tasksStore = useTasksStore()
const tasksApiStore = useTasksApiStore()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

// Store computed properties
const inboxTasks = computed(() => tasksApiStore.inboxTasks)
const activeTasks = computed(() => tasksApiStore.activeTasks)
const upcomingTasks = computed(() => tasksApiStore.upcomingTasks)
const logbookTasks = computed(() => tasksApiStore.logbookTasks)
const dailyNotesDoneTasks = computed(() => tasksApiStore.dailyNotesDoneTasks)
const dailyNotes = computed(() => tasksApiStore.dailyNotes)
const calendarEvents = computed(() => tasksApiStore.calendarEvents)
const isLoading = computed(() => tasksApiStore.isLoading)
const isLoadingLogbook = computed(() => tasksApiStore.isLoadingLogbook)
const isLoadingWeekTasks = computed(() => tasksApiStore.isLoadingWeekTasks)
const isLoadingCalendar = computed(() => tasksApiStore.isLoadingCalendar)
const totalApiCalls = computed(() => tasksApiStore.totalApiCalls)
const completedApiCalls = computed(() => tasksApiStore.completedApiCalls)

// UI State
const errorMessage = ref('')

// View mode with localStorage persistence
const VIEW_MODE_STORAGE_KEY = 'tasks-view-mode'
const viewMode = ref<'list' | 'week'>(
  (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as 'list' | 'week') || 'week',
)

// Initialize activeTab based on view mode
// If week view, must use 'all' tab to show all tasks including completed ones
const activeTab = ref<'all' | 'inbox' | 'active' | 'upcoming' | 'done'>(
  viewMode.value === 'week' ? 'all' : 'active',
)

// Handle tab change - disable in week view (except for 'done')
function handleTabChange(tab: string) {
  // In week view, only allow 'all' and 'done' tabs
  if (viewMode.value === 'week' && tab !== 'all' && tab !== 'done') {
    return
  }
  activeTab.value = tab as 'all' | 'inbox' | 'active' | 'upcoming' | 'done'

  // Lazy load logbook and current week tasks when Done tab is selected
  if (tab === 'done') {
    loadDoneTasks()
  }
}

// Load done tasks (logbook + current week from daily notes)
async function loadDoneTasks() {
  // Load logbook if not loaded
  if (logbookTasks.value.length === 0) {
    tasksApiStore.loadLogbook()
  }
  // Load current week tasks from daily notes
  await tasksApiStore.loadWeekTasks(currentWeekStart.value)
}

// Watch view mode changes and save to localStorage
watch(viewMode, (newMode) => {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode)
  // When switching to week view, set to 'all' unless already on 'done'
  if (newMode === 'week' && activeTab.value !== 'done') {
    activeTab.value = 'all'
  }
  // Reinitialize scroll listeners when switching to week view
  if (newMode === 'week') {
    nextTick(() => {
      setupScrollListeners()
    })
  }
})

// Ensure activeTab stays as 'all' or 'done' when in week view
watch(activeTab, (newTab) => {
  if (viewMode.value === 'week' && newTab !== 'all' && newTab !== 'done') {
    activeTab.value = 'all'
  }
})

// Week view state - initialize to current week's Monday
function getCurrentWeekMonday(): Date {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(today)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

const currentWeekStart = ref<Date>(getCurrentWeekMonday())

// Watch week navigation to load tasks when on Done tab
watch(currentWeekStart, (newWeekStart) => {
  if (activeTab.value === 'done' && !tasksApiStore.isWeekLoaded(newWeekStart)) {
    tasksApiStore.loadWeekTasks(newWeekStart)
  }
})

// Week grid scroll container ref
const weekGridScrollContainer = ref<HTMLElement | null>(null)

// Check if we're on mobile
const isMobile = ref(false)
function checkMobile() {
  isMobile.value = window.innerWidth <= 1160
}

// Tabs configuration
const tabs = computed(() => {
  const baseTabs = [
    { id: 'all', label: 'All', icon: CheckSquare, isProject: true },
    { id: 'inbox', label: 'Inbox', icon: Inbox, isProject: true },
    { id: 'active', label: 'Active', icon: CalendarDays, isProject: true },
    { id: 'upcoming', label: 'Upcoming', icon: Calendar, isProject: true },
    { id: 'done', label: 'Done', icon: CircleCheck, isProject: false },
  ]

  // In week view, disable all tabs except 'all' and 'done'
  if (viewMode.value === 'week') {
    return baseTabs.map((tab) => ({
      ...tab,
      disabled: tab.id !== 'all' && tab.id !== 'done',
    }))
  }

  return baseTabs
})

// Get all tasks combined
const allTasks = computed(() => {
  const all = [...inboxTasks.value, ...activeTasks.value, ...upcomingTasks.value]
  // Remove duplicates by id
  const unique = new Map<string, CraftTask>()
  all.forEach((task) => {
    if (!unique.has(task.id)) {
      unique.set(task.id, task)
    }
  })
  const result = Array.from(unique.values())

  // Debug: Log all tasks

  return result
})

// Get tasks for active tab
const displayedTasks = computed(() => {
  let tasks: CraftTask[] = []
  switch (activeTab.value) {
    case 'inbox':
      tasks = inboxTasks.value
      break
    case 'active':
      tasks = activeTasks.value
      break
    case 'upcoming':
      tasks = upcomingTasks.value
      break
    case 'done':
      // For done tab, combine logbook + daily notes tasks (excluding subtasks)
      const allDoneTasks = [...logbookTasks.value, ...dailyNotesDoneTasks.value]
      // Deduplicate by task ID
      const seenIds = new Set<string>()
      tasks = allDoneTasks.filter((task) => {
        if (seenIds.has(task.id)) return false
        seenIds.add(task.id)
        if (isSubtask(task)) return false
        const title = extractTitleFromMarkdown(task.markdown || '')
        return title && title.trim() !== ''
      })
      // Sort by completedAt descending (most recent first)
      tasks.sort((a, b) => {
        const dateA = a.taskInfo?.completedAt || a.completedAt || ''
        const dateB = b.taskInfo?.completedAt || b.completedAt || ''
        return dateB.localeCompare(dateA)
      })
      return tasks
    case 'all':
    default:
      tasks = allTasks.value
  }

  // Only show todo tasks (exclude done and canceled) and filter out empty titles
  tasks = tasks.filter((task) => {
    const status = getTaskStatus(task)
    if (status !== 'todo') {
      return false
    }
    // Filter out tasks with empty titles
    const title = extractTitleFromMarkdown(task.markdown || '')
    return title && title.trim() !== ''
  })

  // Sort tasks: first by scheduled date (upcoming first), then alphabetically for those without dates
  tasks.sort((a, b) => {
    const dateA = a.taskInfo?.scheduleDate
    const dateB = b.taskInfo?.scheduleDate
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Both have dates
    if (dateA && dateB) {
      const taskDateA = new Date(dateA)
      taskDateA.setHours(0, 0, 0, 0)
      const taskDateB = new Date(dateB)
      taskDateB.setHours(0, 0, 0, 0)

      // Sort by date: upcoming (future) dates first, then past dates
      // Within each group, sort chronologically
      const isFutureA = taskDateA >= today
      const isFutureB = taskDateB >= today

      if (isFutureA && !isFutureB) {
        return -1 // A is future, B is past - A comes first
      }
      if (!isFutureA && isFutureB) {
        return 1 // A is past, B is future - B comes first
      }
      // Both in same category (both future or both past), sort by date
      return taskDateA.getTime() - taskDateB.getTime()
    }

    // Only A has date
    if (dateA && !dateB) {
      return -1 // Tasks with dates come before those without
    }

    // Only B has date
    if (!dateA && dateB) {
      return 1 // Tasks with dates come before those without
    }

    // Neither has date - sort alphabetically by title
    const titleA = extractTitleFromMarkdown(a.markdown).toLowerCase()
    const titleB = extractTitleFromMarkdown(b.markdown).toLowerCase()
    return titleA.localeCompare(titleB)
  })

  return tasks
})

// Helper function to extract title from markdown (remove checkbox syntax)
function extractTitleFromMarkdown(markdown: string): string {
  // Remove checkbox syntax: - [ ] or - [x] or - [~]
  return markdown
    .replace(/^-\s*\[[x\s~]\]\s*/, '')
    .replace(/^\s*-\s*\[[x\s~]\]\s*/, '')
    .trim()
}

// Helper function to check if a task is a subtask (indented in markdown)
function isSubtask(task: CraftTask): boolean {
  const markdown = task.markdown || ''
  // Subtasks have leading whitespace before the "- [ ]" checkbox
  return markdown.startsWith(' ') || markdown.startsWith('\t')
}

// Helper function to get task status
function getTaskStatus(task: CraftTask): string {
  // First check taskInfo.state
  if (task.taskInfo?.state) {
    return task.taskInfo.state
  }

  // Fallback to checking canceledAt and completedAt
  if (task.canceledAt) {
    return 'canceled'
  }

  if (task.completedAt) {
    return 'done'
  }

  return 'todo'
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

// Check if a task is overdue and shown on its original scheduled date
function isOverdueOnScheduledDate(task: CraftTask, date: Date): boolean {
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return false

  if (!isTaskOverdue(task)) return false

  const taskDate = new Date(scheduleDate)
  taskDate.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)

  // Check if this is the original scheduled date
  return taskDate.getTime() === checkDate.getTime()
}

// Helper function to get due date
function getDueDate(task: CraftTask): string | null {
  return task.taskInfo?.scheduleDate || task.taskInfo?.deadlineDate || null
}

// Helper function to format due date for display
function formatDueDate(task: CraftTask): string {
  const dueDate = getDueDate(task)
  if (!dueDate) return ''
  return new Date(dueDate).toLocaleDateString()
}

// Helper function to format completed date for display
function formatCompletedDate(task: CraftTask): string {
  const completedAt = task.taskInfo?.completedAt || task.completedAt
  if (!completedAt) return ''
  return new Date(completedAt).toLocaleDateString()
}

// Helper function to check if task has a deadline
function hasDeadline(task: CraftTask): boolean {
  return !!task.taskInfo?.deadlineDate
}

// Helper function to get days until deadline (negative if overdue)
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

// Helper function to check if deadline is approaching (within 3 days) or overdue
function isDeadlineApproaching(task: CraftTask): boolean {
  const daysUntil = getDaysUntilDeadline(task)
  if (daysUntil === null) return false
  return daysUntil <= 3 && daysUntil >= 0
}

// Helper function to check if deadline is overdue
function isDeadlineOverdue(task: CraftTask): boolean {
  const daysUntil = getDaysUntilDeadline(task)
  if (daysUntil === null) return false
  return daysUntil < 0
}

// Helper function to get document ID
function getDocumentId(task: CraftTask): string | null {
  return task.location?.documentId || null
}

// Helper function to get document title
function getDocumentTitle(task: CraftTask): string | null {
  return task.location?.title || null
}

// Week view helpers
function getWeekDays(): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(currentWeekStart.value)
    date.setDate(date.getDate() + i)
    days.push(date)
  }
  return days
}

function formatDayHeader(date: Date): string {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dayNumber = date.getDate()
  return `${dayName} ${dayNumber}`
}

function formatEventTime(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${startTime} - ${endTime}`
}

function isToday(date: Date): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateCopy = new Date(date)
  dateCopy.setHours(0, 0, 0, 0)
  return dateCopy.getTime() === today.getTime()
}

function formatDateForCraft(date: Date): string {
  // Format as YYYY-MM-DD for Craft daily notes
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
    // For app, use the document ID with clickableLink for potential future use
    const documentId = dailyNote.id
    if (documentId) {
      await openCraftLink(documentId, documentId, dailyNote.clickableLink)
    }
  }
}

// Handle day header click - only if daily note exists
function handleDayClick(day: Date) {
  if (hasDailyNote(day)) {
    openDayInCraft(day)
  }
}

// Handle due date click - only if daily note exists
function handleDueDateClick(task: CraftTask) {
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return

  const date = new Date(scheduleDate)
  date.setHours(0, 0, 0, 0)
  if (hasDailyNote(date)) {
    openDayInCraft(date)
  }
}

// Check if a specific date is a future occurrence of a recurring task
function isDateAFutureOccurrence(task: CraftTask, date: Date, today: Date): boolean {
  const repeat = task.repeat
  if (!repeat || !repeat.startDate) return false

  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return false

  const startDate = new Date(repeat.startDate)
  startDate.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)
  const originalDate = new Date(scheduleDate)
  originalDate.setHours(0, 0, 0, 0)

  // Date must be today or in the future
  if (checkDate < today) return false

  // Date must be after the start date
  if (checkDate < startDate) return false

  // Date must be after the original scheduled date
  if (checkDate <= originalDate) return false

  const dayOfWeek = checkDate.getDay()
  const dayName =
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek] ||
    'sunday'
  const dayOfMonth = checkDate.getDate()
  const month = checkDate.getMonth() + 1

  if (repeat.type === 'fixed') {
    if (repeat.frequency === 'weekly' && repeat.weekly?.days) {
      return repeat.weekly.days.includes(dayName)
    } else if (repeat.frequency === 'monthly' && repeat.monthly?.days) {
      return repeat.monthly.days.includes(dayOfMonth)
    } else if (repeat.frequency === 'yearly' && repeat.yearly?.months && repeat.yearly?.days) {
      return repeat.yearly.months.includes(month) && repeat.yearly.days.includes(dayOfMonth)
    }
  } else if (repeat.type === 'flexible') {
    const interval = repeat.interval || 1
    const daysDiff = Math.floor((checkDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (repeat.frequency === 'daily') {
      return daysDiff >= 0 && daysDiff % interval === 0
    } else if (repeat.frequency === 'weekly') {
      const weeksDiff = Math.floor(daysDiff / 7)
      return (
        weeksDiff >= 0 && weeksDiff % interval === 0 && checkDate.getDay() === startDate.getDay()
      )
    } else if (repeat.frequency === 'monthly') {
      const monthsDiff =
        (checkDate.getFullYear() - startDate.getFullYear()) * 12 +
        (checkDate.getMonth() - startDate.getMonth())
      return monthsDiff >= 0 && monthsDiff % interval === 0 && dayOfMonth === startDate.getDate()
    }
  }

  return false
}

// Check if a task is a recurring task (has repeat pattern)
function isRecurringTask(task: CraftTask): boolean {
  return !!task.repeat
}

// Check if a task is a pending recurring task (future occurrence, not the original scheduled date)
function isPendingRecurringTask(task: CraftTask, date: Date): boolean {
  const repeat = task.repeat
  if (!repeat) return false
  const scheduleDate = task.taskInfo?.scheduleDate
  if (!scheduleDate) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const taskDate = new Date(scheduleDate)
  taskDate.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)

  // If this date matches the original scheduled date, it's not pending
  if (taskDate.getTime() === checkDate.getTime()) {
    return false
  }

  // Check if this date is a future occurrence
  return isDateAFutureOccurrence(task, checkDate, today)
}

function getTasksForDate(tasks: CraftTask[], date: Date): CraftTask[] {
  const dateStr = date.toISOString().split('T')[0]
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)

  // Debug: Log the date we're checking

  const result = tasks.filter((task) => {
    const taskStatus = getTaskStatus(task)
    const taskTitle = extractTitleFromMarkdown(task.markdown || '')

    // Filter out tasks with empty titles
    if (!taskTitle || taskTitle.trim() === '') {
      return false
    }

    // Only process todo tasks (completed/canceled are already filtered out)
    if (taskStatus !== 'todo') {
      return false
    }

    // Get scheduled date if available
    const scheduleDate = task.taskInfo?.scheduleDate
    let taskDate: Date | null = null
    let taskDateStr: string | null = null
    if (scheduleDate) {
      taskDate = new Date(scheduleDate)
      taskDate.setHours(0, 0, 0, 0)
      taskDateStr = taskDate.toISOString().split('T')[0] || null
    }

    // Check scheduled date logic (for all tasks with a scheduleDate)
    if (scheduleDate && taskDate && taskDateStr) {
      // For recurring tasks
      if (task.repeat) {
        // Check if this is the original scheduled date
        if (taskDateStr === dateStr) {
          // For todo tasks: show if today or future
          if (taskDate >= today) {
            return true
          }
          // If past scheduled date, show on the original date (with overdue styling)
          // Also show on today as overdue
          return true
        }

        // Check if this date is a future occurrence
        const isFutureOccurrence = isDateAFutureOccurrence(task, checkDate, today)
        if (isFutureOccurrence) {
          // Show future occurrences for todo tasks
          return true
        }
        return false
      }

      // For non-recurring tasks: check if scheduled for this exact date
      if (taskDateStr === dateStr) {
        // For todo tasks: show if today or future
        if (taskDate >= today) {
          return true
        }
        // If past scheduled date, show on the original date (with overdue styling)
        // Also show on today as overdue
        return true
      }
    }

    return false
  })

  return result
}

// Get completed/canceled tasks for a specific date (based on completedAt)
function getCompletedTasksForDate(date: Date): CraftTask[] {
  const dateStr = date.toISOString().split('T')[0]

  // Combine logbook + daily notes tasks
  const allDoneTasks = [...logbookTasks.value, ...dailyNotesDoneTasks.value]

  // Deduplicate and filter
  const seenIds = new Set<string>()
  return allDoneTasks.filter((task) => {
    if (seenIds.has(task.id)) return false
    seenIds.add(task.id)

    // Exclude subtasks
    if (isSubtask(task)) return false

    const taskTitle = extractTitleFromMarkdown(task.markdown || '')
    if (!taskTitle || taskTitle.trim() === '') {
      return false
    }

    // Get completedAt date
    const completedAt = task.taskInfo?.completedAt || task.completedAt
    if (!completedAt) return false

    const completedDate = new Date(completedAt)
    const completedDateStr = completedDate.toISOString().split('T')[0]

    return completedDateStr === dateStr
  })
}

function goToPreviousWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() - 7)
  newDate.setHours(0, 0, 0, 0)
  currentWeekStart.value = newDate
}

function goToNextWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() + 7)
  newDate.setHours(0, 0, 0, 0)
  currentWeekStart.value = newDate
}

function goToCurrentWeek() {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(today)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  currentWeekStart.value = monday
}

// Scroll functions for mobile day navigation
function scrollToDay(direction: 'left' | 'right') {
  if (!weekGridScrollContainer.value) return

  const container = weekGridScrollContainer.value
  const scrollAmount = container.clientWidth // Scroll by one full viewport width
  const currentScroll = container.scrollLeft

  if (direction === 'left') {
    container.scrollTo({
      left: currentScroll - scrollAmount,
      behavior: 'smooth',
    })
  } else {
    container.scrollTo({
      left: currentScroll + scrollAmount,
      behavior: 'smooth',
    })
  }
}

// Check if we can scroll left or right
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollButtons() {
  if (!weekGridScrollContainer.value) return

  const container = weekGridScrollContainer.value
  const { scrollLeft, scrollWidth, clientWidth } = container
  canScrollLeft.value = scrollLeft > 0
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 10 // 10px threshold
}

function formatWeekRange(): string {
  // Calculate ISO week number
  const date = new Date(currentWeekStart.value)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const year = d.getUTCFullYear()

  return `Week ${weekNo}, ${year}`
}

// Check if a daily note exists for a date
function hasDailyNote(date: Date): boolean {
  const dateStr = formatDateForCraft(date)
  return dailyNotes.value.has(dateStr)
}

// Get daily note for a date
function getDailyNoteForDate(date: Date): CraftDocument | null {
  const dateStr = formatDateForCraft(date)
  return dailyNotes.value.get(dateStr) || null
}

const loadTasks = async (forceRefresh = false) => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    errorMessage.value = 'Craft API URL not configured. Please configure it in Settings.'
    return
  }

  errorMessage.value = ''

  // Load calendar URLs
  let calendarUrls: string[] = []
  const savedUrls = localStorage.getItem('calendar-urls')
  if (savedUrls) {
    try {
      calendarUrls = JSON.parse(savedUrls)
    } catch {
      // Fallback to old format
    }
  }

  try {
    await tasksApiStore.initializeTasks(calendarUrls, forceRefresh)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load tasks'
    console.error('Error loading tasks:', err)
  }
}

// Get calendar events for a specific date
function getCalendarEventsForDate(date: Date): CalendarEvent[] {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  return calendarEvents.value.filter((event) => {
    const es = event.start
    return es.getFullYear() === y && es.getMonth() === m && es.getDate() === d
  })
}

const refreshTasks = async () => {
  // If on Done tab, only refresh logbook and current week
  if (activeTab.value === 'done') {
    await Promise.all([
      tasksApiStore.loadLogbook(true),
      tasksApiStore.loadWeekTasks(currentWeekStart.value, true),
    ])
    return
  }

  // Otherwise refresh all pending tasks
  let calendarUrls: string[] = []
  const savedUrls = localStorage.getItem('calendar-urls')
  if (savedUrls) {
    try {
      calendarUrls = JSON.parse(savedUrls)
    } catch {
      // Fallback to old format
    }
  }

  await tasksApiStore.refreshTasks(calendarUrls)
}

// Open task in Craft
async function openTaskInCraft(task: CraftTask) {
  // Use task.id as blockId (the task ID is the block ID)
  // Use documentId from location if available, otherwise use task.id
  // This respects the user's link preference (app/web) via openCraftLink
  const docId = task.location?.documentId || task.id
  // Try to get clickableLink from daily notes cache
  const dailyNote = dailyNotes.value.get(docId)
  const clickableLink = dailyNote?.clickableLink
  await openCraftLink(task.id, docId, clickableLink)
}

// Open document in Craft (for document links)
async function openDocumentInCraft(task: CraftTask) {
  const documentId = getDocumentId(task)
  if (documentId) {
    // Try to get clickableLink from daily notes cache
    const dailyNote = dailyNotes.value.get(documentId)
    const clickableLink = dailyNote?.clickableLink
    // Open the document (respects user's link preference)
    await openCraftLink(documentId, documentId, clickableLink)
  }
}

// Initialize on mount
function setupScrollListeners() {
  if (weekGridScrollContainer.value) {
    weekGridScrollContainer.value.removeEventListener('scroll', updateScrollButtons)
    window.removeEventListener('resize', updateScrollButtons)
    weekGridScrollContainer.value.addEventListener('scroll', updateScrollButtons)
    window.addEventListener('resize', updateScrollButtons)
    // Initial check
    setTimeout(updateScrollButtons, 100)
  }
}

onMounted(() => {
  loadTasks()
  if (registerRefresh) {
    registerRefresh(String(route.name), refreshTasks)
  }

  // Check mobile on mount
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // Setup scroll listeners for week grid
  nextTick(() => {
    setupScrollListeners()
  })

  // Register subheader
  if (setSubheader && !errorMessage.value) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: tabs.value,
          activeTab: activeTab.value,
          'onUpdate:activeTab': handleTabChange,
        }),
      right: () => [
        h(ViewTabs, {
          tabs: [
            { id: 'week', label: 'Week', icon: Calendar },
            { id: 'list', label: 'List', icon: LayoutGrid },
          ],
          activeTab: viewMode.value,
          'onUpdate:activeTab': (tab: string) => {
            if (tab === 'week' || tab === 'list') {
              viewMode.value = tab as 'week' | 'list'
            }
          },
        }),
        h(
          SubheaderButton,
          { title: 'Refresh tasks', onClick: refreshTasks },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  if (setSubheader) {
    setSubheader(null)
  }
})

// Re-initialize when activated (for keep-alive)
onActivated(() => {
  loadTasks()
  // Re-register subheader when activated
  if (setSubheader && !errorMessage.value) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: tabs.value,
          activeTab: activeTab.value,
          'onUpdate:activeTab': handleTabChange,
        }),
      right: () => [
        h(ViewTabs, {
          tabs: [
            { id: 'week', label: 'Week', icon: Calendar },
            { id: 'list', label: 'List', icon: LayoutGrid },
          ],
          activeTab: viewMode.value,
          'onUpdate:activeTab': (tab: string) => {
            if (tab === 'week' || tab === 'list') {
              viewMode.value = tab as 'week' | 'list'
            }
          },
        }),
        h(
          SubheaderButton,
          { title: 'Refresh tasks', onClick: refreshTasks },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})
</script>

<template>
  <div class="tasks-view">
    <!-- Error State -->
    <div v-if="errorMessage" class="error-container">
      <CheckSquare :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ errorMessage }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <template v-else>
      <!-- Content -->
      <div class="tasks-content">
        <!-- Loading State -->
        <div v-if="isLoading" class="loading-state">
          <ProgressIndicator
            :completed="completedApiCalls"
            :total="totalApiCalls"
            message="Loading tasks"
          />
        </div>

        <template v-else>
          <div class="tasks-tabs-container">
            <div class="tasks-tab-content">
              <!-- Week View -->
              <div v-if="viewMode === 'week'" class="week-view">
                <div class="week-header">
                  <div class="week-navigation">
                    <!-- Mobile: Day navigation -->
                    <button @click="goToPreviousWeek" class="week-nav-button" title="Previous Week">
                      <ChevronLeft :size="18" />
                    </button>
                    <button
                      @click="goToCurrentWeek"
                      class="week-current-button"
                      title="Go to Current Week"
                    >
                      <span>{{ formatWeekRange() }}</span>
                    </button>
                    <button @click="goToNextWeek" class="week-nav-button" title="Next Week">
                      <ChevronRight :size="18" />
                    </button>
                  </div>
                </div>
                <div class="week-grid-wrapper">
                  <button
                    v-if="canScrollLeft"
                    @click="scrollToDay('left')"
                    class="week-scroll-button week-scroll-left"
                    title="Previous Day"
                  >
                    <ChevronLeft :size="20" />
                  </button>
                  <div ref="weekGridScrollContainer" class="week-grid-scroll">
                    <div class="week-grid">
                      <div
                        v-for="day in getWeekDays()"
                        :key="day.toISOString()"
                        class="week-day-column"
                      >
                        <div
                          class="day-header"
                          :class="{
                            'day-today': isToday(day),
                            'day-clickable': hasDailyNote(day),
                          }"
                          @click="handleDayClick(day)"
                        >
                          <h3>{{ formatDayHeader(day) }}</h3>
                        </div>
                        <div class="day-tasks">
                          <!-- Loading state for logbook/week tasks in week view -->
                          <div
                            v-if="activeTab === 'done' && (isLoadingLogbook || isLoadingWeekTasks)"
                            class="day-loading"
                          >
                            Loading...
                          </div>

                          <template v-else-if="activeTab === 'done'">
                            <!-- Completed Tasks (Done tab) -->
                            <div
                              v-for="task in getCompletedTasksForDate(day)"
                              :key="task.id"
                              class="week-task-item"
                              :class="`status-${getTaskStatus(task)}`"
                            >
                              <div class="week-task-header">
                                <div class="week-task-title-wrapper">
                                  <h4 class="week-task-title" @click="openTaskInCraft(task)">
                                    {{ extractTitleFromMarkdown(task.markdown) }}
                                  </h4>
                                </div>
                                <span
                                  class="status-badge-small"
                                  :class="`status-badge-${getTaskStatus(task)}`"
                                >
                                  {{ getTaskStatus(task) === 'done' ? 'Done' : 'Canceled' }}
                                </span>
                              </div>
                              <div
                                v-if="getDocumentTitle(task) && getDocumentId(task)"
                                class="week-task-document"
                                @click.stop="openDocumentInCraft(task)"
                              >
                                <FileText :size="12" />
                                <span>{{ getDocumentTitle(task) }}</span>
                              </div>
                            </div>
                            <div
                              v-if="getCompletedTasksForDate(day).length === 0"
                              class="day-empty"
                            >
                              No completed tasks
                            </div>
                          </template>

                          <template v-else>
                            <!-- Calendar Events -->
                            <div
                              v-for="event in getCalendarEventsForDate(day)"
                              :key="`event-${event.id}`"
                              class="week-calendar-event"
                            >
                              <div class="week-calendar-event-header">
                                <div class="week-calendar-event-title-wrapper">
                                  <h4 class="week-calendar-event-title">{{ event.title }}</h4>
                                </div>
                                <Calendar
                                  :size="12"
                                  class="calendar-event-icon"
                                  title="Calendar event"
                                />
                              </div>
                              <div v-if="event.location" class="week-calendar-event-location">
                                <span>{{ event.location }}</span>
                              </div>
                              <div
                                v-if="
                                  event.start.getHours() !== 0 || event.start.getMinutes() !== 0
                                "
                                class="week-calendar-event-time"
                              >
                                <span>{{ formatEventTime(event.start, event.end) }}</span>
                              </div>
                            </div>
                            <!-- Tasks -->
                            <div
                              v-for="task in getTasksForDate(displayedTasks, day)"
                              :key="task.id"
                              class="week-task-item"
                              :class="[
                                `status-${getTaskStatus(task)}`,
                                { overdue: isOverdueOnScheduledDate(task, day) },
                                { 'recurring-pending': isPendingRecurringTask(task, day) },
                              ]"
                            >
                              <div class="week-task-header">
                                <div class="week-task-title-wrapper">
                                  <h4 class="week-task-title" @click="openTaskInCraft(task)">
                                    {{ extractTitleFromMarkdown(task.markdown) }}
                                  </h4>
                                  <RotateCw
                                    v-if="isRecurringTask(task)"
                                    :size="12"
                                    class="recurring-icon"
                                    :title="
                                      isPendingRecurringTask(task, day)
                                        ? 'Future recurring occurrence'
                                        : 'Recurring task'
                                    "
                                  />
                                </div>
                                <div class="task-badges">
                                  <span
                                    v-if="isOverdueOnScheduledDate(task, day)"
                                    class="overdue-badge"
                                    :title="`Overdue by ${getDaysOverdue(task)} day${getDaysOverdue(task) !== 1 ? 's' : ''}`"
                                  >
                                    {{ getDaysOverdue(task) }}d
                                  </span>
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
                                </div>
                              </div>
                              <div
                                v-if="getDocumentTitle(task) && getDocumentId(task)"
                                class="week-task-document"
                                @click.stop="openDocumentInCraft(task)"
                              >
                                <FileText :size="12" />
                                <span>{{ getDocumentTitle(task) }}</span>
                              </div>
                            </div>
                            <div
                              v-if="getTasksForDate(displayedTasks, day).length === 0"
                              class="day-empty"
                            >
                              No tasks
                            </div>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="canScrollRight"
                    @click="scrollToDay('right')"
                    class="week-scroll-button week-scroll-right"
                    title="Next Day"
                  >
                    <ChevronRight :size="20" />
                  </button>
                </div>
              </div>

              <!-- List View -->
              <div v-else class="tasks-list">
                <!-- Loading state for logbook/week tasks -->
                <div
                  v-if="activeTab === 'done' && (isLoadingLogbook || isLoadingWeekTasks)"
                  class="loading-state"
                >
                  <div class="spinner"></div>
                  <p>Loading completed tasks...</p>
                </div>

                <div v-else-if="displayedTasks.length === 0" class="empty-state">
                  <CheckSquare :size="48" class="empty-icon" />
                  <p class="empty-text">
                    {{ activeTab === 'done' ? 'No completed tasks found' : 'No tasks found' }}
                  </p>
                </div>

                <!-- Done tasks table (different columns) -->
                <div v-else-if="activeTab === 'done'" class="tasks-table-container">
                  <table class="tasks-table">
                    <thead>
                      <tr>
                        <th class="col-title">Title</th>
                        <th class="col-completed-date">Completed</th>
                        <th class="col-document">Document</th>
                        <th class="col-status">Status</th>
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
                        </td>
                        <td class="col-completed-date">
                          <div v-if="formatCompletedDate(task)" class="task-meta">
                            <CircleCheck :size="14" />
                            <span>{{ formatCompletedDate(task) }}</span>
                          </div>
                          <span v-else class="task-meta-empty">—</span>
                        </td>
                        <td class="col-document">
                          <div
                            v-if="getDocumentTitle(task) && getDocumentId(task)"
                            class="task-meta task-document-link"
                            @click.stop="openDocumentInCraft(task)"
                          >
                            <FileText :size="14" />
                            <span>{{ getDocumentTitle(task) }}</span>
                          </div>
                          <span v-else class="task-meta-empty">—</span>
                        </td>
                        <td class="col-status">
                          <span class="status-badge" :class="`status-badge-${getTaskStatus(task)}`">
                            {{ getTaskStatus(task) === 'done' ? 'Done' : 'Canceled' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Regular tasks table -->
                <div v-else class="tasks-table-container">
                  <table class="tasks-table">
                    <thead>
                      <tr>
                        <th class="col-title">Title</th>
                        <th class="col-due-date">Due Date</th>
                        <th class="col-document">Document</th>
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
                            :class="{
                              'task-due-date-clickable':
                                task.taskInfo?.scheduleDate &&
                                hasDailyNote(new Date(task.taskInfo.scheduleDate)),
                            }"
                            @click.stop="handleDueDateClick(task)"
                          >
                            <Calendar :size="14" />
                            <span>{{ formatDueDate(task) }}</span>
                          </div>
                          <span v-else class="task-meta-empty">—</span>
                        </td>
                        <td class="col-document">
                          <div
                            v-if="getDocumentTitle(task) && getDocumentId(task)"
                            class="task-meta task-document-link"
                            @click.stop="openDocumentInCraft(task)"
                          >
                            <FileText :size="14" />
                            <span>{{ getDocumentTitle(task) }}</span>
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
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tasks-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.error-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 48px 24px;
}

.error-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.error-container h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.error-container p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.settings-link {
  margin-top: 8px;
  padding: 8px 16px;
  background: var(--btn-primary-bg);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s ease;
}

.settings-link:hover {
  background: var(--btn-primary-hover);
}

.tasks-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
  color: var(--text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-primary);
  border-top-color: var(--btn-primary-bg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tasks-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
  text-align: center;
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  color: var(--text-secondary);
}

.tasks-table-container {
  overflow-x: auto;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-secondary);
}

.tasks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tasks-table thead {
  background: var(--bg-tertiary);
  border-bottom: 2px solid var(--border-primary);
}

.tasks-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.tasks-table tbody tr {
  border-bottom: 1px solid var(--border-primary);
  transition: background 0.2s ease;
}

.tasks-table tbody tr:hover {
  background: var(--bg-tertiary);
}

.tasks-table tbody tr:last-child {
  border-bottom: none;
}

.tasks-table tbody tr.status-canceled .task-title {
  text-decoration: line-through;
}

.tasks-table td {
  padding: 12px 16px;
  vertical-align: middle;
}

.col-title {
  min-width: 200px;
  max-width: 400px;
}

.col-due-date {
  width: 140px;
}

.col-document {
  min-width: 150px;
  max-width: 250px;
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
  font-size: 14px;
  font-weight: 500;
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

.task-document-link {
  cursor: pointer;
  transition: color 0.2s ease;
}

.task-document-link:hover {
  color: var(--btn-primary-bg);
}

.task-status {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.task-status.status-todo {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.task-status.status-done {
  background: rgba(34, 197, 94, 0.2);
  color: var(--btn-success-bg);
}

.task-status.status-canceled {
  background: rgba(107, 114, 128, 0.2);
  color: #6b7280;
}

.task-badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.task-badges-row .overdue-badge {
  padding: 2px 6px;
  background: #ef4444;
  color: white;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.task-badges-row .deadline-badge {
  padding: 2px 6px;
  background: #f59e0b;
  color: white;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.task-badges-row .deadline-badge.deadline-overdue {
  background: #ef4444;
}

.task-badges-row .deadline-badge.deadline-approaching {
  background: #f59e0b;
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

.task-priority {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.priority-high {
  background: rgba(244, 63, 94, 0.2);
  color: var(--btn-danger-bg);
}

.priority-medium {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
}

.priority-low {
  background: rgba(34, 197, 94, 0.2);
  color: var(--btn-success-bg);
}

/* View Mode Buttons */
.view-mode-buttons {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
  margin-right: 8px;
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

/* Week View */
.week-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

@media (max-width: 1160px) {
  .week-view {
    overflow: visible;
  }
}

.week-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.week-navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.week-nav-button,
.week-current-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.week-nav-button:hover,
.week-current-button:hover {
  background: var(--bg-secondary);
  border-color: var(--border-secondary);
}

.week-current-button {
  min-width: 200px;
}

.week-grid-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  overflow: hidden;
}

.week-grid-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.week-grid-scroll::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

/* Mobile: Stack days vertically with vertical scroll */
@media (max-width: 1160px) {
  .week-grid-scroll {
    overflow-x: hidden;
    overflow-y: auto;
  }
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  min-height: 100%;
  background: var(--border-primary);
  padding: 1px;
  min-width: min-content;
}

/* Mobile: Stack days vertically (1 column) */
@media (max-width: 1160px) {
  .week-grid {
    grid-template-columns: 1fr;
    min-width: 100%;
    min-height: auto; /* Use content-based height instead of 100% */
  }
}

.week-scroll-button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  background: var(--bg-secondary);
  border: 2px solid var(--border-primary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  opacity: 0;
  pointer-events: none;
}

.week-scroll-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.week-scroll-left {
  left: 12px;
}

.week-scroll-right {
  right: 12px;
}

/* Hide scroll buttons on mobile */
@media (max-width: 1160px) {
  .week-scroll-button {
    display: none;
  }
}

.week-day-column {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  min-width: 0;
}

/* Mobile: Full width columns stacked vertically */
@media (max-width: 1160px) {
  .week-day-column {
    width: 100%;
    min-width: 100%;
    height: auto; /* Use content-based height */
  }
}

.day-header {
  padding: 12px 8px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  position: sticky;
  top: 0;
  z-index: 10;
  transition: all 0.2s ease;
}

.day-header.day-clickable {
  cursor: pointer;
}

.day-header.day-clickable:hover {
  background: var(--bg-tertiary);
}

.task-due-date-clickable {
  cursor: pointer;
  transition: color 0.2s ease;
}

.task-due-date-clickable:hover {
  color: var(--btn-primary-bg);
}

.day-header.day-today {
  background: var(--btn-primary-bg);
  color: white;
}

.day-header.day-today h3 {
  color: white;
}

.day-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.day-tasks {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
  min-height: 200px;
}

/* Mobile: Use content-based height instead of equal heights */
@media (max-width: 1160px) {
  .day-tasks {
    flex: none; /* Remove flex grow to use content height */
    min-height: 0; /* Remove minimum height constraint */
    overflow-y: visible; /* Allow content to flow naturally */
  }
}

.week-calendar-event {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-left: 3px solid #6366f1;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
  transition: all 0.2s ease;
}

.week-calendar-event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.week-calendar-event-title-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.calendar-event-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  opacity: 0.7;
}

.week-calendar-event-title {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.week-calendar-event-location {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.week-calendar-event-time {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.week-task-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
  transition: all 0.2s ease;
}

.week-task-item.status-done {
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid rgba(34, 197, 94, 0.5);
}

.week-task-item.status-done:hover {
  background: rgba(34, 197, 94, 0.18);
}

.week-task-item.status-canceled {
  background: rgba(107, 114, 128, 0.1);
  border-left: 3px solid rgba(107, 114, 128, 0.5);
}

.week-task-item.status-canceled:hover {
  background: rgba(107, 114, 128, 0.18);
}

.week-task-item.status-canceled .week-task-title {
  text-decoration: line-through;
}

.week-task-item.overdue {
  border-left: 3px solid #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.week-task-item.recurring-pending {
  border-left: 3px solid #6366f1;
  background: rgba(99, 102, 241, 0.05);
  opacity: 0.8;
}

.week-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.week-task-title-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.week-task-title {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: color 0.2s ease;
  line-height: 1.4;
}

.recurring-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  opacity: 0.7;
}

.task-badges {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.overdue-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  background: #ef4444;
  color: white;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.deadline-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  background: #f59e0b;
  color: white;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.deadline-badge.deadline-overdue {
  background: #ef4444;
}

.deadline-badge.deadline-approaching {
  background: #f59e0b;
}

.week-task-title:hover {
  color: var(--btn-primary-bg);
}

.week-task-document {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
  margin-top: 4px;
}

.week-task-document:hover {
  color: var(--btn-primary-bg);
}

.day-empty {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 11px;
  padding: 16px 8px;
  font-style: italic;
}

/* Status Filters */
.tasks-filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.status-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filters-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.clear-filters-button {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-filters-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.status-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.status-filter-button {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.status-filter-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.status-filter-button.active {
  background: var(--btn-primary-bg);
  color: white;
  border-color: var(--btn-primary-bg);
}

.results-info {
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.tasks-tabs-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
}

.tasks-tab-content {
  flex: 1;
  padding-top: 0;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 16px;
}

/* Status badges for Done tab */
.col-completed-date {
  width: 140px;
}

.col-status {
  width: 100px;
  text-align: center;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge-done {
  background: rgba(34, 197, 94, 0.15);
  color: var(--btn-success-bg);
}

.status-badge-canceled {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.status-badge-small {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  text-transform: capitalize;
  flex-shrink: 0;
}

.status-badge-small.status-badge-done {
  background: rgba(34, 197, 94, 0.2);
  color: var(--btn-success-bg);
}

.status-badge-small.status-badge-canceled {
  background: rgba(107, 114, 128, 0.2);
  color: #6b7280;
}

/* Day loading state */
.day-loading {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 11px;
  padding: 16px 8px;
  font-style: italic;
}
</style>
