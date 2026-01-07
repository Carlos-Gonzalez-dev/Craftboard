<script setup lang="ts">
import { ref, computed, onMounted, inject, h, watch } from 'vue'
import { Clock, RefreshCw, ExternalLink, Plus, X, Search, BarChart3, List } from 'lucide-vue-next'
import { getApiUrl, openCraftLink, getCacheExpiryMs } from '../utils/craftApi'
import SubheaderButton from '../components/SubheaderButton.vue'
import ViewTabs from '../components/ViewTabs.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

interface LogEntry {
  documentId: string
  documentTitle: string
  blockId: string
  markdown: string
  date?: string
  createdAt?: string
  lastModifiedAt?: string
  tags: string[]
  clickableLink?: string
}

const logs = ref<LogEntry[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)
const searchQuery = ref('')
const selectedTags = ref<Set<string>>(new Set())
const selectedPeriod = ref<string>('all')
const chartPeriod = ref<'week' | 'month' | 'year'>('year')
const sortOrder = ref<'asc' | 'desc'>('desc')
const showAddTagModal = ref(false)
const newTag = ref('')

// View mode with localStorage persistence
const VIEW_MODE_STORAGE_KEY = 'tags-view-mode'
const viewMode = ref<'table' | 'chart'>(
  (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as 'table' | 'chart') || 'table',
)

// Watch view mode changes and save to localStorage
watch(viewMode, (newMode) => {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode)
})

// Load tags from localStorage
const STORAGE_KEY = 'craftboard-tags'
const CACHE_PREFIX = 'tags-cache-'
const savedTags = ref<string[]>([])

const loadTags = () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      savedTags.value = JSON.parse(stored)
    } catch {
      savedTags.value = []
    }
  }
}

const saveTags = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTags.value))
}

const addTag = async () => {
  const tag = newTag.value.trim().toLowerCase()
  if (!tag) return

  // Remove # if user added it
  const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag

  if (!savedTags.value.includes(cleanTag)) {
    savedTags.value.push(cleanTag)
    savedTags.value.sort()
    saveTags()

    // Auto-load logs after adding tag
    newTag.value = ''
    showAddTagModal.value = false
    await loadLogs()
  } else {
    newTag.value = ''
    showAddTagModal.value = false
  }
}

const removeTag = async (tag: string) => {
  savedTags.value = savedTags.value.filter((t) => t !== tag)
  saveTags()
  selectedTags.value.delete(tag)
  selectedTags.value = new Set(selectedTags.value)
  await loadLogs()
}

// Get all unique tags from logs
const allTags = computed(() => {
  const tagsSet = new Set<string>()
  logs.value.forEach((log) => {
    log.tags.forEach((tag) => tagsSet.add(tag))
  })
  return Array.from(tagsSet).sort()
})

// Display tags: union of saved tags and tags from logs
const displayTags = computed(() => {
  const tagsSet = new Set<string>(savedTags.value)
  allTags.value.forEach((tag) => tagsSet.add(tag))
  return Array.from(tagsSet).sort()
})

// Count documents per tag (considering time period filter)
const tagCounts = computed(() => {
  const counts = new Map<string, number>()

  // First filter by time period if needed
  let itemsToCount = logs.value
  if (selectedPeriod.value !== 'all') {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    itemsToCount = logs.value.filter((item) => {
      if (!item.createdAt) return false
      const itemDate = new Date(item.createdAt)

      switch (selectedPeriod.value) {
        case 'month':
          return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        case 'quarter': {
          const currentQuarter = Math.floor(currentMonth / 3)
          const itemQuarter = Math.floor(itemDate.getMonth() / 3)
          return itemDate.getFullYear() === currentYear && itemQuarter === currentQuarter
        }
        case 'semester': {
          const currentSemester = Math.floor(currentMonth / 6)
          const itemSemester = Math.floor(itemDate.getMonth() / 6)
          return itemDate.getFullYear() === currentYear && itemSemester === currentSemester
        }
        case 'year':
          return itemDate.getFullYear() === currentYear
        case 'lastyear':
          return itemDate.getFullYear() === currentYear - 1
        default:
          return true
      }
    })
  }

  itemsToCount.forEach((log) => {
    log.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    })
  })

  return counts
})

