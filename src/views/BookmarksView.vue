<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch, inject, h } from 'vue'
import { Bookmark, ExternalLink, Search, X, RefreshCw } from 'lucide-vue-next'
import {
  getApiUrl,
  getApiToken,
  getCollectionItems,
  getCacheExpiryMs,
} from '../utils/craftApi'
import { getFaviconUrl, getDomain } from '../utils/favicon'
import { useRoute } from 'vue-router'
import ViewSubheader from '../components/ViewSubheader.vue'
import ViewTabs from '../components/ViewTabs.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const route = useRoute()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader = inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

// API Configuration
const apiBaseUrl = ref('')
const selectedDocumentId = ref<string | null>(null)
const bookmarksCollectionId = ref<string | null>(null)

// Cache keys
const CACHE_PREFIX = 'bookmarks-cache-'

// State
const bookmarks = ref<any[]>([])
const errorMessage = ref('')
const isLoading = ref(false)
const selectedCategory = ref<string | null>(null)
const searchQuery = ref('')
const selectedTags = ref<Set<string>>(new Set())

// Progress tracking
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

interface BookmarkItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
}

// Grouped bookmarks by category
const groupedBookmarks = computed(() => {
  const groups = new Map<string, BookmarkItem[]>()

  bookmarks.value.forEach((item) => {
    const category = item.category || 'Uncategorized'
    if (!groups.has(category)) {
      groups.set(category, [])
    }
    const categoryItems = groups.get(category)
    if (categoryItems) {
      categoryItems.push(item)
    }
  })

  // Convert to array and sort categories
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

// Get categories for tabs
const categories = computed(() => {
  return groupedBookmarks.value.map(([category]) => category)
})

// Get available tags from bookmarks in the selected category
const allTags = computed(() => {
  if (!selectedCategory.value) return []

  const tagsSet = new Set<string>()
  const found = groupedBookmarks.value.find(([category]) => category === selectedCategory.value)

  if (!found) return []

  found[1].forEach((bookmark) => {
    if (bookmark.tags && Array.isArray(bookmark.tags)) {
      bookmark.tags.forEach((tag: string) => tagsSet.add(tag))
    }
  })

  return Array.from(tagsSet).sort()
})

// Get items for selected category (filtered by search and tags)
const selectedCategoryItems = computed(() => {
  if (!selectedCategory.value) return []
  const found = groupedBookmarks.value.find(([category]) => category === selectedCategory.value)
  if (!found) return []

  let items = found[1]

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    items = items.filter((item) => {
      const title = (item.title || '').toLowerCase()
      const url = item.url.toLowerCase()
      const domain = getDomain(item.url).toLowerCase()
      return title.includes(query) || url.includes(query) || domain.includes(query)
    })
  }

  // Filter by selected tags
  if (selectedTags.value.size > 0) {
    items = items.filter((item) => {
      if (!item.tags || item.tags.length === 0) return false
      return Array.from(selectedTags.value).some((tag) => item.tags.includes(tag))
    })
  }

  return items
})

// Set initial selected category
const initializeSelectedCategory = () => {
  if (categories.value.length > 0 && !selectedCategory.value) {
    selectedCategory.value = categories.value[0]
  }
}

const getHeaders = () => {
  const token = getApiToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

const loadApiUrl = () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    errorMessage.value = 'Craft API URL not configured. Please configure it in Settings.'
    isLoading.value = false
    return
  }

  initializeBookmarks(false)
}

