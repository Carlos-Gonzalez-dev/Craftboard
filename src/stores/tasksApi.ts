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
    cache.clearCache('daily_notes')
    cache.clearCache('calendar_events')
    await initializeTasks(calendarUrls, true)
  }

  const clearAllCache = () => {
    cache.clearAllCache()
  }

  return {
    inboxTasks: computed(() => inboxTasks.value),
    activeTasks: computed(() => activeTasks.value),
    upcomingTasks: computed(() => upcomingTasks.value),
    dailyNotes: computed(() => dailyNotes.value),
    calendarEvents: computed(() => calendarEvents.value),
    isLoading: computed(() => isLoading.value),
    isLoadingCalendar: computed(() => isLoadingCalendar.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),
    initializeTasks,
    refreshTasks,
    clearAllCache,
  }
})