// Filter logs by search and tags
const filteredLogs = computed(() => {
  let items = logs.value

  // Apply time period filter
  if (selectedPeriod.value !== 'all') {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    items = items.filter((item) => {
      if (!item.createdAt) return false
      const itemDate = new Date(item.createdAt)

      switch (selectedPeriod.value) {
        case 'month': {
          // This month
          return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        }
        case 'quarter': {
          // This quarter (Q1: 0-2, Q2: 3-5, Q3: 6-8, Q4: 9-11)
          const currentQuarter = Math.floor(currentMonth / 3)
          const itemQuarter = Math.floor(itemDate.getMonth() / 3)
          return itemDate.getFullYear() === currentYear && itemQuarter === currentQuarter
        }
        case 'semester': {
          // This semester (H1: 0-5, H2: 6-11)
          const currentSemester = Math.floor(currentMonth / 6)
          const itemSemester = Math.floor(itemDate.getMonth() / 6)
          return itemDate.getFullYear() === currentYear && itemSemester === currentSemester
        }
        case 'year': {
          // This year
          return itemDate.getFullYear() === currentYear
        }
        case 'lastyear': {
          // Last year
          return itemDate.getFullYear() === currentYear - 1
        }
        default:
          return true
      }
    })
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(
      (item) =>
        item.markdown.toLowerCase().includes(query) ||
        item.documentTitle.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)),
    )
  }

  // Apply tag filters (must have ALL selected tags)
  if (selectedTags.value.size > 0) {
    items = items.filter((item) => {
      if (!item.tags || item.tags.length === 0) return false
      return Array.from(selectedTags.value).every((tag) => item.tags.includes(tag))
    })
  }

  // Sort by created date
  items.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0
    if (!a.createdAt) return 1
    if (!b.createdAt) return -1

    const comparison = b.createdAt.localeCompare(a.createdAt)
    return sortOrder.value === 'desc' ? comparison : -comparison
  })

  return items
})

const toggleTag = (tag: string) => {
  if (selectedTags.value.has(tag)) {
    selectedTags.value.delete(tag)
  } else {
    selectedTags.value.add(tag)
  }
  selectedTags.value = new Set(selectedTags.value)
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedTags.value = new Set()
  selectedPeriod.value = 'all'
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

// Cache functions
const getCacheKey = () => {
  const tagsHash = savedTags.value.join('-')
  return `${CACHE_PREFIX}${tagsHash}`
}

const getCachedData = () => {
  try {
    const cacheKey = getCacheKey()
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    const cacheExpiryMs = getCacheExpiryMs()

    if (cacheExpiryMs > 0 && now - timestamp < cacheExpiryMs) {
      return data
    }

    localStorage.removeItem(cacheKey)
    return null
  } catch (error) {
    console.error('Error reading cache:', error)
    return null
  }
}

const setCachedData = (entries: LogEntry[]) => {
  try {
    const cacheKey = getCacheKey()
    const cacheData = {
      data: entries,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.error('Error saving cache:', error)
  }
}

// Extract tags matching the pattern
const extractMatchingTags = (markdown: string, pattern: string): string[] => {
  if (!pattern) {
    // If no specific tag, extract all tags
    const regex = /#([\w-]+(?:\/[\w-]+)*)/gi
    const tags: string[] = []
    let match
    while ((match = regex.exec(markdown)) !== null) {
      const tag = match[1] ? match[1].toLowerCase() : ''
      if (tag) tags.push(tag)
    }
    return [...new Set(tags)]
  }

  // Extract specific tag and its subtags
  const tags: string[] = []
  const regex = new RegExp(`#(${pattern}(?:\\/[\\w-]+)*)`, 'gi')
  let match
  while ((match = regex.exec(markdown)) !== null) {
    const tag = match[1] ? match[1].toLowerCase() : ''
    if (tag) tags.push(tag)
  }
  return [...new Set(tags)]
}

// Load logs for all saved tags
const loadLogs = async (forceRefresh = false) => {
  if (savedTags.value.length === 0) {
    logs.value = []
    return
  }

  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cachedData = getCachedData()
    if (cachedData) {
      logs.value = cachedData
      return
    }
  }

  isLoading.value = true
  error.value = null
  logs.value = []
  totalApiCalls.value = 1
  completedApiCalls.value = 0

  try {
    const apiUrl = getApiUrl()
    if (!apiUrl) {
      throw new Error('Craft API URL not configured')
    }

    const token = localStorage.getItem('craft-api-token')
    if (!token) {
      throw new Error('Craft API token not configured')
    }

    // Build regex pattern for all saved tags
    const patterns = savedTags.value.map((tag) => `#${tag}(?:\/[\w-]+)?`).join('|')
    const regexPattern = patterns || '#[\w-]+(?:\/[\w-]+)?'

    const response = await fetch(
      `${apiUrl}/documents/search?regexps=${encodeURIComponent(regexPattern)}&fetchMetadata=true`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    )

    completedApiCalls.value++

    if (!response.ok) {
      throw new Error(`Failed to search documents: ${response.statusText}`)
    }

    const data = await response.json()
    const items = data.items || []

    // Process results
    const logEntries: LogEntry[] = []

    for (const item of items) {
      const tags = extractMatchingTags(item.markdown || '', '')

      if (tags.length === 0) continue

      const entry: LogEntry = {
        documentId: item.documentId,
        documentTitle: item.title || 'Untitled',
        blockId: item.documentId,
        markdown: item.markdown || '',
        createdAt: item.createdAt,
        lastModifiedAt: item.lastModifiedAt,
        date: item.createdAt,
        tags,
        clickableLink: item.clickableLink,
      }

      logEntries.push(entry)
    }

    // Sort by date (most recent first)
    logEntries.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return b.date.localeCompare(a.date)
    })

    logs.value = logEntries

    // Save to cache
    setCachedData(logEntries)
  } catch (err) {
    console.error('Failed to load logs:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load logs'
  } finally {
    isLoading.value = false
  }
}

