import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchTasks, fetchDocuments, type CraftTask, type CraftDocument } from '../utils/craftApi'
import { fetchCalendarEvents, type CalendarEvent } from '../utils/icalParser'
import { useApiCache } from '../composables/useApiCache'

export const useTasksApiStore = defineStore('tasksApi', () => {
  const cache = useApiCache('tasks-cache-')

  const inboxTasks = ref<CraftTask[]>([])
  const activeTasks = ref<CraftTask[]>([])
  const upcomingTasks = ref<CraftTask[]>([])
  const logbookTasks = ref<CraftTask[]>([])
  const dailyNotesDoneTasks = ref<CraftTask[]>([])
  const loadedWeeks = ref<Set<string>>(new Set())
  const isLoadingLogbook = ref(false)
  const isLoadingWeekTasks = ref(false)
  const dailyNotes = ref<Map<string, CraftDocument>>(new Map())
  const calendarEvents = ref<CalendarEvent[]>([])
  const isLoading = ref(false)
  const isLoadingCalendar = ref(false)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)

  const loadTaskType = async (
    type: 'inbox' | 'active' | 'upcoming',
    forceRefresh = false,
  ): Promise<CraftTask[]> => {
    const cached = cache.getCachedData<CraftTask[]>(type)
    if (!forceRefresh && cached) {
      return cached
    }

    const result = await fetchTasks(type)
    cache.setCachedData(type, result.items)
    completedApiCalls.value++
    return result.items
  }

  // Lazy load logbook tasks (only when user clicks Done tab)
  const loadLogbook = async (forceRefresh = false): Promise<CraftTask[]> => {
    const cached = cache.getCachedData<CraftTask[]>('logbook')
    if (!forceRefresh && cached) {
      logbookTasks.value = cached
      return cached
    }

    isLoadingLogbook.value = true
    try {
      const result = await fetchTasks('logbook')
      logbookTasks.value = result.items
      cache.setCachedData('logbook', result.items)
      return result.items
    } catch (error) {
      console.error('Error loading logbook:', error)
      return []
    } finally {
      isLoadingLogbook.value = false
    }
  }

  // Helper to get week key from date (YYYY-Wnn format)
  const getWeekKey = (date: Date): string => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  // Helper to format date as YYYY-MM-DD
  const formatDateStr = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Load completed tasks from daily notes for a specific week
  const loadWeekTasks = async (weekStart: Date, forceRefresh = false): Promise<CraftTask[]> => {
    const weekKey = getWeekKey(weekStart)

    // Check if already loaded (and not forcing refresh)
    if (!forceRefresh && loadedWeeks.value.has(weekKey)) {
      return dailyNotesDoneTasks.value
    }

    // Check cache
    const cacheKey = `week-tasks-${weekKey}`
    const cached = cache.getCachedData<CraftTask[]>(cacheKey)
    if (!forceRefresh && cached) {
      // Merge with existing tasks (avoid duplicates)
      const existingIds = new Set(dailyNotesDoneTasks.value.map((t) => t.id))
      const newTasks = cached.filter((t) => !existingIds.has(t.id))
      dailyNotesDoneTasks.value = [...dailyNotesDoneTasks.value, ...newTasks]
      loadedWeeks.value.add(weekKey)
      return dailyNotesDoneTasks.value
    }

    isLoadingWeekTasks.value = true
    try {
      // Get dates for the week (7 days starting from weekStart)
      const dates: string[] = []
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart)
        date.setDate(date.getDate() + i)
        dates.push(formatDateStr(date))
      }

      // Find daily notes that exist for these dates
      const dailyNotesForWeek = dates
        .map((dateStr) => dailyNotes.value.get(dateStr))
        .filter((doc): doc is CraftDocument => !!doc)

      // Fetch tasks for each daily note in parallel
      const taskPromises = dailyNotesForWeek.map(async (doc) => {
        try {
          const result = await fetchTasks('document', doc.id)
          // Filter only done/canceled tasks
          return result.items.filter(
            (task) =>
              task.taskInfo?.state === 'done' || task.taskInfo?.state === 'canceled',
          )
        } catch (error) {
          console.error(`Error fetching tasks for daily note ${doc.id}:`, error)
          return []
        }
      })

      const allTasksArrays = await Promise.all(taskPromises)
      const weekTasks = allTasksArrays.flat()

      // Cache the week's tasks
      cache.setCachedData(cacheKey, weekTasks)

      // Merge with existing tasks (avoid duplicates)
      const existingIds = new Set(dailyNotesDoneTasks.value.map((t) => t.id))
      const newTasks = weekTasks.filter((t) => !existingIds.has(t.id))
      dailyNotesDoneTasks.value = [...dailyNotesDoneTasks.value, ...newTasks]

      loadedWeeks.value.add(weekKey)
      return dailyNotesDoneTasks.value
    } catch (error) {
      console.error('Error loading week tasks:', error)
      return dailyNotesDoneTasks.value
    } finally {
      isLoadingWeekTasks.value = false
    }
  }

  // Check if a week is loaded
  const isWeekLoaded = (weekStart: Date): boolean => {
    return loadedWeeks.value.has(getWeekKey(weekStart))
  }

  const loadDailyNotes = async (forceRefresh = false): Promise<boolean> => {
    try {
      // Check cache first
      if (!forceRefresh) {
        const cached = cache.getCachedData<Array<[string, CraftDocument]>>('daily_notes')
        if (cached) {
          dailyNotes.value = new Map(cached)
          return false // No API call made
        }
      }

      const result = await fetchDocuments({ location: 'daily_notes', fetchMetadata: true })
      const notesMap = new Map<string, CraftDocument>()

      result.items.forEach((doc) => {
        if (doc.dailyNoteDate) {
          notesMap.set(doc.dailyNoteDate, doc)
        }
      })

      dailyNotes.value = notesMap
      // Convert Map to array for storage
      const dataArray = Array.from(notesMap.entries())
      cache.setCachedData('daily_notes', dataArray)
      return true // API call made
    } catch (error) {
      console.error('Error loading daily notes:', error)
      dailyNotes.value = new Map()
      return true // Count as completed even on error
    }
  }

  const loadCalendarEvents = async (
    calendarUrls: string[],
    forceRefresh = false,
  ): Promise<boolean> => {
    // Filter out empty URLs
    const validUrls = calendarUrls.filter((url) => url && url.trim() !== '')

    if (validUrls.length === 0) {
      calendarEvents.value = []
      return false // No API call made
    }

    try {
      // Check cache first
      if (!forceRefresh) {
        const cached = cache.getCachedData<CalendarEvent[]>('calendar_events')
        if (cached) {
          // Convert date strings back to Date objects
          calendarEvents.value = cached.map((event) => ({
            ...event,
            start: new Date(event.start),
            end: new Date(event.end),
          }))
          return false // No API call made
        }
      }

      isLoadingCalendar.value = true

      // Fetch events from all calendars in parallel
      const eventPromises = validUrls.map((url) =>
        fetchCalendarEvents(url.trim()).catch((error) => {
          console.error(`Error fetching calendar from ${url}:`, error)
          return [] // Return empty array on error so other calendars still load
        }),
      )

      const allEventsArrays = await Promise.all(eventPromises)
      const allEvents = allEventsArrays.flat()

      calendarEvents.value = allEvents
      cache.setCachedData('calendar_events', calendarEvents.value)
      return true // API call made
    } catch (error) {
      console.error('Error loading calendar events:', error)
      calendarEvents.value = []
      return true // Count as completed even on error
    } finally {
      isLoadingCalendar.value = false
    }
  }

  const initializeTasks = async (calendarUrls: string[], forceRefresh = false) => {
    isLoading.value = true
    completedApiCalls.value = 0
    totalApiCalls.value = 0

    try {
      // Count API calls needed (only count if not cached or force refresh)
      let apiCallCount = 0

      if (forceRefresh || !cache.getCachedData('inbox')) apiCallCount++
      if (forceRefresh || !cache.getCachedData('active')) apiCallCount++
      if (forceRefresh || !cache.getCachedData('upcoming')) apiCallCount++
      if (forceRefresh || !cache.getCachedData('daily_notes')) apiCallCount++
      if (forceRefresh || !cache.getCachedData('calendar_events')) apiCallCount++

      totalApiCalls.value = apiCallCount

      // Load all task types in parallel
      const [inbox, active, upcoming] = await Promise.all([
        loadTaskType('inbox', forceRefresh),
        loadTaskType('active', forceRefresh),
        loadTaskType('upcoming', forceRefresh),
      ])

      inboxTasks.value = inbox
      activeTasks.value = active
      upcomingTasks.value = upcoming

      // Load daily notes and calendar events in parallel
      const [dailyNotesMadeCall, calendarMadeCall] = await Promise.all([
        loadDailyNotes(forceRefresh),
        loadCalendarEvents(calendarUrls, forceRefresh),
      ])

      if (dailyNotesMadeCall) completedApiCalls.value++
      if (calendarMadeCall) completedApiCalls.value++
    } catch (error) {
      console.error('Error initializing tasks:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const refreshTasks = async (calendarUrls: string[]) => {
    cache.clearCache('inbox')
    cache.clearCache('active')
    cache.clearCache('upcoming')
    cache.clearCache('logbook')
    cache.clearCache('daily_notes')
    cache.clearCache('calendar_events')
    // Clear week task caches
    loadedWeeks.value.forEach((weekKey) => {
      cache.clearCache(`week-tasks-${weekKey}`)
    })
    logbookTasks.value = []
    dailyNotesDoneTasks.value = []
    loadedWeeks.value = new Set()
    await initializeTasks(calendarUrls, true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  return {
    inboxTasks: computed(() => inboxTasks.value),
    activeTasks: computed(() => activeTasks.value),
    upcomingTasks: computed(() => upcomingTasks.value),
    logbookTasks: computed(() => logbookTasks.value),
    dailyNotesDoneTasks: computed(() => dailyNotesDoneTasks.value),
    dailyNotes: computed(() => dailyNotes.value),
    calendarEvents: computed(() => calendarEvents.value),
    isLoading: computed(() => isLoading.value),
    isLoadingLogbook: computed(() => isLoadingLogbook.value),
    isLoadingWeekTasks: computed(() => isLoadingWeekTasks.value),
    isLoadingCalendar: computed(() => isLoadingCalendar.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeTasks,
    refreshTasks,
    loadLogbook,
    loadWeekTasks,
    isWeekLoaded,
    clearAllCache,
  }
})
