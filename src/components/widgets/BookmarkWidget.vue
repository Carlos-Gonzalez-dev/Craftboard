<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Loader } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { getApiUrl, getCollectionItems } from '../../utils/craftApi'
import { getFaviconUrl, getDomain } from '../../utils/favicon'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const router = useRouter()

// API Configuration
const apiBaseUrl = ref('')
const bookmarksCollectionId = ref<string | null>(null)

// Cache keys
const CACHE_PREFIX = 'bookmarks-cache-'
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// State
const isConfiguring = ref(!props.widget.data?.bookmarkId)
const bookmarks = ref<any[]>([])
const selectedBookmark = ref<any | null>(null)
const searchQuery = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

interface BookmarkItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
}

const discoverCollection = async () => {
  if (!apiBaseUrl.value) return

  // Load collection ID from settings
  const bookmarksId = localStorage.getItem('collection-id-bookmarks')

  if (!bookmarksId) {
    error.value =
      'Bookmarks collection ID not configured. Please configure it in Settings > API > Collection IDs.'
    return
  }

  bookmarksCollectionId.value = bookmarksId
}

const getCacheKey = () => {
  if (!bookmarksCollectionId.value) return null
  return `${CACHE_PREFIX}${bookmarksCollectionId.value}`
}

const getCachedData = () => {
  const cacheKey = getCacheKey()
  if (!cacheKey) return null

  try {
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()

    if (now - timestamp < CACHE_EXPIRY_MS) {
      return data
    }

    localStorage.removeItem(cacheKey)
    return null
  } catch (error) {
    console.error('Error reading cache:', error)
    return null
  }
}

const fetchBookmarks = async () => {
  if (!apiBaseUrl.value || !bookmarksCollectionId.value) {
    isLoading.value = false
    return
  }

  isLoading.value = true
  error.value = null
  totalApiCalls.value = 1
  completedApiCalls.value = 0

  // Check cache first
  const cached = getCachedData()
  if (cached) {
    bookmarks.value = cached
    isLoading.value = false
    loadSelectedBookmark()
    return
  }

  try {
    const items = await getCollectionItems(bookmarksCollectionId.value)
    completedApiCalls.value++

    const validItems: BookmarkItem[] = items
      .map((item: any) => {
        const properties = item.properties || {}
        let title = item.title || ''
        if (title.trim().toLowerCase() === 'untitled') {
          title = ''
        }
        const url = properties.URL || properties.url || properties['URL'] || properties['url'] || ''
        const category =
          properties.Category ||
          properties.category ||
          properties['Category'] ||
          properties['category'] ||
          ''
        const tags =
          properties.tags || properties.Tags || properties['tags'] || properties['Tags'] || []

        if (url && category) {
          return {
            id: item.id,
            title: String(title),
            url: String(url),
            category: String(category),
            tags: Array.isArray(tags) ? tags.map((t: any) => String(t)) : [],
          }
        }
        return null
      })
      .filter((item: BookmarkItem | null): item is BookmarkItem => item !== null)

    bookmarks.value = validItems

    // Cache items
    const cacheKey = getCacheKey()
    if (cacheKey) {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: validItems,
          timestamp: Date.now(),
        }),
      )
    }

    loadSelectedBookmark()
  } catch (err) {
    console.error('Error fetching bookmarks:', err)
    error.value = 'Failed to fetch bookmarks'
    completedApiCalls.value++
  } finally {
    isLoading.value = false
  }
}

const loadSelectedBookmark = () => {
  const bookmarkId = props.widget.data?.bookmarkId
  if (bookmarkId) {
    const bookmark = bookmarks.value.find((b) => b.id === bookmarkId)
    if (bookmark) {
      selectedBookmark.value = bookmark
      emit('update:title', bookmark.title || getDomain(bookmark.url))
    }
  }
}

const filteredBookmarks = computed(() => {
  if (!searchQuery.value.trim()) {
    return bookmarks.value
  }

  const query = searchQuery.value.toLowerCase().trim()
  return bookmarks.value.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const url = item.url.toLowerCase()
    const domain = getDomain(item.url).toLowerCase()
    return title.includes(query) || url.includes(query) || domain.includes(query)
  })
})

const selectBookmark = (bookmark: BookmarkItem) => {
  selectedBookmark.value = bookmark
  emit('update:data', {
    ...props.widget.data,
    bookmarkId: bookmark.id,
  })
  emit('update:title', bookmark.title || getDomain(bookmark.url))
  isConfiguring.value = false
}