// Format date for display
const formatDate = (date?: string): string => {
  if (!date) return '-'

  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '-'
  }
}

// Format time for display
const formatTime = (date?: string): string => {
  if (!date) return ''

  try {
    const d = new Date(date)
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Open log in Craft
const openLog = async (entry: LogEntry) => {
  if (entry.clickableLink) {
    window.open(entry.clickableLink, '_blank')
  } else {
    await openCraftLink(entry.documentId, entry.blockId)
  }
}

const filterByTag = (tag: string) => {
  // Toggle tag in filter
  toggleTag(tag)
}

// Generate a unique color for a tag based on its text
const getTagColor = (tag: string) => {
  // Simple hash function to get a consistent number from string
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Convert hash to hue (0-360)
  const hue = Math.abs(hash % 360)

  // Return CSS custom properties that work with both themes
  return {
    '--tag-hue': hue,
  }
}

// Split content into text and tag parts for inline rendering
interface ContentPart {
  type: 'text' | 'tag'
  value: string
}

// Keep only lines that contain at least one user-added tag
const filterLinesWithSavedTags = (text: string): string => {
  if (!text) return ''

  const allowed = new Set(savedTags.value)
  const lines = text.split(/\r?\n/)

  const filtered = lines.filter((line) => {
    const tagsInLine = [...line.matchAll(/#([\w-]+(?:\/[\w-]+)*)/gi)].map((m) =>
      m[1] ? m[1].toLowerCase() : '',
    )

    if (tagsInLine.length === 0) return false

    // Keep line only if it contains a tag the user added
    return tagsInLine.some((tag) => allowed.has(tag))
  })

  return filtered.join(' | ')
}

const getContentParts = (text: string): ContentPart[] => {
  const parts: ContentPart[] = []
  const allowed = new Set(savedTags.value)
  const filteredText = filterLinesWithSavedTags(text)
  const regex = /#([\w-]+(?:\/[\w-]+)*)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(filteredText)) !== null) {
    const start = match.index
    const end = start + match[0].length

    // Expand to consume surrounding markdown wrappers (* or _) around the tag
    let prefixStart = start
    while (
      prefixStart > lastIndex &&
      (filteredText.charAt(prefixStart - 1) === '*' || filteredText.charAt(prefixStart - 1) === '_')
    ) {
      prefixStart--
    }
    let suffixEnd = end
    while (
      suffixEnd < filteredText.length &&
      (filteredText.charAt(suffixEnd) === '*' || filteredText.charAt(suffixEnd) === '_')
    ) {
      suffixEnd++
    }

    // Add preceding text (excluding markdown wrappers)
    if (prefixStart > lastIndex) {
      parts.push({ type: 'text', value: filteredText.slice(lastIndex, prefixStart) })
    }

    // Add tag without #
    const tag = match[1] ? match[1].toLowerCase() : ''
    if (tag && allowed.has(tag)) {
      parts.push({ type: 'tag', value: tag })
    } else if (tag) {
      // If tag not allowed, treat as plain text to avoid showing it as a badge
      parts.push({ type: 'text', value: filteredText.slice(start, end) })
    }

    // Advance lastIndex past the tag and any wrappers
    lastIndex = suffixEnd
  }

  // Add remaining text
  if (lastIndex < filteredText.length) {
    parts.push({ type: 'text', value: filteredText.slice(lastIndex) })
  }

  return parts
}

// Get logs for the selected period and tags (for charting)
const chartLogs = computed(() => {
  let items = logs.value

  // Apply time period filter
  if (selectedPeriod.value !== 'all') {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    items = items.filter((item) => {
      if (!item.createdAt) return false
      const itemDate = new Date(item.createdAt)

      switch (selectedPeriod.value) {
        case 'month':
          return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        case 'quarter': {
          const currentQuarter = Math.floor(currentMonth / 3)
          const itemQuarter = Math.floor(itemDate.getMonth() / 3)
          return itemDate.getFullYear() === currentYear && itemQuarter === currentQuarter
        }
        case 'semester': {
          const currentSemester = Math.floor(currentMonth / 6)
          const itemSemester = Math.floor(itemDate.getMonth() / 6)
          return itemDate.getFullYear() === currentYear && itemSemester === currentSemester
        }
        case 'year':
          return itemDate.getFullYear() === currentYear
        case 'lastyear':
          return itemDate.getFullYear() === currentYear - 1
        default:
          return true
      }
    })
  }

  // Apply tag filters (must have ALL selected tags)
  if (selectedTags.value.size > 0) {
    items = items.filter((item) => {
      if (!item.tags || item.tags.length === 0) return false
      return Array.from(selectedTags.value).every((tag) => item.tags.includes(tag))
    })
  }

  return items
})

// Get logs for periods only (no tag filter) - for initializing all available time periods
const chartLogsForPeriods = computed(() => {
  let items = logs.value

  // Apply time period filter only (no tag filter)
  if (selectedPeriod.value !== 'all') {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    items = items.filter((item) => {
      if (!item.createdAt) return false
      const itemDate = new Date(item.createdAt)

      switch (selectedPeriod.value) {
        case 'month':
          return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        case 'quarter': {
          const currentQuarter = Math.floor(currentMonth / 3)
          const itemQuarter = Math.floor(itemDate.getMonth() / 3)
          return itemDate.getFullYear() === currentYear && itemQuarter === currentQuarter
        }
        case 'semester': {
          const currentSemester = Math.floor(currentMonth / 6)
          const itemSemester = Math.floor(itemDate.getMonth() / 6)
          return itemDate.getFullYear() === currentYear && itemSemester === currentSemester
        }
        case 'year':
          return itemDate.getFullYear() === currentYear
        case 'lastyear':
          return itemDate.getFullYear() === currentYear - 1
        default:
          return true
      }
    })
  }

  return items
})

// Get tag occurrences grouped by week
const tagOccurrencesByWeek = computed(() => {
  const now = new Date()
  const weekData = new Map<string, Map<string, number>>()

  // Initialize last 8 weeks
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + i * 7))
    weekStart.setHours(0, 0, 0, 0)
    const weekKey = weekStart.toISOString().split('T')[0] || ''
    weekData.set(weekKey, new Map<string, number>())
  }

  // Count tags per week
  logs.value.forEach((log) => {
    if (!log.createdAt) return
    const logDate = new Date(log.createdAt)
    const weekStart = new Date(logDate)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekKey = weekStart.toISOString().split('T')[0] || ''

    if (weekData.has(weekKey)) {
      const weekTags = weekData.get(weekKey)!
      log.tags.forEach((tag) => {
        weekTags.set(tag, (weekTags.get(tag) || 0) + 1)
      })
    }
  })

  return weekData
})

