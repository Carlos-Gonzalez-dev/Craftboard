<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { marked } from 'marked'
import { ChevronLeft, ChevronRight, Link as LinkIcon } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import {
  getDailyNote,
  getDailyNoteDocumentId,
  fetchDocuments,
  getSpaceId,
  getCraftLinkPreference,
  buildCraftAppLinkForDailyNote,
  buildCraftWebLink,
  openCraftLink,
  type CraftDocument,
} from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

// Configure marked for better rendering
marked.setOptions({
  breaks: true, // Convert line breaks to <br>
  gfm: true, // GitHub Flavored Markdown
})

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
}>()

const { isCompactView } = useWidgetView()

const currentDate = ref<Date>(new Date())
const markdown = ref<string>('')
const documentId = ref<string | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const dailyNotes = ref<Map<string, CraftDocument>>(new Map())
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

// Computed date string for watching (prevents duplicate triggers)
const currentDateStr = computed(() => formatDate(currentDate.value))

// Format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Format date for display
const displayDate = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

// Check if current date is today
const isToday = computed(() => {
  const today = new Date()
  return (
    currentDate.value.getFullYear() === today.getFullYear() &&
    currentDate.value.getMonth() === today.getMonth() &&
    currentDate.value.getDate() === today.getDate()
  )
})

// Load daily notes from the daily_notes folder
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

// Get daily note for current date
const getDailyNoteForCurrentDate = computed(() => {
  const dateStr = formatDate(currentDate.value)
  return dailyNotes.value.get(dateStr) || null
})

// Load daily note for current date
const loadDailyNote = async () => {
  isLoading.value = true
  error.value = null
  totalApiCalls.value = 2
  completedApiCalls.value = 0

  try {
    const dateStr = formatDate(currentDate.value)

    // Fetch both markdown content and document ID in parallel
    const [content, docId] = await Promise.all([
      getDailyNote(dateStr).then((result) => {
        completedApiCalls.value++
        return result
      }),
      getDailyNoteDocumentId(dateStr).then((result) => {
        completedApiCalls.value++
        return result
      }),
    ])

    markdown.value = content || '*No content for this date*'
    documentId.value = docId

    // Save current date to widget data
    const widgetData = {
      currentDate: dateStr,
      documentId: docId,
    }
    emit('update:data', widgetData)
  } catch (err) {
    console.error('Failed to load daily note:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load daily note'
    markdown.value = '*Error loading daily note*'
    documentId.value = null
    completedApiCalls.value = totalApiCalls.value // Mark all as completed on error
  } finally {
    isLoading.value = false
  }
}

// Navigate to previous day
const goToPreviousDay = () => {
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() - 1)
  currentDate.value = newDate
}

// Navigate to next day
const goToNextDay = () => {
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + 1)
  currentDate.value = newDate
}

// Navigate to today
const goToToday = () => {
  currentDate.value = new Date()
}

// Watch for date changes and reload (watch the formatted string to avoid duplicate triggers)
watch(
  currentDateStr,
  () => {
    loadDailyNote()
  },
  { immediate: false },
)

// Load saved date from widget data or default to today
onMounted(async () => {
  // Load daily notes first
  await loadDailyNotes()
  
  if (props.widget.data?.currentDate) {
    const savedDate = new Date(props.widget.data.currentDate)
    if (!isNaN(savedDate.getTime())) {
      // Check if saved date is different from current date
      const currentDateStr = formatDate(currentDate.value)
      const savedDateStr = formatDate(savedDate)
      
      if (currentDateStr !== savedDateStr) {
        currentDate.value = savedDate
        // Watch will trigger loadDailyNote() when currentDate changes
      } else {
        // Same date, load directly (watch won't fire)
        loadDailyNote()
      }
    } else {
      // If saved date is invalid, load today's note
      loadDailyNote()
    }
  } else {
    // No saved date, load today's note
    loadDailyNote()
  }
})

// Render markdown to HTML
const html = computed(() => {
  if (!markdown.value) return ''
  try {
    return marked(markdown.value)
  } catch (err) {
    console.error('Markdown rendering error:', err)
    // Fallback: escape HTML and preserve line breaks
    return markdown.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
})

// Check if daily note exists and has a clickableLink
const hasDailyNoteLink = computed(() => {
  const dailyNote = getDailyNoteForCurrentDate.value
  return !!(dailyNote && dailyNote.clickableLink)
})

const openInCraft = async () => {
  const dailyNote = getDailyNoteForCurrentDate.value
  
  // Only open if daily note exists and has a clickableLink
  if (!dailyNote || !dailyNote.clickableLink) {
    return
  }

  const preference = getCraftLinkPreference()

  if (preference === 'web') {
    // Use the clickableLink from the daily note
    window.open(dailyNote.clickableLink, '_blank')
  } else {
    // For app, use openCraftLink with the document ID
    const docId = dailyNote.id
    if (docId) {
      await openCraftLink(docId, docId)
    }
  }
}
</script>

<template>
  <div class="daily-note-widget">
    <!-- Navigation Controls -->
    <div class="navigation-controls">
      <button
        @click="goToPreviousDay"
        class="nav-button"
        :disabled="isLoading"
        title="Previous day"
      >
        <ChevronLeft :size="18" />
      </button>

      <button
        @click="goToToday"
        class="date-button"
        :class="{ today: isToday }"
        :disabled="isLoading"
        :title="isToday ? 'Today' : 'Go to today'"
      >
        <span class="date-display">{{ displayDate }}</span>
      </button>

      <button @click="goToNextDay" class="nav-button" :disabled="isLoading" title="Next day">
        <ChevronRight :size="18" />
      </button>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Markdown Content -->
    <div v-else class="markdown-content" v-html="html" />

    <!-- Footer with link button -->
    <div v-if="hasDailyNoteLink && !isLoading && !error && !isCompactView" class="widget-footer">
      <a
        href="#"
        @click.prevent="openInCraft"
        class="footer-button"
        :title="getCraftLinkPreference() === 'web' ? 'Open in Craft Web' : 'Open in Craft App'"
      >
        <LinkIcon :size="16" />
      </a>
    </div>
  </div>
</template>

<style scoped>
.daily-note-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.navigation-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.nav-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-primary);
}

.nav-button:hover:not(:disabled) {
  background: var(--bg-primary);
  border-color: var(--btn-primary-bg);
}

.nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.date-button {
  flex: 1;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.date-button:hover:not(:disabled) {
  background: var(--bg-primary);
  border-color: var(--btn-primary-bg);
}

.date-button.today {
  background: var(--btn-primary-bg);
  color: white;
  border-color: var(--btn-primary-bg);
}

.date-button.today:hover {
  background: var(--btn-primary-hover);
}

.date-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.date-display {
  display: block;
  text-align: center;
}

.error-message {
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
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

.markdown-content {
  flex: 1;
  overflow: auto;
  padding: 10px;
  padding-bottom: 38px; /* Space for footer buttons */
  line-height: 1.6;
  color: var(--text-primary);
}

.markdown-content :deep(h1) {
  font-size: 20px;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.markdown-content :deep(h2) {
  font-size: 17px;
  font-weight: 600;
  margin-top: 16px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.markdown-content :deep(h3) {
  font-size: 14px;
  font-weight: 600;
  margin-top: 12px;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.markdown-content :deep(p) {
  margin-bottom: 10px;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-bottom: 10px;
  padding-left: 20px;
}

.markdown-content :deep(li) {
  margin-bottom: 4px;
}

.markdown-content :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}

.markdown-content :deep(pre) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 10px;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
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
  text-decoration: none;
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
</style>
