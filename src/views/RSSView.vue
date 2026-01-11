<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch, inject, h } from 'vue'
import { Rss, RefreshCw, ExternalLink } from 'lucide-vue-next'
import {
  getApiUrl,
  getCraftLinkPreference,
  buildCraftAppLink,
  buildCraftWebLink,
  getSpaceId,
  getShareToken,
} from '../utils/craftApi'
import { type RSSFeed } from '../utils/rssParser'
import { getFaviconUrl } from '../utils/favicon'
import { useRoute, useRouter } from 'vue-router'
import ViewSubheader from '../components/ViewSubheader.vue'
import ViewTabs from '../components/ViewTabs.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'
import { useRSSApiStore, type RSSCollectionItem } from '../stores/rssApi'

const route = useRoute()
const router = useRouter()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

const rssApiStore = useRSSApiStore()

// API Configuration
const apiBaseUrl = ref('')
const selectedDocumentId = ref<string | null>(null)
const rssCollectionId = ref<string | null>(null)
const selectedCategory = ref<string | null>(null)

// UI State
const errorMessage = ref('')

// Store computed properties
const rssItems = computed(() => rssApiStore.rssItems)
const rssFeeds = computed(() => rssApiStore.rssFeeds)
const loadingFeeds = computed(() => rssApiStore.loadingFeeds)
const isLoading = computed(() => rssApiStore.isLoading)
const totalApiCalls = computed(() => rssApiStore.totalApiCalls)
const completedApiCalls = computed(() => rssApiStore.completedApiCalls)

// Grouped RSS items by category
const groupedItems = computed(() => {
  const groups = new Map<string, RSSCollectionItem[]>()

  rssItems.value.forEach((item) => {
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
  return groupedItems.value.map(([category]) => category)
})

// Get items for selected category
const selectedCategoryItems = computed(() => {
  // If no category selected (All), return all items
  if (!selectedCategory.value || selectedCategory.value === '') {
    return rssItems.value
  }
  const found = groupedItems.value.find(([category]) => category === selectedCategory.value)
  return found ? found[1] : []
})

// Set initial selected category
const initializeSelectedCategory = () => {
  // Check if there's a category in the URL query
  const categoryFromUrl = route.query.category as string | undefined

  if (categoryFromUrl !== undefined) {
    // If category is empty string or 'all', show All
    if (categoryFromUrl === '' || categoryFromUrl.toLowerCase() === 'all') {
      selectedCategory.value = null
    } else if (categories.value.includes(categoryFromUrl)) {
      selectedCategory.value = categoryFromUrl
    } else {
      // Invalid category, default to All
      selectedCategory.value = null
    }
  } else {
    // No URL parameter, start with "All" (null) by default
    selectedCategory.value = null
  }
}

// Helper to get feed items safely
const getFeedItems = (itemId: string) => {
  const feed = rssFeeds.value[itemId]
  return feed?.items || []
}

// Helper to get display title - prefer RSS feed title, fallback to collection item title
const getDisplayTitle = (item: RSSCollectionItem) => {
  const feed = rssFeeds.value[item.id]
  if (feed && feed.title && feed.title.trim()) {
    return feed.title
  }
  // Use collection item title, but replace "Untitled" with empty string
  const title = item.title || ''
  if (title.trim().toLowerCase() === 'untitled') {
    return ''
  }
  return title
}

const loadApiUrl = () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    console.warn('RSSView: No API URL configured')
    errorMessage.value = 'Craft API URL not configured. Please configure it in Settings.'
    return
  }

  discoverCollection()
}

const discoverCollection = () => {
  // Load collection ID from settings
  const rssId = localStorage.getItem('collection-id-rss')

  if (!rssId) {
    errorMessage.value =
      'RSS collection ID not configured. Please configure it in Settings > API > Collection IDs.'
    return
  }

  rssCollectionId.value = rssId
  initializeRSSData(false)
}

const initializeRSSData = async (forceRefresh = false) => {
  if (!rssCollectionId.value) {
    return
  }

  errorMessage.value = ''
  await rssApiStore.initializeRSS(rssCollectionId.value, forceRefresh)
}

const refreshFeeds = async () => {
  if (!rssCollectionId.value) return
  await rssApiStore.refreshRSS(rssCollectionId.value)
}