const navigateToCategory = (category: string, event: Event) => {
  event.preventDefault()
  event.stopPropagation()
  router.push({
    path: '/bookmarks',
    query: { category }
  })
}

const openBookmark = () => {
  if (selectedBookmark.value?.url) {
    window.open(selectedBookmark.value.url, '_blank', 'noopener,noreferrer')
  }
}

const initialize = async () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    error.value = 'Craft API URL not configured'
    return
  }

  await discoverCollection()
  if (bookmarksCollectionId.value) {
    await fetchBookmarks()
  }
}

onMounted(() => {
  initialize()
})

watch(
  () => props.widget.data?.bookmarkId,
  () => {
    loadSelectedBookmark()
  },
)
</script>

<template>
  <div class="bookmark-widget">
    <!-- Configuration View -->
    <div v-if="isConfiguring" class="config-view">
      <div class="config-header">
        <h3>Select Bookmark</h3>
        <p class="config-description">Search and select a bookmark to display</p>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <div v-if="isLoading" class="loading-state">
        <ProgressIndicator
          :completed="completedApiCalls"
          :total="totalApiCalls"
          message="Loading bookmarks"
        />
      </div>

      <div v-else-if="bookmarks.length === 0" class="empty-state">
        <p>No bookmarks found. Please configure bookmarks in Settings.</p>
      </div>

      <div v-else class="search-container">
        <Search :size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search bookmarks..."
          class="search-input"
        />
      </div>

      <div v-if="!isLoading && bookmarks.length > 0" class="bookmarks-list">
        <button
          v-for="bookmark in filteredBookmarks"
          :key="bookmark.id"
          @click="selectBookmark(bookmark)"
          class="bookmark-option"
        >
          <img
            :src="getFaviconUrl(bookmark.url)"
            :alt="getDomain(bookmark.url)"
            class="bookmark-favicon"
            @error="
              (e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }
            "
          />
          <div class="bookmark-info">
            <div class="bookmark-title">{{ bookmark.title || getDomain(bookmark.url) }}</div>
            <div class="bookmark-url">{{ bookmark.url }}</div>
            <div class="bookmark-category">{{ bookmark.category }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Display View -->
    <div v-else-if="selectedBookmark" class="display-view">
      <a
        :href="selectedBookmark.url"
        @click.prevent="openBookmark"
        target="_blank"
        rel="noopener noreferrer"
        class="bookmark-link"
      >
        <img
          :src="getFaviconUrl(selectedBookmark.url)"
          :alt="getDomain(selectedBookmark.url)"
          class="bookmark-favicon-large"
          @error="
            (e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }
          "
        />
        <div class="bookmark-content">
          <div class="bookmark-title-large">
            {{ selectedBookmark.title || getDomain(selectedBookmark.url) }}
          </div>
          <div class="bookmark-url-small">{{ getDomain(selectedBookmark.url) }}</div>
          <button
            v-if="selectedBookmark.category"
            @click="navigateToCategory(selectedBookmark.category, $event)"
            class="bookmark-category-badge"
            :title="`Go to ${selectedBookmark.category} bookmarks`"
          >
            {{ selectedBookmark.category }}
          </button>
        </div>
      </a>
    </div>

    <div v-else class="empty-state">
      <p>No bookmark selected</p>
    </div>
  </div>
</template>

<style scoped>
.bookmark-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.config-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
}

.config-header h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-description {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.error-message {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--btn-danger-bg);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 13px;
}

.spinner {
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

.search-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.bookmarks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.bookmark-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.bookmark-option:hover {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
}

.bookmark-favicon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: white;
  border-radius: 4px;
  padding: 2px;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-url {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-category {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}

.display-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  position: relative;
}

.bookmark-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

.bookmark-link:hover {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.bookmark-favicon-large {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  background: white;
  border-radius: 8px;
  padding: 4px;
}

.bookmark-content {
  flex: 1;
  min-width: 0;
}

.bookmark-title-large {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-url-small {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.bookmark-category-badge {
  display: inline-block;
  padding: 4px 10px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  margin-top: 8px;
  border: 1px solid var(--border-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.bookmark-category-badge:hover {
  background: var(--bg-secondary);
  color: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  transform: translateY(-1px);
}
</style>