// Get tag occurrences grouped by month
const tagOccurrencesByMonth = computed(() => {
  const now = new Date()
  const monthData = new Map<string, Map<string, number>>()

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = (monthStart.toISOString().split('T')[0] || '').slice(0, 7) // YYYY-MM
    monthData.set(monthKey, new Map<string, number>())
  }

  // Count tags per month
  logs.value.forEach((log) => {
    if (!log.createdAt) return
    const logDate = new Date(log.createdAt)
    const monthKey = (logDate.toISOString().split('T')[0] || '').slice(0, 7)

    if (monthData.has(monthKey)) {
      const monthTags = monthData.get(monthKey)!
      log.tags.forEach((tag) => {
        monthTags.set(tag, (monthTags.get(tag) || 0) + 1)
      })
    }
  })

  return monthData
})

// Get tag occurrences grouped by year
const tagOccurrencesByYear = computed(() => {
  const yearData = new Map<string, Map<string, number>>()

  // Initialize last 5 years
  const now = new Date()
  for (let i = 4; i >= 0; i--) {
    const year = now.getFullYear() - i
    const yearKey = year.toString()
    yearData.set(yearKey, new Map<string, number>())
  }

  // Count tags per year
  logs.value.forEach((log) => {
    if (!log.createdAt) return
    const logDate = new Date(log.createdAt)
    const yearKey = logDate.getFullYear().toString()

    if (yearData.has(yearKey)) {
      const yearTags = yearData.get(yearKey)!
      log.tags.forEach((tag) => {
        yearTags.set(tag, (yearTags.get(tag) || 0) + 1)
      })
    }
  })

  return yearData
})

// Get chart data based on selected period
const chartData = computed(() => {
  if (chartPeriod.value === 'week') {
    return tagOccurrencesByWeek.value
  } else if (chartPeriod.value === 'month') {
    return tagOccurrencesByMonth.value
  } else {
    return tagOccurrencesByYear.value
  }
})