const openCollectionInCraft = () => {
  if (!rssCollectionId.value) return
  const preference = getCraftLinkPreference()
  const spaceId = getSpaceId()
  if (!spaceId) return

  if (preference === 'web') {
    const webLink = buildCraftWebLink(rssCollectionId.value, spaceId, getShareToken())
    if (webLink) {
      window.open(webLink, '_blank')
    }
  } else {
    const appLink = buildCraftAppLink(rssCollectionId.value, spaceId)
    if (appLink) {
      window.location.href = appLink
    }
  }
}

const formatDate = (dateString?: string) => {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateString
  }
}

// Watch for selectedCategory changes to update URL
watch(selectedCategory, (newCategory) => {
  // Update URL query parameter
  const currentCategory = route.query.category
  const newCategoryParam = newCategory || ''

  if (currentCategory !== newCategoryParam) {
    router.replace({
      query: { ...route.query, category: newCategoryParam || undefined },
    })
  }
})

// Watch for groupedItems changes to initialize selected category
watch(
  groupedItems,
  () => {
    initializeSelectedCategory()
  },
  { immediate: true },
)

onMounted(() => {
  loadApiUrl()
  initializeSelectedCategory()
  if (registerRefresh) {
    registerRefresh(String(route.name), refreshFeeds)
  }

  // Register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedItems.value.length > 0) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: [
            { id: '', label: 'All' },
            ...categories.value.map((cat) => ({ id: cat, label: cat })),
          ],
          activeTab: selectedCategory.value || '',
          'onUpdate:activeTab': (tab: string) => {
            selectedCategory.value = tab || null
          },
        }),
      right: () => [
        h(
          SubheaderButton,
          { title: 'Open RSS Collection in Craft', onClick: openCollectionInCraft },
          {
            default: () => h(ExternalLink, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          { title: 'Refresh RSS feeds', onClick: refreshFeeds },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

onUnmounted(() => {
  if (setSubheader) {
    setSubheader(null)
  }
})

onActivated(() => {
  loadApiUrl()
  initializeSelectedCategory()
  // Re-register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedItems.value.length > 0) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: [
            { id: '', label: 'All' },
            ...categories.value.map((cat) => ({ id: cat, label: cat })),
          ],
          activeTab: selectedCategory.value || '',
          'onUpdate:activeTab': (tab: string) => {
            selectedCategory.value = tab || null
          },
        }),
      right: () => [
        h(
          SubheaderButton,
          { title: 'Open RSS Collection in Craft', onClick: openCollectionInCraft },
          {
            default: () => h(ExternalLink, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          { title: 'Refresh RSS feeds', onClick: refreshFeeds },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

// Watch for changes to update subheader
watch([categories, selectedCategory, errorMessage, isLoading, groupedItems], () => {
  if (setSubheader && !errorMessage.value && !isLoading.value && groupedItems.value.length > 0) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: [
            { id: '', label: 'All' },
            ...categories.value.map((cat) => ({ id: cat, label: cat })),
          ],
          activeTab: selectedCategory.value || '',
          'onUpdate:activeTab': (tab: string) => {
            selectedCategory.value = tab || null
          },
        }),
      right: () => [
        h(
          SubheaderButton,
          { title: 'Open RSS Collection in Craft', onClick: openCollectionInCraft },
          {
            default: () => h(ExternalLink, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          { title: 'Refresh RSS feeds', onClick: refreshFeeds },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  } else if (setSubheader) {
    setSubheader(null)
  }
})
</script>

<template>
  <div class="rss-view">
    <div v-if="errorMessage" class="error-container">
      <Rss :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ errorMessage }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <div v-else-if="isLoading" class="loading-container">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading RSS feeds"
      />
    </div>

    <template v-else>
      <div v-if="groupedItems.length === 0" class="rss-content">
        <div class="empty-state">
          <Rss :size="64" class="empty-icon" />
          <h2>No RSS Feeds</h2>
          <p>
            No RSS feeds found. Please add items to your RSS collection with title, URL, and
            Category fields.
          </p>
        </div>
      </div>

      <template v-else>
        <div class="rss-content">
          <div class="rss-tabs-container">
            <div v-if="categories.length > 0" class="rss-tab-content">
              <div class="rss-feeds">
                <div v-for="item in selectedCategoryItems" :key="item.id" class="rss-feed-card">
                  <div class="feed-header">
                    <div class="feed-header-left">
                      <div class="feed-favicon">
                        <img
                          :src="getFaviconUrl(item.url)"
                          :alt="getDisplayTitle(item)"
                          @error="
                            (e) => {
                              e.target.style.display = 'none'
                            }
                          "
                        />
                      </div>
                      <h3 class="feed-title">{{ getDisplayTitle(item) }}</h3>
                    </div>
                    <div class="feed-header-actions">
                      <button
                        @click="rssApiStore.fetchFeedForItem(item, true)"
                        class="feed-refresh-button"
                        :disabled="loadingFeeds.has(item.id)"
                        title="Refresh feed"
                      >
                        <RefreshCw :size="14" :class="{ spinning: loadingFeeds.has(item.id) }" />
                      </button>
                      <a
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="feed-link"
                        title="Open RSS feed"
                      >
                        <ExternalLink :size="16" />
                      </a>
                    </div>
                  </div>

                  <div v-if="item.tags && item.tags.length > 0" class="feed-tags">
                    <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
                  </div>

                  <div v-if="loadingFeeds.has(item.id)" class="feed-loading">
                    <div class="mini-spinner"></div>
                    <span>Loading feed...</span>
                  </div>

                  <div v-else-if="rssFeeds[item.id]" class="feed-items">
                    <template v-if="getFeedItems(item.id).length > 0">
                      <a
                        v-for="feedItem in getFeedItems(item.id).slice(0, 5)"
                        :key="feedItem.guid || feedItem.link || feedItem.title"
                        :href="feedItem.link"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="feed-item-link"
                      >
                        <div class="feed-item">
                          <div class="feed-item-header">
                            <div class="feed-item-title">{{ feedItem.title }}</div>
                          </div>
                          <div v-if="feedItem.description" class="feed-item-description">
                            {{ feedItem.description.replace(/<[^>]*>/g, '').substring(0, 150) }}...
                          </div>
                          <div class="feed-item-meta">
                            <span v-if="feedItem.pubDate" class="feed-item-date">
                              {{ formatDate(feedItem.pubDate) }}
                            </span>
                            <span v-if="feedItem.author" class="feed-item-author">
                              {{ feedItem.author }}
                            </span>
                          </div>
                        </div>
                      </a>
                    </template>
                    <div v-else class="feed-empty">
                      <span>Feed loaded but contains no items</span>
                    </div>
                  </div>

                  <div v-else class="feed-error">
                    <span>Failed to load feed</span>
                    <button @click="rssApiStore.fetchFeedForItem(item, true)" class="retry-button">
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.rss-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow-y: auto;
}

.rss-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px;
}

.rss-content:has(.rss-tabs-container) {
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

.mini-spinner {
  width: 16px;
  height: 16px;
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

.rss-tabs-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
}

.rss-tab-content {
  flex: 1;
  padding-top: 0;
  overflow-y: auto;
  min-height: 0;
}

.rss-feeds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.rss-feed-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.rss-feed-card:hover {
  border-color: var(--border-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.feed-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.feed-favicon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.feed-favicon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
}

.feed-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.feed-refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.feed-refresh-button:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.feed-refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feed-refresh-button .spinning {
  animation: spin 0.8s linear infinite;
}

.feed-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}

.feed-link {
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color 0.2s ease;
  flex-shrink: 0;
}

.feed-link:hover {
  color: var(--btn-primary-bg);
}

.feed-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.feed-loading,
.feed-error,
.feed-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.feed-error {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.retry-button {
  padding: 6px 12px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.retry-button:hover {
  background: var(--btn-primary-hover);
}

.feed-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feed-item-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.feed-item {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--btn-primary-bg);
  border-radius: 6px;
  transition: all 0.2s ease;
}

a.feed-item-link:visited .feed-item,
.feed-item-link:visited .feed-item,
.feed-item-link:visited .feed-item,
[data-theme='light'] a.feed-item-link:visited .feed-item,
[data-theme='light'] .feed-item-link:visited .feed-item {
  border: none !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;
  outline: none !important;
  box-shadow: none !important;
  opacity: 0.8;
}

.feed-item-link:not(:visited) .feed-item:hover {
  border-color: var(--btn-primary-bg);
  background: var(--bg-secondary);
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
}

.feed-item-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.feed-item-link:visited .feed-item-title {
  color: var(--text-tertiary);
  opacity: 0.7;
}

.feed-item-link:visited .feed-item-description {
  opacity: 0.6;
}

.feed-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  transition: color 0.2s ease;
  flex: 1;
}

.feed-item-description {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.feed-item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.feed-item-date,
.feed-item-author {
  display: flex;
  align-items: center;
}

@media (max-width: 768px) {
  .rss-view {
    padding: 16px;
  }

  .rss-header h1 {
    font-size: 24px;
  }

  .rss-feeds {
    grid-template-columns: 1fr;
  }

  .category-title {
    font-size: 18px;
  }
}
</style>
