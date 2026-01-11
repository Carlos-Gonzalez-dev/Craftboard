import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApiCache } from '../composables/useApiCache'
import { getApiUrl } from '../utils/craftApi'

export interface DailyNoteData {
  dateStr: string
  markdown: string
  documentId: string | null
  clickableLink: string | null
}

export const useDailyNoteApiStore = defineStore('dailyNoteApi', () => {
  const cache = useApiCache('daily-note-cache-')
  const notesMap = ref<Map<string, DailyNoteData>>(new Map())

  const data = computed(() => notesMap.value)

  async function initializeDailyNote(dateStr: string, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
      const cached = cache.getCachedData<DailyNoteData>(dateStr)
      if (cached) {
        notesMap.value.set(dateStr, cached)
        return
      }
    }

    // Fetch from API
    await fetchDailyNote(dateStr)
  }

  async function refreshDailyNote(dateStr: string) {
    await initializeDailyNote(dateStr, true)
  }

  async function fetchDailyNote(dateStr: string) {
    const apiUrl = getApiUrl()
    if (!apiUrl) {
      throw new Error('Craft API URL not configured')
    }

    const response = await fetch(`${apiUrl}/blocks?date=${dateStr}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('craft-api-token')}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // Daily note doesn't exist for this date
        const emptyNote: DailyNoteData = {
          dateStr,
          markdown: '*No content for this date*',
          documentId: null,
          clickableLink: null,
        }
        notesMap.value.set(dateStr, emptyNote)
        cache.setCachedData(dateStr, emptyNote)
        return
      }
      throw new Error(`Failed to fetch daily note: ${response.statusText}`)
    }

    const data = await response.json()

    // Extract document ID (root block ID)
    const documentId = data.id || null

    // Extract markdown from the response
    const extractMarkdown = (block: any): string[] => {
      const lines: string[] = []
      // Include markdown if it's a task or not a page type
      if (block.markdown && (block.listStyle === 'task' || block.type !== 'page')) {
        lines.push(block.markdown)
      }
      // If it's a task, don't process its content (completed/canceled history)
      if (block.listStyle === 'task') {
        return lines
      }
      // Recursively process content (API uses 'content', not 'subblocks')
      if (Array.isArray(block.content)) {
        for (const childBlock of block.content) {
          lines.push(...extractMarkdown(childBlock))
        }
      }
      return lines
    }

    const markdownLines = extractMarkdown(data)
    const markdown = markdownLines.join('\n\n')

    // Generate clickable link (will be built by widget with preferences)
    const noteData: DailyNoteData = {
      dateStr,
      markdown: markdown || '*No content for this date*',
      documentId,
      clickableLink: null, // Will be built by widget
    }

    notesMap.value.set(dateStr, noteData)
    cache.setCachedData(dateStr, noteData)
  }

  function getDailyNote(dateStr: string): DailyNoteData | undefined {
    return notesMap.value.get(dateStr)
  }

  function clearAllCache() {
    cache.clearAllCache()
    notesMap.value.clear()
  }

  return {
    data,
    initializeDailyNote,
    refreshDailyNote,
    getDailyNote,
    clearAllCache,
  }
})