// Get max total count in chart data for proportional sizing
const maxChartCount = computed(() => {
  let max = 0
  filteredChartData.value.forEach((tags) => {
    const total = Array.from(tags.values()).reduce((a, b) => a + b, 0)
    if (total > max) max = total
  })
  return Math.max(max, 1)
})

// Filter chart data to show only selected tags if any are selected
const filteredChartData = computed(() => {
  if (selectedTags.value.size === 0) {
    // No tags selected, show all
    return chartData.value
  }

  // Filter each period's data to only include selected tags
  const filtered = new Map<string, Map<string, number>>()

  chartData.value.forEach((tags, key) => {
    const filteredTags = new Map<string, number>()
    selectedTags.value.forEach((tag) => {
      const count = tags.get(tag)
      if (count) {
        filteredTags.set(tag, count)
      }
    })
    if (filteredTags.size > 0) {
      filtered.set(key, filteredTags)
    }
  })

  return filtered
})

// Get chart labels based on period
const getChartLabel = (key: string): string => {
  if (chartPeriod.value === 'week') {
    return new Date(key + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } else if (chartPeriod.value === 'month') {
    return new Date(key + '-01T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    })
  } else {
    return key
  }
}

// Get chart height multiplier based on period
const getChartHeightMultiplier = (): number => {
  if (chartPeriod.value === 'week') return 4
  if (chartPeriod.value === 'month') return 2
  return 1.5
}

// Get chart data for display (filtered by selected tags if any)
const getChartDataForPeriod = (tags: Map<string, number>): Array<[string, number]> => {
  if (selectedTags.value.size > 0) {
    return Array.from(tags.entries())
      .filter(([t]) => selectedTags.value.has(t))
      .sort((a, b) => b[1] - a[1])
  }
  return Array.from(tags.entries()).sort((a, b) => b[1] - a[1])
}

// Get chart total for display (filtered by selected tags if any)
const getChartTotal = (tags: Map<string, number>): number => {
  if (selectedTags.value.size > 0) {
    return Array.from(tags.entries())
      .filter(([t]) => selectedTags.value.has(t))
      .reduce((a, b) => a + b[1], 0)
  }
  return Array.from(tags.values()).reduce((a, b) => a + b, 0)
}

// Get top tags for current period
const topTags = computed(() => {
  const counts = new Map<string, number>()

  chartLogs.value.forEach((log) => {
    log.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    })
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: (count / chartLogs.value.length) * 100,
    }))
})

onMounted(() => {
  loadTags()
  loadLogs()

  // Register refresh function
  registerRefresh?.('tags', () => loadLogs(true))

  // Set subheader with view mode toggle
  setSubheader?.({
    right: () => [
      h(ViewTabs, {
        tabs: [
          { id: 'table', label: 'Table', icon: List },
          { id: 'chart', label: 'Chart', icon: BarChart3 },
        ],
        activeTab: viewMode.value,
        'onUpdate:activeTab': (tab: string) => {
          if (tab === 'table' || tab === 'chart') {
            viewMode.value = tab as 'table' | 'chart'
          }
        },
      }),
      h(
        SubheaderButton,
        {
          title: 'Add Tag',
          onClick: () => (showAddTagModal.value = true),
        },
        {
          default: () => h(Plus, { size: 16 }),
        },
      ),
      h(
        SubheaderButton,
        {
          title: 'Refresh',
          disabled: isLoading.value,
          onClick: () => loadLogs(true),
        },
        {
          default: () => h(RefreshCw, { size: 16, class: isLoading.value ? 'spinning' : '' }),
        },
      ),
    ],
  })
})
</script>