const initializeBookmarks = async (forceRefresh = false) => {
  if (!apiBaseUrl.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  completedApiCalls.value = 0
  totalApiCalls.value = 0

  // Load collection ID from settings
  await discoverCollection(forceRefresh)

  // Count API calls needed
  let apiCallCount = 0
  if (forceRefresh || !getCachedData()) apiCallCount++ // fetchCollectionItems
  
  totalApiCalls.value = apiCallCount

  if (!bookmarksCollectionId.value) {
    isLoading.value = false
    return
  }

  // Check cache first
  if (!forceRefresh) {
    const cached = getCachedData()
    if (cached) {
      bookmarks.value = cached || []
      isLoading.value = false
      initializeSelectedCategory()
      return
    }
  } else {
    clearCache()
  }

  if (bookmarksCollectionId.value) {
    await fetchCollectionItems(forceRefresh)
  }
}

const discoverCollection = async (forceRefresh = false) => {
  if (!apiBaseUrl.value) return

  // Load collection ID from settings
  const bookmarksId = localStorage.getItem('collection-id-bookmarks')
  
  if (!bookmarksId) {
    errorMessage.value = 'Bookmarks collection ID not configured. Please configure it in Settings > API > Collection IDs.'
    isLoading.value = false
    completedApiCalls.value++
    return
  }

  bookmarksCollectionId.value = bookmarksId
}

const getCacheKey = () => {
  if (!bookmarksCollectionId.value) return null
  return `${CACHE_PREFIX}${bookmarksCollectionId.value}`
}

const getCachedData = () => {
  try {
    const cacheKey = getCacheKey()
    if (!cacheKey) return null
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

const setCachedData = (items: BookmarkItem[]) => {
  try {
    const cacheKey = getCacheKey()
    if (!cacheKey) return
    const cacheData = {
      data: items,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.error('Error saving cache:', error)
  }
}

const clearCache = () => {
  try {
    const cacheKey = getCacheKey()
    if (cacheKey) {
      localStorage.removeItem(cacheKey)
    }
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}

const fetchCollectionItems = async (forceRefresh = false) => {
  if (!apiBaseUrl.value || !bookmarksCollectionId.value) {
    isLoading.value = false
    return
  }

  try {
    const items = await getCollectionItems(bookmarksCollectionId.value)
    completedApiCalls.value++

    // Filter items with mandatory fields (title, URL, Category)
    const validItems: BookmarkItem[] = items
      .map((item: any) => {
        const properties = item.properties || {}

        // Title comes from item.title, not properties
        let title = item.title || ''
        // Replace "Untitled" with empty string
        if (title.trim().toLowerCase() === 'untitled') {
          title = ''
        }
        // Try different property name variations (case-insensitive) for URL and Category
        const url = properties.URL || properties.url || properties['URL'] || properties['url'] || ''
        const category =
          properties.Category ||
          properties.category ||
          properties['Category'] ||
          properties['category'] ||
          ''
        const tags =
          properties.tags || properties.Tags || properties['tags'] || properties['Tags'] || []

        // Only include items with URL and category (title can be empty)
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
    setCachedData(validItems)

    // Initialize selected category
    initializeSelectedCategory()
  } catch (error) {
    console.error('Error fetching collection items:', error)
    errorMessage.value = 'Failed to fetch Bookmarks collection items. Please check Settings.'
    completedApiCalls.value++
  } finally {
    isLoading.value = false
  }
}

const refreshBookmarks = async () => {
  clearCache()
  await initializeBookmarks(true)
}

const toggleTag = (tag: string) => {
  if (selectedTags.value.has(tag)) {
    selectedTags.value.delete(tag)
  } else {
    selectedTags.value.add(tag)
  }
  // Create a new Set to trigger reactivity
  selectedTags.value = new Set(selectedTags.value)
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedTags.value = new Set()
}

// Watch for groupedBookmarks changes to initialize selected category
watch(
  groupedBookmarks,
  () => {
    initializeSelectedCategory()
  },
  { immediate: true },
)

// Clear tag filters when category changes
watch(selectedCategory, () => {
  selectedTags.value = new Set()
})

// Track if we've already initialized to prevent duplicate API calls
const isInitializing = ref(false)

onMounted(() => {
  if (!isInitializing.value) {
    isInitializing.value = true
    loadApiUrl()
    initializeSelectedCategory()
    if (registerRefresh) {
      registerRefresh(String(route.name), refreshBookmarks)
    }
  }
  
  // Register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedBookmarks.value.length > 0) {
    setSubheader({
      default: () => h(ViewTabs, {
        tabs: categories.value.map((cat) => ({ id: cat, label: cat })),
        activeTab: selectedCategory.value || '',
        'onUpdate:activeTab': (tab: string) => { selectedCategory.value = tab }
      }),
      right: () => h(SubheaderButton, { title: 'Refresh bookmarks', onClick: refreshBookmarks }, {
        default: () => h(RefreshCw, { size: 16 })
      })
    })
  }
})

onUnmounted(() => {
  if (setSubheader) {
    setSubheader(null)
  }
})

onActivated(() => {
  isInitializing.value = false
  loadApiUrl()
  initializeSelectedCategory()
  // Re-register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedBookmarks.value.length > 0) {
    setSubheader({
      default: () => h(ViewTabs, {
        tabs: categories.value.map((cat) => ({ id: cat, label: cat })),
        activeTab: selectedCategory.value || '',
        'onUpdate:activeTab': (tab: string) => { selectedCategory.value = tab }
      }),
      right: () => h(SubheaderButton, { title: 'Refresh bookmarks', onClick: refreshBookmarks }, {
        default: () => h(RefreshCw, { size: 16 })
      })
    })
  }
})

// Watch for changes to update subheader
watch([categories, selectedCategory, errorMessage, isLoading, groupedBookmarks], () => {
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedBookmarks.value.length > 0) {
    setSubheader({
      default: () => h(ViewTabs, {
        tabs: categories.value.map((cat) => ({ id: cat, label: cat })),
        activeTab: selectedCategory.value || '',
        'onUpdate:activeTab': (tab: string) => { selectedCategory.value = tab }
      }),
      right: () => h(SubheaderButton, { title: 'Refresh bookmarks', onClick: refreshBookmarks }, {
        default: () => h(RefreshCw, { size: 16 })
      })
    })
  } else if (setSubheader) {
    setSubheader(null)
  }
})
</script>

<template>
  <div class="bookmarks-view">
    <div v-if="errorMessage" class="error-container">
      <Bookmark :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ errorMessage }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <div v-else-if="isLoading" class="loading-container">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading bookmarks"
      />
    </div>

    <template v-else>
      <div v-if="groupedBookmarks.length === 0" class="bookmarks-content">
        <div class="empty-state">
          <Bookmark :size="64" class="empty-icon" />
          <h2>No Bookmarks</h2>
          <p>
            No bookmarks found. Please add items to your Bookmarks collection with title, URL, and
            Category fields.
          </p>
        </div>
      </div>

      <template v-else>
        <div class="bookmarks-content">
          <div class="bookmarks-tabs-container">
            <div v-if="selectedCategory" class="bookmarks-tab-content">
              <!-- Search and Filters -->
              <div class="bookmarks-filters">
                <div class="search-container">
                  <Search :size="18" class="search-icon" />
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search bookmarks..."
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
                </div>

                <div v-if="allTags.length > 0" class="tags-filter">
                  <div class="tags-filter-header">
                    <span class="tags-filter-label">Filter by tags:</span>
                    <button
                      v-if="selectedTags.size > 0"
                      @click="clearFilters"
                      class="clear-filters-button"
                    >
                      Clear filters
                    </button>
                  </div>
                  <div class="tags-list">
                    <button
                      v-for="tag in allTags"
                      :key="tag"
                      @click="toggleTag(tag)"
                      :class="['tag-filter-button', { active: selectedTags.has(tag) }]"
                    >
                      {{ tag }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Results count -->
              <div v-if="searchQuery || selectedTags.size > 0" class="results-info">
                <span>
                  Showing {{ selectedCategoryItems.length }} bookmark{{
                    selectedCategoryItems.length !== 1 ? 's' : ''
                  }}
                </span>
              </div>

              <div v-if="selectedCategoryItems.length === 0" class="no-results">
                <p>No bookmarks found matching your filters.</p>
              </div>

              <div v-else class="bookmarks-grid">
                <a
                  v-for="bookmark in selectedCategoryItems"
                  :key="bookmark.id"
                  :href="bookmark.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="bookmark-card"
                >
                  <div class="bookmark-favicon">
                    <img
                      :src="getFaviconUrl(bookmark.url)"
                      :alt="getDomain(bookmark.url)"
                      @error="
                        (e) => {
                          e.target.style.display = 'none'
                        }
                      "
                    />
                  </div>
                  <div class="bookmark-content">
                    <h3 class="bookmark-title">{{ bookmark.title || getDomain(bookmark.url) }}</h3>
                    <p class="bookmark-url">{{ getDomain(bookmark.url) }}</p>
                    <div v-if="bookmark.tags && bookmark.tags.length > 0" class="bookmark-tags">
                      <span v-for="tag in bookmark.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                  </div>
                  <ExternalLink :size="16" class="bookmark-external-icon" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bookmarks-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow-y: auto;
}

.bookmarks-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px;
}

.bookmarks-content:has(.bookmarks-tabs-container) {
  padding: 8px 16px;
}

.error-container,
.loading-container,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

.error-icon,
.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.error-container h2,
.empty-state h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.error-container p,
.empty-state p {
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

.bookmarks-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.bookmarks-tabs-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
}

.bookmarks-tab-content {
  flex: 1;
  padding-top: 0;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bookmarks-filters {
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
  right: 8px;
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

.tags-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tags-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tags-filter-label {
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
  border-color: var(--border-secondary);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-filter-button {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tag-filter-button:hover {
  background: var(--bg-secondary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.tag-filter-button.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: white;
}

.tag-filter-button.active:hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}

.results-info {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 0;
}

.no-results {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.no-results p {
  margin: 0;
  font-size: 14px;
}

.bookmarks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.bookmark-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
  position: relative;
}

.bookmark-card:hover {
  border-color: var(--border-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.bookmark-favicon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.bookmark-favicon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
}

.bookmark-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bookmark-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.bookmark-url {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tag {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.bookmark-external-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.bookmark-card:hover .bookmark-external-icon {
  opacity: 1;
}

@media (max-width: 768px) {
  .bookmarks-view {
    padding: 16px;
  }

  .bookmarks-header h1 {
    font-size: 24px;
  }

  .bookmarks-grid {
    grid-template-columns: 1fr;
  }
}
</style>
