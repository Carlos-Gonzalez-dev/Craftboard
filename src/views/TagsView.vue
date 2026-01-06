<script setup lang="ts">
import { ref, computed, onMounted, inject, h, watch } from 'vue'
import { Clock, RefreshCw, ExternalLink, Plus, X, Search } from 'lucide-vue-next'
import { getApiUrl, openCraftLink, getCacheExpiryMs } from '../utils/craftApi'
import { useRoute, useRouter } from 'vue-router'
import ViewSubheader from '../components/ViewSubheader.vue'
import ViewTabs from '../components/ViewTabs.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const route = useRoute()
const router = useRouter()
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
const showAddTagModal = ref(false)
const newTag = ref('')

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

// Filter logs by search and tags
const filteredLogs = computed(() => {
  let items = logs.value

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
      tags.push(match[1].toLowerCase())
    }
    return [...new Set(tags)]
  }

  // Extract specific tag and its subtags
  const tags: string[] = []
  const regex = new RegExp(`#(${pattern}(?:\\/[\\w-]+)*)`, 'gi')
  let match
  while ((match = regex.exec(markdown)) !== null) {
    tags.push(match[1].toLowerCase())
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

// Tabs for tags
const tabs = computed(() => {
  return [
    { id: '', label: 'All' },
    ...savedTags.value.map((tag) => ({ id: tag, label: `#${tag}` })),
  ]
})

onMounted(() => {
  loadTags()
  loadLogs()

  // Register refresh function
  registerRefresh?.('tags', () => loadLogs(true))

  // Set subheader
  setSubheader?.({
    right: () => [
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
      :current="completedApiCalls"
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
          <div
            v-if="logs.length > 0 || searchQuery || selectedTags.size > 0"
            class="tags-tab-content"
          >
            <!-- Search and Filters -->
            <div class="tags-filters">
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
                  :disabled="selectedTags.size === 0 && !searchQuery"
                  title="Clear filters"
                >
                  <X :size="18" />
                </button>
              </div>

              <div v-if="allTags.length > 0" class="tags-filter">
                <div class="tags-list">
                  <button
                    v-for="tag in allTags"
                    :key="tag"
                    @click="toggleTag(tag)"
                    :class="['tag-filter-button', { active: selectedTags.has(tag) }]"
                    :style="getTagColor(tag)"
                  >
                    #{{ tag }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="filteredLogs.length === 0" class="no-results">
              <p>No documents found matching your filters.</p>
            </div>

            <div v-else class="table-container">
              <table class="logs-table">
                <thead>
                  <tr>
                    <th class="col-created">Created</th>
                    <th class="col-modified">Modified</th>
                    <th class="col-tags">Tags</th>
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
                    <td class="col-tags">
                      <div class="tags-cell">
                        <span
                          v-for="tag in entry.tags"
                          :key="tag"
                          class="tag-badge"
                          :style="getTagColor(tag)"
                          @click.stop="filterByTag(tag)"
                          :title="`Filter by #${tag}`"
                        >
                          #{{ tag }}
                        </span>
                      </div>
                    </td>
                    <td class="col-content">
                      <div class="content-cell">{{ entry.markdown }}</div>
                    </td>
                    <td class="col-action">
                      <ExternalLink :size="16" class="action-icon" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-else-if="!isLoading && logs.length === 0" class="empty-state">
            <Clock :size="48" />
            <p>No documents found</p>
            <p class="hint">No documents with these tags were found</p>
          </div>
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
  gap: 24px;
  padding: 20px;
}

.tags-content:has(.tags-container) {
  padding: 8px 16px;
}

.tags-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
}

.tags-tab-content {
  flex: 1;
  padding-top: 0;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tags-filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-primary);
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
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  margin: 20px;
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

.col-tags {
  width: 180px;
  min-width: 120px;
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

.content-cell {
  color: var(--text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

  .col-tags {
    display: none;
  }

  .col-content {
    max-width: 300px;
  }
}
</style>