<template>
  <div class="tags-view">
    <ProgressIndicator
      v-if="isLoading"
      :completed="completedApiCalls"
      :total="totalApiCalls"
      message="Loading tags..."
    />

    <div v-if="error && !isLoading" class="error-message">
      {{ error }}
    </div>

    <div v-if="!isLoading && !error && savedTags.length === 0" class="empty-state">
      <Clock :size="48" />
      <p>No tags configured</p>
      <p class="hint">Click "Add Tag" to start tracking tags</p>
    </div>

    <template v-else>
      <div class="tags-content">
        <div class="tags-container">
          <!-- Shared Filters Section -->
          <div v-if="logs.length > 0" class="shared-filters">
            <!-- Search -->
            <div class="search-container">
              <Search :size="18" class="search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search tags..."
                class="search-input"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="clear-search-button"
                title="Clear search"
              >
                <X :size="16" />
              </button>
              <button
                @click="clearFilters"
                class="clear-filters-icon-button"
                :disabled="selectedTags.size === 0 && !searchQuery && selectedPeriod === 'all'"
                title="Clear filters"
              >
                <X :size="18" />
              </button>
            </div>

            <!-- Tag Filters -->
            <div v-if="allTags.length > 0" class="tags-filter">
              <div class="tags-list">
                <button
                  v-for="tag in displayTags"
                  :key="tag"
                  @click="toggleTag(tag)"
                  :class="['tag-filter-button', { active: selectedTags.has(tag) }]"
                  :style="getTagColor(tag)"
                >
                  #{{ tag }}
                  <span class="tag-count">{{ tagCounts.get(tag) || 0 }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- TABLE VIEW -->
          <template v-if="viewMode === 'table'">
            <div v-if="logs.length > 0" class="table-view">
              <!-- Time Period Filter (only for table) -->
              <div class="period-filter">
                <button
                  v-for="period in [
                    { value: 'all', label: 'All time' },
                    { value: 'month', label: 'This month' },
                    { value: 'quarter', label: 'This quarter' },
                    { value: 'semester', label: 'This semester' },
                    { value: 'year', label: 'This year' },
                    { value: 'lastyear', label: 'Last year' },
                  ]"
                  :key="period.value"
                  @click="selectedPeriod = period.value"
                  :class="['period-button', { active: selectedPeriod === period.value }]"
                >
                  {{ period.label }}
                </button>
              </div>

              <div v-if="filteredLogs.length === 0" class="no-results">
                <p>No documents found matching your filters.</p>
              </div>

              <div v-else class="table-container">
                <table class="logs-table">
                  <thead>
                    <tr>
                      <th
                        class="col-created sortable"
                        @click="toggleSortOrder"
                        title="Click to toggle sort order"
                      >
                        Created
                        <span class="sort-indicator">{{ sortOrder === 'desc' ? '↓' : '↑' }}</span>
                      </th>
                      <th class="col-modified">Modified</th>
                      <th class="col-content">Content</th>
                      <th class="col-action"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(entry, index) in filteredLogs"
                      :key="`${entry.documentId}-${index}`"
                      class="log-row"
                      @click="openLog(entry)"
                    >
                      <td class="col-created">
                        <div class="date-cell">
                          <div class="date">{{ formatDate(entry.createdAt) }}</div>
                          <div class="time">{{ formatTime(entry.createdAt) }}</div>
                        </div>
                      </td>
                      <td class="col-modified">
                        <div class="date-cell">
                          <div class="date">{{ formatDate(entry.lastModifiedAt) }}</div>
                          <div class="time">{{ formatTime(entry.lastModifiedAt) }}</div>
                        </div>
                      </td>
                      <td class="col-content">
                        <div class="content-cell">
                          <span v-for="(part, i) in getContentParts(entry.markdown)" :key="i">
                            <template v-if="part.type === 'text'">{{ part.value }}</template>
                            <template v-else>
                              <span
                                class="tag-badge inline"
                                :style="getTagColor(part.value)"
                                @click.stop="filterByTag(part.value)"
                                :title="`Filter by #${part.value}`"
                              >
                                #{{ part.value }}
                              </span>
                            </template>
                          </span>
                        </div>
                      </td>
                      <td class="col-action">
                        <ExternalLink :size="16" class="action-icon" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="empty-state">
              <Clock :size="48" />
              <p>No documents found</p>
              <p class="hint">No documents with these tags were found</p>
            </div>
          </template>

          <!-- CHART VIEW -->
          <template v-if="viewMode === 'chart'">
            <div v-if="logs.length > 0" class="chart-view">
              <!-- Chart Period Selector -->
              <div class="chart-period-buttons">
                <button
                  @click="chartPeriod = 'week'"
                  :class="['chart-period-button', { active: chartPeriod === 'week' }]"
                >
                  Week
                </button>
                <button
                  @click="chartPeriod = 'month'"
                  :class="['chart-period-button', { active: chartPeriod === 'month' }]"
                >
                  Month
                </button>
                <button
                  @click="chartPeriod = 'year'"
                  :class="['chart-period-button', { active: chartPeriod === 'year' }]"
                >
                  Year
                </button>
              </div>

              <div v-if="chartData.size === 0" class="no-results">
                <p>No data available for the selected period.</p>
              </div>

              <div v-else class="chart-container">
                <div class="timeline-chart">
                  <div v-for="[key, tags] of chartData.entries()" :key="key" class="chart-bar">
                    <div class="chart-label">{{ getChartLabel(key) }}</div>
                    <div
                      class="stacked-bar"
                      :style="{
                        height:
                          ((Array.from(tags.values()).reduce((a, b) => a + b, 0) || 1) /
                            maxChartCount) *
                            120 +
                          'px',
                      }"
                    >
                      <div
                        v-for="[tag, count] of getChartDataForPeriod(tags)"
                        :key="`${key}-${tag}`"
                        class="bar-segment"
                        :style="{
                          ...getTagColor(tag),
                          height: (count / maxChartCount) * 120 + 'px',
                        }"
                        :title="`${tag}: ${count}`"
                      ></div>
                    </div>
                    <div class="chart-total">
                      {{ getChartTotal(tags) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-state">
              <Clock :size="48" />
              <p>No documents found</p>
              <p class="hint">No documents with these tags were found</p>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Add Tag Modal -->
    <div v-if="showAddTagModal" class="modal-overlay" @click="showAddTagModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Add Tag</h2>
          <button class="close-button" @click="showAddTagModal = false">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <input
            v-model="newTag"
            type="text"
            placeholder="Enter tag name (e.g., til, work, project)"
            class="tag-input"
            @keyup.enter="addTag"
            @keyup.escape="showAddTagModal = false"
          />
          <div class="modal-hint">Tags will be searched as #tagname</div>

          <div v-if="savedTags.length > 0" class="saved-tags">
            <h3>Current Tags</h3>
            <div class="tags-list">
              <div v-for="tag in savedTags" :key="tag" class="tag-item">
                <span>#{{ tag }}</span>
                <button class="remove-button" @click="removeTag(tag)">
                  <X :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-button" @click="showAddTagModal = false">Cancel</button>
          <button class="add-button" @click="addTag">Add Tag</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tags-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.error-message {
  padding: 16px;
  margin: 20px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: var(--btn-danger-bg);
  font-size: 14px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
}

.empty-state p {
  margin: 0;
  font-size: 16px;
}

.empty-state .hint {
  font-size: 14px;
  opacity: 0.7;
}

.tags-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 16px;
  overflow-y: auto;
}

.tags-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
}

