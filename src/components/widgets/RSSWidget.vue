<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Settings, ExternalLink, Search, Loader, RefreshCw, Rss } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { getApiUrl } from '../../utils/craftApi'
import { type RSSFeed } from '../../utils/rssParser'
import { getFaviconUrl, getDomain } from '../../utils/favicon'
import { useRSSApiStore } from '../../stores/rssApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const rssApiStore = useRSSApiStore()

// API Configuration
const apiBaseUrl = ref('')
const rssCollectionId = ref<string | null>(null)

// State
const isConfiguring = ref(!props.widget.data?.rssItemId)
const rssItems = computed(() => rssApiStore.rssItems)
const rssFeeds = computed(() => rssApiStore.rssFeeds)
const selectedRSSItem = ref<any | null>(null)
const rssFeed = ref<RSSFeed | null>(null)
const searchQuery = ref('')
const isLoading = computed(() => rssApiStore.isLoading)
const isLoadingFeed = ref(false)
const error = ref<string | null>(null)
const totalApiCalls = computed(() => rssApiStore.totalApiCalls)
const completedApiCalls = computed(() => rssApiStore.completedApiCalls)

const discoverCollection = async () => {
  if (!apiBaseUrl.value) return

  // Load collection ID from settings
  const rssId = localStorage.getItem('collection-id-rss')

  if (!rssId) {
    error.value =
      'RSS collection ID not configured. Please configure it in Settings > API > Collection IDs.'
    return
  }

  rssCollectionId.value = rssId
}

const fetchRSSItems = async () => {
  if (!apiBaseUrl.value || !rssCollectionId.value) {
    return
  }

  error.value = null

  try {
    await rssApiStore.initializeRSS(rssCollectionId.value, false)
    loadSelectedRSSItem()
  } catch (err) {
    console.error('Error fetching RSS items:', err)
    error.value = 'Failed to fetch RSS items'
  }
}

const loadSelectedRSSItem = async () => {
  const rssItemId = props.widget.data?.rssItemId
  if (rssItemId) {
    const item = rssItems.value.find((r) => r.id === rssItemId)
    if (item) {
      selectedRSSItem.value = item
      isConfiguring.value = false
      await fetchFeed(item)
    }
  }
}

const fetchFeed = async (item: any, forceRefresh = false) => {
  if (!item.url) return

  error.value = null

  // Check if feed is already loaded in store
  const cachedFeed = rssFeeds.value[item.id]
  if (!forceRefresh && cachedFeed) {
    rssFeed.value = cachedFeed
    const displayTitle = cachedFeed.title || item.title || getDomain(item.url)
    emit('update:title', displayTitle)
    return
  }

  isLoadingFeed.value = true

  try {
    await rssApiStore.fetchFeedForItem(item, forceRefresh)
    const feed = rssFeeds.value[item.id]
    if (feed) {
      rssFeed.value = feed
      const displayTitle = feed.title || item.title || getDomain(item.url)
      emit('update:title', displayTitle)
    } else {
      error.value = 'Failed to fetch RSS feed'
    }
  } catch (err) {
    console.error('Error fetching RSS feed:', err)
    error.value = 'Failed to fetch RSS feed'
  } finally {
    isLoadingFeed.value = false
  }
}

const filteredRSSItems = computed(() => {
  if (!searchQuery.value.trim()) {
    return rssItems.value
  }

  const query = searchQuery.value.toLowerCase().trim()
  return rssItems.value.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const url = item.url.toLowerCase()
    const domain = getDomain(item.url).toLowerCase()
    return title.includes(query) || url.includes(query) || domain.includes(query)
  })
})

const selectRSSItem = async (item: any) => {
  selectedRSSItem.value = item
  emit('update:data', {
    ...props.widget.data,
    rssItemId: item.id,
  })
  isConfiguring.value = false
  await fetchFeed(item)
}

const reconfigure = () => {
  isConfiguring.value = true
  selectedRSSItem.value = null
  rssFeed.value = null
}

const refreshFeed = async () => {
  if (selectedRSSItem.value) {
    await fetchFeed(selectedRSSItem.value, true)
  }
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  } catch {
    return dateString
  }
}

const initialize = async () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    error.value = 'Craft API URL not configured'
    return
  }

  await discoverCollection()
  if (rssCollectionId.value) {
    await fetchRSSItems()
  }
}

onMounted(() => {
  initialize()
})

watch(
  () => props.widget.data?.rssItemId,
  () => {
    loadSelectedRSSItem()
  },
)
</script>

