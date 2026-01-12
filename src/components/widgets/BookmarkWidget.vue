<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Loader } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { getApiUrl } from '../../utils/craftApi'
import { getFaviconUrl, getDomain } from '../../utils/favicon'
import { useBookmarksApiStore } from '../../stores/bookmarksApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const router = useRouter()

const bookmarksApiStore = useBookmarksApiStore()

// API Configuration
const apiBaseUrl = ref('')
const bookmarksCollectionId = ref<string | null>(null)

// State
const isConfiguring = ref(!props.widget.data?.bookmarkId)
const bookmarks = computed(() => bookmarksApiStore.bookmarks)
const selectedBookmark = ref<any | null>(null)
const searchQuery = ref('')
const isLoading = computed(() => bookmarksApiStore.isLoading)
const error = ref<string | null>(null)
const totalApiCalls = computed(() => bookmarksApiStore.totalApiCalls)
const completedApiCalls = computed(() => bookmarksApiStore.completedApiCalls)

interface BookmarkItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
  env?: 'dev' | 'staging' | 'prod'
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

const fetchBookmarks = async () => {
  if (!apiBaseUrl.value || !bookmarksCollectionId.value) {
    return
  }

  error.value = null

  try {
    await bookmarksApiStore.initializeBookmarks(bookmarksCollectionId.value, false)
    loadSelectedBookmark()
  } catch (err) {
    console.error('Error fetching bookmarks:', err)
    error.value = 'Failed to fetch bookmarks'
  }
}

const loadSelectedBookmark = () => {
  const bookmarkId = props.widget.data?.bookmarkId
  if (bookmarkId) {
    const bookmark = bookmarks.value.find((b) => b.id === bookmarkId)
    if (bookmark) {
      selectedBookmark.value = bookmark
      const newTitle = bookmark.title || getDomain(bookmark.url)
      // Only emit if title actually changed to prevent infinite loops
      if (props.widget.title !== newTitle) {
        emit('update:title', newTitle)
      }
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
    query: { category },
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
          :class="['bookmark-option', bookmark.env ? `bookmark-option-${bookmark.env}` : '']"
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
            <div class="bookmark-title-row">
              <div class="bookmark-title">{{ bookmark.title || getDomain(bookmark.url) }}</div>
              <span v-if="bookmark.env" :class="['env-badge', `env-badge-${bookmark.env}`]">
                {{ bookmark.env }}
              </span>
            </div>
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
        :class="[
          'bookmark-link',
          selectedBookmark.env ? `bookmark-link-${selectedBookmark.env}` : '',
        ]"
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
          <div class="bookmark-header">
            <div class="bookmark-title-large">
              {{ selectedBookmark.title || getDomain(selectedBookmark.url) }}
            </div>
            <span
              v-if="selectedBookmark.env"
              :class="['env-badge', `env-badge-${selectedBookmark.env}`]"
            >
              {{ selectedBookmark.env }}
            </span>
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

.bookmark-option-dev {
  border-left: 3px solid #3b82f6;
}

.bookmark-option-dev:hover {
  border-left-color: #2563eb;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.bookmark-option-staging {
  border-left: 3px solid #f59e0b;
}

.bookmark-option-staging:hover {
  border-left-color: #d97706;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
}

.bookmark-option-prod {
  border-left: 3px solid #22c55e;
}

.bookmark-option-prod:hover {
  border-left-color: #16a34a;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.2);
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

.bookmark-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
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
  container-type: inline-size;
}

.bookmark-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

/* Layout vertical para widgets pequeños */
@container (max-width: 300px) {
  .bookmark-link {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .bookmark-content {
    align-items: center;
  }

  .bookmark-header {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .bookmark-title-large {
    text-align: center;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .bookmark-url-small {
    text-align: center;
  }
}

.bookmark-link:hover {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.bookmark-link-dev {
  border-left: 3px solid #3b82f6;
}

.bookmark-link-dev:hover {
  border-left-color: #2563eb;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

.bookmark-link-staging {
  border-left: 3px solid #f59e0b;
}

.bookmark-link-staging:hover {
  border-left-color: #d97706;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.bookmark-link-prod {
  border-left: 3px solid #22c55e;
}

.bookmark-link-prod:hover {
  border-left-color: #16a34a;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
}

.bookmark-favicon-large {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  background: white;
  border-radius: 8px;
  padding: 4px;
  transition: all 0.2s ease;
}

/* Favicon más pequeño en widgets pequeños */
@container (max-width: 300px) {
  .bookmark-favicon-large {
    width: 40px;
    height: 40px;
  }
}

.bookmark-content {
  flex: 1;
  min-width: 0;
}

.bookmark-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.bookmark-title-large {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* Permitir que el título se ajuste en widgets pequeños */
@container (max-width: 300px) {
  .bookmark-title-large {
    font-size: 14px;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.env-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  flex-shrink: 0;
}

.env-badge-dev {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.env-badge-staging {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.env-badge-prod {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
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