/* Shared filters section */
.shared-filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-primary);
}

/* Table and Chart Views */
.table-view,
.chart-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 16px 0;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  flex: 1;
  padding: 10px 40px 10px 40px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(var(--btn-primary-bg-rgb, 0, 0, 0), 0.1);
}

.clear-search-button {
  position: absolute;
  right: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all 0.2s ease;
}

.clear-search-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.clear-filters-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all 0.2s ease;
}

.clear-filters-icon-button:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.clear-filters-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tags-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.period-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-primary);
}

.period-button {
  padding: 6px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.period-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.period-button.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: white;
}

.period-button.active:hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-filter-button {
  padding: 6px 12px;
  background: hsl(var(--tag-hue, 220), 70%, 95%);
  border: 1px solid hsl(var(--tag-hue, 220), 60%, 75%);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--tag-hue, 220), 70%, 35%);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
}

[data-theme='dark'] .content-cell .tag-badge.inline {
  background: hsl(var(--tag-hue, 220), 65%, 45%);
  border-color: hsl(var(--tag-hue, 220), 65%, 45%);
}

.content-cell .tag-badge.inline {
  margin: 0 4px;
}

[data-theme='dark'] .tag-count {
  background: rgba(255, 255, 255, 0.15);
}

.tag-filter-button.active .tag-count {
  background: rgba(255, 255, 255, 0.25);
  color: white;
}

[data-theme='dark'] .tag-filter-button {
  background: hsl(var(--tag-hue, 220), 60%, 20%);
  border-color: hsl(var(--tag-hue, 220), 50%, 35%);
  color: hsl(var(--tag-hue, 220), 70%, 75%);
}

.tag-filter-button:hover {
  background: hsl(var(--tag-hue, 220), 70%, 88%);
  border-color: hsl(var(--tag-hue, 220), 60%, 65%);
  color: hsl(var(--tag-hue, 220), 70%, 30%);
}

[data-theme='dark'] .tag-filter-button:hover {
  background: hsl(var(--tag-hue, 220), 60%, 25%);
  border-color: hsl(var(--tag-hue, 220), 50%, 45%);
  color: hsl(var(--tag-hue, 220), 70%, 80%);
}

.tag-filter-button.active {
  background: hsl(var(--tag-hue, 220), 70%, 50%);
  border-color: hsl(var(--tag-hue, 220), 70%, 50%);
  color: white;
}

[data-theme='dark'] .tag-filter-button.active {
  background: hsl(var(--tag-hue, 220), 65%, 45%);
  border-color: hsl(var(--tag-hue, 220), 65%, 45%);
  color: white;
}

.tag-filter-button.active:hover {
  background: hsl(var(--tag-hue, 220), 70%, 45%);
  border-color: hsl(var(--tag-hue, 220), 70%, 45%);
}

[data-theme='dark'] .tag-filter-button.active:hover {
  background: hsl(var(--tag-hue, 220), 65%, 50%);
  border-color: hsl(var(--tag-hue, 220), 65%, 50%);
}