<template>
  <div class="rss-widget">
    <!-- Configuration View -->
    <div v-if="isConfiguring" class="config-view">
      <div class="config-header">
        <h3>Select RSS Feed</h3>
        <p class="config-description">Search and select an RSS feed to display</p>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <div v-if="isLoading" class="loading-state">
        <ProgressIndicator
          :completed="completedApiCalls"
          :total="totalApiCalls"
          message="Loading RSS feeds"
        />
      </div>

      <div v-else-if="rssItems.length === 0" class="empty-state">
        <p>No RSS feeds found. Please configure RSS feeds in Settings.</p>
      </div>

      <div v-else class="search-container">
        <Search :size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search RSS feeds..."
          class="search-input"
        />
      </div>

      <div v-if="!isLoading && rssItems.length > 0" class="rss-list">
        <button
          v-for="item in filteredRSSItems"
          :key="item.id"
          @click="selectRSSItem(item)"
          class="rss-option"
        >
          <Rss :size="16" class="rss-icon" />
          <div class="rss-info">
            <div class="rss-title">{{ item.title || getDomain(item.url) }}</div>
            <div class="rss-url">{{ item.url }}</div>
            <div class="rss-category">{{ item.category }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Display View -->
    <div v-else-if="selectedRSSItem" class="display-view">
      <div v-if="isLoadingFeed" class="loading-state">
        <Loader :size="20" class="spinner" />
        <span>Loading feed...</span>
      </div>

      <div v-else-if="error" class="error-message">{{ error }}</div>

      <div v-else-if="rssFeed" class="feed-content">
        <div class="feed-header">
          <img
            :src="getFaviconUrl(selectedRSSItem.url)"
            :alt="getDomain(selectedRSSItem.url)"
            class="feed-favicon"
            @error="
              (e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }
            "
          />
          <div class="feed-title-container">
            <div class="feed-title">
              {{ rssFeed.title || selectedRSSItem.title || getDomain(selectedRSSItem.url) }}
            </div>
            <div class="feed-url">{{ getDomain(selectedRSSItem.url) }}</div>
          </div>
        </div>

        <div v-if="rssFeed.items.length === 0" class="empty-state">
          <p>No items in this feed</p>
        </div>

        <div v-else class="feed-items">
          <a
            v-for="feedItem in rssFeed.items.slice(0, 5)"
            :key="feedItem.guid || feedItem.link || feedItem.title"
            :href="feedItem.link"
            target="_blank"
            rel="noopener noreferrer"
            class="feed-item-link"
          >
            <div class="feed-item">
              <div class="feed-item-content">
                <div class="feed-item-title">{{ feedItem.title || 'Untitled' }}</div>
                <div v-if="feedItem.description" class="feed-item-description">
                  {{ feedItem.description.replace(/<[^>]*>/g, '').substring(0, 100) }}...
                </div>
                <div class="feed-item-meta">
                  <span v-if="feedItem.pubDate" class="feed-item-date">
                    {{ formatDate(feedItem.pubDate) }}
                  </span>
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>

      <div class="widget-footer">
        <button
          @click="refreshFeed"
          class="footer-button"
          title="Refresh"
          :disabled="isLoadingFeed"
        >
          <RefreshCw :size="16" :class="{ spinning: isLoadingFeed }" />
        </button>
        <button @click="reconfigure" class="footer-button" title="Change RSS feed">
          <Settings :size="16" />
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No RSS feed selected</p>
    </div>
  </div>
</template>

<style scoped>
.rss-widget {
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

.rss-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.rss-option {
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

.rss-option:hover {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
}

.rss-icon {
  color: var(--btn-primary-bg);
  flex-shrink: 0;
}

.rss-info {
  flex: 1;
  min-width: 0;
}

.rss-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rss-url {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rss-category {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}

.display-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  position: relative;
  padding-bottom: 38px;
  overflow: hidden;
}

.feed-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  align-items: center;
  padding-right: 8px;
}

.feed-content::-webkit-scrollbar {
  width: 8px;
}

.feed-content::-webkit-scrollbar-track {
  background: transparent;
  margin: 4px 0;
}

.feed-content::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.feed-content::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.feed-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-primary);
  width: 100%;
}

.feed-favicon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: white;
  border-radius: 6px;
  padding: 4px;
}

.feed-title-container {
  flex: 1;
  min-width: 0;
}

.feed-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-url {
  font-size: 11px;
  color: var(--text-tertiary);
}

.feed-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-item-link {
  text-decoration: none;
  color: inherit;
  display: block;
}

.feed-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--btn-primary-bg);
  border-radius: 6px;
  transition: all 0.2s ease;
}

a.feed-item-link:visited .feed-item,
.feed-item-link:visited .feed-item,
[data-theme='light'] a.feed-item-link:visited .feed-item,
[data-theme='light'] .feed-item-link:visited .feed-item {
  border: none !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;
  outline: none !important;
  box-shadow: none !important;
  opacity: 0.7;
}

.feed-item-link:visited .feed-item-title {
  color: var(--text-tertiary);
  opacity: 0.8;
}

.feed-item-link:visited .feed-item-description {
  opacity: 0.6;
}

.feed-item-link:not(:visited) .feed-item:hover {
  background: var(--bg-secondary);
  border-color: var(--btn-primary-bg);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
}

.feed-item-link:visited .feed-item:hover {
  background: var(--bg-secondary);
  border: none !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;
  outline: none !important;
  box-shadow: none !important;
  opacity: 0.8;
  transform: translateY(-1px);
}

.feed-item-content {
  flex: 1;
  min-width: 0;
}

.feed-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.feed-item-description {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.feed-item-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
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

:deep(.compact-view) .display-view {
  padding-bottom: 16px;
}

:deep(.compact-view) .widget-footer {
  display: none !important;
}
</style>