.no-results {
  padding: 40px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}

.table-container {
  overflow: auto;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  max-height: 600px;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: var(--bg-primary);
}

.logs-table thead {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 10;
  box-shadow: 0 1px 0 var(--border-primary);
}

.logs-table th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 2px solid var(--border-primary);
  white-space: nowrap;
  background: var(--bg-secondary);
}

.logs-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
}

.logs-table th.sortable:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sort-indicator {
  margin-left: 4px;
  font-size: 12px;
  opacity: 0.7;
}

.logs-table tbody tr {
  border-bottom: 1px solid var(--border-primary);
  cursor: pointer;
  transition: background-color 0.15s ease;
  background: var(--bg-primary);
}

.logs-table tbody tr:hover {
  background: var(--bg-secondary);
}

.logs-table tbody tr:last-child {
  border-bottom: none;
}

.logs-table td {
  padding: 8px 12px;
  vertical-align: middle;
}

.col-created,
.col-modified {
  width: 140px;
  min-width: 140px;
}

.col-content {
  width: auto;
  max-width: 600px;
}

.col-action {
  width: 40px;
  min-width: 40px;
  text-align: center;
}

.date-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.date-cell .date {
  color: var(--text-primary);
  font-weight: 500;
}

.date-cell .time {
  color: var(--text-tertiary);
  font-size: 11px;
}

.tags-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag-badge {
  padding: 2px 6px;
  background: hsl(var(--tag-hue, 220), 70%, 50%);
  border: 1px solid hsl(var(--tag-hue, 220), 70%, 50%);
  color: white;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}

[data-theme='dark'] .tag-badge {
  background: hsl(var(--tag-hue, 220), 65%, 45%);
  border-color: hsl(var(--tag-hue, 220), 65%, 45%);
}

.tag-badge:hover {
  background: hsl(var(--tag-hue, 220), 70%, 45%);
  border-color: hsl(var(--tag-hue, 220), 70%, 45%);
}

[data-theme='dark'] .tag-badge:hover {
  background: hsl(var(--tag-hue, 220), 65%, 50%);
  border-color: hsl(var(--tag-hue, 220), 65%, 50%);
}

.chart-period-buttons {
  display: flex;
  gap: 6px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-primary);
}

.chart-period-button {
  padding: 6px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chart-period-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.chart-period-button.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: white;
}

.chart-period-button.active:hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}

.chart-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chart-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  margin-bottom: 4px;
}

.chart-total {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 2px;
}

.content-cell {
  color: var(--text-primary);
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

.action-icon {
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.log-row:hover .action-icon {
  opacity: 1;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-button {
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.tag-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.tag-input:focus {
  border-color: var(--btn-primary-bg);
}

.modal-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.saved-tags {
  margin-top: 24px;
}

.saved-tags h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
}

.remove-button {
  padding: 2px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s ease;
}

.remove-button:hover {
  background: var(--btn-danger-bg);
  color: white;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-primary);
}

.cancel-button,
.add-button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
}

.cancel-button:hover {
  background: var(--bg-tertiary);
}

.add-button {
  background: var(--btn-primary-bg);
  border: none;
  color: white;
}

.add-button:hover {
  background: var(--btn-primary-hover);
}

/* Spinning animation */
:deep(.spinning) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Analytics Charts */
.analytics-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
  border-bottom: 1px solid var(--border-primary);
}

.chart-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
}

/* Bar Chart */
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
}

.tag-name {
  color: var(--text-primary);
}

.bar-value {
  color: var(--text-secondary);
}

.bar-background {
  height: 24px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: hsl(var(--tag-hue, 220), 70%, 50%);
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 2%;
}

[data-theme='dark'] .bar-fill {
  background: hsl(var(--tag-hue, 220), 65%, 45%);
}

/* Timeline Chart */
.timeline-chart {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  overflow-x: auto;
  padding: 8px 0;
  min-height: 120px;
}

.chart-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chart-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  margin-bottom: 4px;
}

.stacked-bar {
  width: 28px;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  overflow: hidden;
  gap: 1px;
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  transition: all 0.2s ease;
  cursor: pointer;
}

.stacked-bar:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

[data-theme='dark'] .stacked-bar:hover {
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
}

.bar-segment {
  background: hsl(var(--tag-hue, 220), 70%, 50%);
  transition: all 0.2s ease;
  min-height: 2px;
}

[data-theme='dark'] .bar-segment {
  background: hsl(var(--tag-hue, 220), 65%, 45%);
}

.chart-total {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .table-container {
    margin: 12px;
  }

  .logs-table {
    font-size: 12px;
  }

  .col-created,
  .col-modified {
    width: 100px;
    min-width: 100px;
  }

  .col-content {
    max-width: 300px;
  }
}
</style>
