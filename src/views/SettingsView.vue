<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch, inject, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Trash2, Settings, Database, Link, Plus, X, Info } from 'lucide-vue-next'
import ViewTabs from '../components/ViewTabs.vue'
import { Check, RefreshCw } from 'lucide-vue-next'
import {
  getCacheExpiryMinutes,
  setCacheExpiryMinutes,
  listCollections,
  type Collection,
} from '../utils/craftApi'
import { changelog } from '../utils/changelog'

const apiUrl = ref('')
const apiKey = ref('')
const spaceId = ref('')
const craftLinkPreference = ref<'app' | 'web'>('app')
const dashboardTitle = ref('Craftboard')
const showFlashcardsTab = ref(true)
const showMusicTab = ref(true)
const showGraphTab = ref(true)
const showBookmarksTab = ref(true)
const showRSSTab = ref(true)
const showTasksTab = ref(true)
const cacheExpiryMinutes = ref(60)
const calendarUrls = ref<string[]>([''])
const storageSize = ref(0)
const collections = ref<Collection[]>([])
const isLoadingCollections = ref(false)
const collectionsError = ref<string | null>(null)

// Export/Import state
const importFileInput = ref<HTMLInputElement | null>(null)

// Required collections for the app
const requiredCollections = [
  { key: 'decks', label: 'Craftboard Decks', name: 'Craftboard Decks' },
  { key: 'flashcards', label: 'Craftboard Flashcards', name: 'Craftboard Flashcards' },
  { key: 'playlists', label: 'Craftboard Playlists', name: 'Craftboard Playlists' },
  { key: 'artists', label: 'Craftboard Artists', name: 'Craftboard Artists' },
  { key: 'genres', label: 'Craftboard Genres', name: 'Craftboard Genres' },
  { key: 'bookmarks', label: 'Craftboard Bookmarks', name: 'Craftboard Bookmarks' },
  { key: 'rss', label: 'Craftboard RSS', name: 'Craftboard RSS' },
  { key: 'quotes', label: 'Craftboard Quotes', name: 'Craftboard Quotes' },
]

// Collection IDs stored in settings
const collectionIds = ref<Record<string, string>>({})

// Calculate localStorage size in bytes
const calculateStorageSize = () => {
  let total = 0
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += key.length + (localStorage.getItem(key)?.length || 0)
    }
  }
  storageSize.value = total
  return total
}

// Format bytes to human readable
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const storageSizeFormatted = computed(() => formatBytes(storageSize.value))

// Router setup
const route = useRoute()
const router = useRouter()
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

// Tab management
const activeTab = ref('general')
const tabs = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'api', label: 'API', icon: Link },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'changelog', label: 'Changelog', icon: Info },
]

// Update URL when active tab changes
watch(activeTab, (newTab) => {
  router.replace({
    query: { ...route.query, tab: newTab },
  })
})

// Estimate max localStorage size (usually 5-10MB, we'll assume 5MB)
const maxStorageSize = 5 * 1024 * 1024 // 5MB
const storagePercentage = computed(() => Math.round((storageSize.value / maxStorageSize) * 100))

const autodiscoverCollections = async () => {
  if (!apiUrl.value) {
    collectionsError.value = 'Please configure API URL first'
    return
  }

  isLoadingCollections.value = true
  collectionsError.value = null

  try {
    const allCollections = await listCollections()
    let discoveredCount = 0
    let updatedCount = 0

    // Search for each required collection by exact name
    requiredCollections.forEach((required) => {
      const found = allCollections.find(
        (col) => col.name.toLowerCase() === required.name.toLowerCase(),
      )
      if (found) {
        const previousId = collectionIds.value[required.key]
        collectionIds.value[required.key] = found.id
        if (!previousId) {
          discoveredCount++ // New discovery
        } else if (previousId !== found.id) {
          updatedCount++ // ID changed
        }
      }
    })

    // Check if we have all required collections
    const hasAllIds = requiredCollections.every((col) => collectionIds.value[col.key]?.trim())

    if (!hasAllIds && discoveredCount === 0 && updatedCount === 0) {
      // Only show error if we don't have all IDs and found nothing new
      const missingCollections = requiredCollections
        .filter((col) => !collectionIds.value[col.key]?.trim())
        .map((col) => col.label)
        .join(', ')
      collectionsError.value = `Missing collections: ${missingCollections}. Make sure your collections are named exactly as required.`
    } else {
      // Clear any previous error
      collectionsError.value = null

      // Save discovered IDs to localStorage immediately
      requiredCollections.forEach((required) => {
        const id = collectionIds.value[required.key]
        if (id) {
          localStorage.setItem(`collection-id-${required.key}`, id)
        } else {
          localStorage.removeItem(`collection-id-${required.key}`)
        }
      })
      collections.value = allCollections

      // Automatically save all settings after successful autodiscovery
      // This ensures collection IDs are persisted along with other settings
      // Pass skipAutodiscovery=true to avoid infinite loop
      await saveSettings(true)
    }
  } catch (err) {
    collectionsError.value =
      err instanceof Error ? err.message : 'Failed to autodiscover collections'
    console.error('Error autodiscovering collections:', err)
  } finally {
    isLoadingCollections.value = false
  }
}

onMounted(() => {
  // Load active tab from URL query parameter
  const tabFromUrl = route.query.tab as string
  // Handle migration from 'about' to 'changelog'
  if (tabFromUrl === 'about') {
    router.replace({ query: { ...route.query, tab: 'changelog' } })
    activeTab.value = 'changelog'
  } else if (tabFromUrl && tabs.some((tab) => tab.id === tabFromUrl)) {
    activeTab.value = tabFromUrl
  }

  calculateStorageSize()

  // Register subheader
  if (setSubheader) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: tabs,
          activeTab: activeTab.value,
          'onUpdate:activeTab': (tab: string) => {
            activeTab.value = tab
          },
        }),
      right: () =>
        h(
          'button',
          {
            class: 'save-button-subheader',
            onClick: () => saveSettings(),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)',
              whiteSpace: 'nowrap',
            },
          },
          [h(Check, { size: 16 }), h('span', 'Save Settings')],
        ),
    })
  }
})

onActivated(() => {
  // Re-register subheader when activated (for keep-alive)
  if (setSubheader) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: tabs,
          activeTab: activeTab.value,
          'onUpdate:activeTab': (tab: string) => {
            activeTab.value = tab
          },
        }),
      right: () =>
        h(
          'button',
          {
            class: 'save-button-subheader',
            onClick: () => saveSettings(),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)',
              whiteSpace: 'nowrap',
            },
          },
          [h(Check, { size: 16 }), h('span', 'Save Settings')],
        ),
    })
  }
})

onUnmounted(() => {
  if (setSubheader) {
    setSubheader(null)
  }
})

// Watch activeTab to update subheader
watch(activeTab, () => {
  if (setSubheader) {
    setSubheader({
      default: () =>
        h(ViewTabs, {
          tabs: tabs,
          activeTab: activeTab.value,
          'onUpdate:activeTab': (tab: string) => {
            activeTab.value = tab
          },
        }),
      right: () =>
        h(
          'button',
          {
            class: 'save-button-subheader',
            onClick: () => saveSettings(),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)',
              whiteSpace: 'nowrap',
            },
          },
          [h(Check, { size: 16 }), h('span', 'Save Settings')],
        ),
    })
  }
})

// Calendar URL management
function addCalendarUrl() {
  calendarUrls.value.push('')
}

function removeCalendarUrl(index: number) {
  if (calendarUrls.value.length > 1) {
    calendarUrls.value.splice(index, 1)
  }
}

const clearLocalStorage = () => {
  if (
    confirm(
      'Are you sure you want to clear all local data? This will remove all widgets, settings, and cached data. This action cannot be undone.',
    )
  ) {
    localStorage.clear()
    storageSize.value = 0
    apiUrl.value = ''
    apiKey.value = ''
    spaceId.value = ''
    alert('Local storage cleared! The page will reload.')
    window.location.reload()
  }
}

const saveSettings = async (skipAutodiscovery = false) => {
  localStorage.setItem('craft-api-url', apiUrl.value)
  localStorage.setItem('craft-api-key', apiKey.value || '')
  localStorage.setItem('craft-api-token', apiKey.value || '') // Also save as token for craftApi

  // Save collection IDs
  requiredCollections.forEach((col) => {
    const id = collectionIds.value[col.key]?.trim()
    if (id) {
      localStorage.setItem(`collection-id-${col.key}`, id)
    } else {
      localStorage.removeItem(`collection-id-${col.key}`)
    }
  })

  localStorage.setItem('craft-link-preference', craftLinkPreference.value)
  localStorage.setItem('dashboard-title', dashboardTitle.value)
  localStorage.setItem('show-flashcards-tab', String(showFlashcardsTab.value))
  localStorage.setItem('show-music-tab', String(showMusicTab.value))
  localStorage.setItem('show-graph-tab', String(showGraphTab.value))
  localStorage.setItem('show-bookmarks-tab', String(showBookmarksTab.value))
  localStorage.setItem('show-rss-tab', String(showRSSTab.value))
  localStorage.setItem('show-tasks-tab', String(showTasksTab.value))
  // Save calendar URLs (filter out empty strings)
  const validUrls = calendarUrls.value.filter((url) => url.trim() !== '')
  localStorage.setItem('calendar-urls', JSON.stringify(validUrls))
  setCacheExpiryMinutes(cacheExpiryMinutes.value)

  // Track if spaceId was previously configured
  const hadSpaceId = !!localStorage.getItem('craft-space-id')

  // If spaceId is provided, save it; otherwise try to fetch it
  if (spaceId.value) {
    localStorage.setItem('craft-space-id', spaceId.value)
  } else if (apiUrl.value) {
    // Try to automatically fetch spaceId from API
    try {
      const { fetchAndCacheSpaceId } = await import('../utils/craftApi')
      const fetchedSpaceId = await fetchAndCacheSpaceId()
      if (fetchedSpaceId) {
        spaceId.value = fetchedSpaceId
      }
    } catch (e) {
      console.error('Failed to fetch spaceId:', e)
    }
  }

  // Auto-trigger autodiscovery only if space ID was not previously configured
  // This ensures it only runs the first time, not on every save
  if (apiUrl.value && !skipAutodiscovery && !hadSpaceId) {
    const hasAllIds = requiredCollections.every((col) => collectionIds.value[col.key]?.trim())
    if (!hasAllIds) {
      try {
        await autodiscoverCollections()
      } catch (e) {
        console.error('Failed to autodiscover collections:', e)
      }
    }
  }

  calculateStorageSize()

  // Dispatch events to update UI in App.vue
  window.dispatchEvent(new Event('dashboard-title-updated'))
  window.dispatchEvent(new Event('nav-tabs-updated'))

  alert('Settings saved!')
}

// Load settings on mount
apiUrl.value = localStorage.getItem('craft-api-url') || ''
apiKey.value = localStorage.getItem('craft-api-key') || ''
spaceId.value = localStorage.getItem('craft-space-id') || ''
const savedPreference = localStorage.getItem('craft-link-preference')
dashboardTitle.value = localStorage.getItem('dashboard-title') || 'Craftboard'
craftLinkPreference.value = (savedPreference === 'web' ? 'web' : 'app') as 'app' | 'web'
const savedShowFlashcards = localStorage.getItem('show-flashcards-tab')
showFlashcardsTab.value = savedShowFlashcards === null ? true : savedShowFlashcards === 'true'
const savedShowMusic = localStorage.getItem('show-music-tab')
showMusicTab.value = savedShowMusic === null ? true : savedShowMusic === 'true'
const savedShowGraph = localStorage.getItem('show-graph-tab')
showGraphTab.value = savedShowGraph === null ? true : savedShowGraph === 'true'
const savedShowBookmarks = localStorage.getItem('show-bookmarks-tab')
showBookmarksTab.value = savedShowBookmarks === null ? true : savedShowBookmarks === 'true'
const savedShowRSS = localStorage.getItem('show-rss-tab')
showRSSTab.value = savedShowRSS === null ? true : savedShowRSS === 'true'
const savedShowTasks = localStorage.getItem('show-tasks-tab')
showTasksTab.value = savedShowTasks === null ? true : savedShowTasks === 'true'

// Load collection IDs
requiredCollections.forEach((col) => {
  const storedId = localStorage.getItem(`collection-id-${col.key}`)
  collectionIds.value[col.key] = storedId || ''
})

// Load calendar URLs (support both old single URL format and new array format)
const savedCalendarUrls = localStorage.getItem('calendar-urls')
if (savedCalendarUrls) {
  try {
    calendarUrls.value = JSON.parse(savedCalendarUrls)
    // Ensure at least one empty field for adding new URLs
    if (calendarUrls.value.length === 0) {
      calendarUrls.value = ['']
    }
  } catch {
    calendarUrls.value = ['']
  }
} else {
  calendarUrls.value = ['']
}
cacheExpiryMinutes.value = getCacheExpiryMinutes()

// Export/Import functions
function getExportData() {
  const data: Record<string, any> = {}
  // Export all localStorage
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const val = localStorage.getItem(key)
      if (val !== null) data[key] = val
    }
  }
  return data
}

function exportData() {
  const data = getExportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const name = 'craftboard-export-' + date + '.json'
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

function triggerImportFile() {
  if (importFileInput.value) {
    importFileInput.value.value = ''
    importFileInput.value.click()
  }
}

function importDataFromFile(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || !input.files[0]) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = function (e) {
    try {
      if (!confirm('Importing will erase ALL current local data and reload the page. Continue?'))
        return
      localStorage.clear()
      const data = JSON.parse(e.target?.result as string)
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          localStorage.setItem(key, data[key])
        }
      }
      alert('Import successful! The page will now reload.')
      window.location.reload()
    } catch (err) {
      alert('Failed to import data: ' + (err instanceof Error ? err.message : err))
    }
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-container-wrapper">
      <div class="settings-container">
        <!-- General Tab -->
        <div v-if="activeTab === 'general'" class="settings-tab-content">
          <div class="settings-section">
            <h2>General Settings</h2>
            <p class="description">Basic dashboard configuration and preferences.</p>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  id="show-flashcards-tab"
                  v-model="showFlashcardsTab"
                  type="checkbox"
                  class="checkbox"
                />
                <span>Show Flashcards Tab</span>
              </label>
              <p class="field-hint">Toggle visibility of the Flashcards navigation tab.</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  id="show-music-tab"
                  v-model="showMusicTab"
                  type="checkbox"
                  class="checkbox"
                />
                <span>Show Music Tab</span>
              </label>
              <p class="field-hint">Toggle visibility of the Music navigation tab.</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  id="show-graph-tab"
                  v-model="showGraphTab"
                  type="checkbox"
                  class="checkbox"
                />
                <span>Show Graph Tab</span>
              </label>
              <p class="field-hint">Toggle visibility of the Graph navigation tab.</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input
                  id="show-bookmarks-tab"
                  v-model="showBookmarksTab"
                  type="checkbox"
                  class="checkbox"
                />
                <span>Show Bookmarks Tab</span>
              </label>
              <p class="field-hint">Toggle visibility of the Bookmarks navigation tab.</p>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input id="show-rss-tab" v-model="showRSSTab" type="checkbox" class="checkbox" />
                <span>Show RSS Tab</span>
              </label>
              <p class="field-hint">Toggle visibility of the RSS navigation tab.</p>
            </div>

            <div class="form-group">
              <label for="cache-expiry-minutes">Cache Expiry (minutes)</label>
              <input
                id="cache-expiry-minutes"
                v-model.number="cacheExpiryMinutes"
                type="number"
                min="0"
                max="10080"
                step="1"
                class="input"
              />
              <p class="field-hint">
                <strong>⚠️ Warning:</strong> Setting this to 0 disables caching. This may cause
                excessive API requests and could lead to rate limiting or API quota exhaustion.
                Default: 60 minutes. I suggest refreshing on demand.
              </p>
            </div>

            <div class="form-group">
              <label for="craft-link-preference">Open Craft Links In</label>
              <select id="craft-link-preference" v-model="craftLinkPreference" class="input">
                <option value="app">Craft App (Default)</option>
                <option value="web">Craft Web</option>
              </select>
              <p class="field-hint">
                Links to Craft documents will open in your preferred location. You can change this
                anytime.
              </p>
            </div>

            <div class="form-group">
              <label>Calendar URLs (iCal)</label>
              <div v-for="(url, index) in calendarUrls" :key="index" class="calendar-url-row">
                <input
                  :id="`calendar-url-${index}`"
                  v-model="calendarUrls[index]"
                  type="text"
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  class="input"
                />
                <button
                  v-if="calendarUrls.length > 1"
                  @click="removeCalendarUrl(index)"
                  class="remove-calendar-button"
                  type="button"
                  title="Remove calendar"
                >
                  <X :size="16" />
                </button>
              </div>
              <button
                @click="addCalendarUrl"
                class="add-calendar-button"
                type="button"
                title="Add another calendar"
              >
                <Plus :size="16" />
                <span>Add Calendar</span>
              </button>
              <p class="field-hint">
                Optional: iCal URLs to fetch calendar events and display them in the task week view.
                Supports Google Calendar, Outlook, Apple Calendar, and other iCal-compatible
                services. You can add multiple calendars.
              </p>
            </div>
          </div>
        </div>

        <!-- API Tab -->
        <div v-if="activeTab === 'api'" class="settings-tab-content">
          <div class="settings-section">
            <h2>Craft API Configuration</h2>
            <p class="description">
              Connect to your Craft API to access collections, documents, and tasks.
            </p>

            <div class="form-group">
              <label for="api-url">API URL</label>
              <input
                id="api-url"
                v-model="apiUrl"
                type="text"
                placeholder="https://connect.craft.do/links/YOUR_LINK/api/v1"
                class="input"
              />
              <p class="field-hint">Example: https://connect.craft.do/links/A26OKpJ3BOX/api/v1</p>
            </div>

            <div class="form-group">
              <label for="api-key">API Key (Bearer Token)</label>
              <input
                id="api-key"
                v-model="apiKey"
                type="password"
                placeholder="Enter your API key (optional)"
                class="input"
              />
              <p class="field-hint">Only needed if you set your API as private (recommended)</p>
            </div>

            <div class="form-group">
              <label for="space-id">Space ID (Optional)</label>
              <input
                id="space-id"
                v-model="spaceId"
                type="text"
                placeholder="Auto-detected from API"
                class="input"
              />
              <p class="field-hint">Usually auto-detected from API. Only set manually if needed.</p>
            </div>

            <div class="form-group-separator"></div>

            <div class="form-group">
              <label>Collection IDs</label>
              <p class="field-hint" style="margin-bottom: 12px">
                <strong>Getting started:</strong> Copy the
                <a
                  href="https://espazo.dende.gal/craftboard-template-collections"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="template-link"
                  >collections template</a
                >
                to your Craft space. This template contains all required collections preconfigured.
                Then use the Autodiscover button to automatically find and set their IDs.
              </p>
              <div class="collections-section">
                <div class="collections-header">
                  <p class="field-hint" style="margin: 0">
                    Configure collection IDs manually or use autodiscovery to find them
                    automatically by name.
                  </p>
                  <button
                    @click="autodiscoverCollections"
                    :disabled="isLoadingCollections || !apiUrl"
                    class="refresh-collections-btn"
                    title="Autodiscover collection IDs"
                  >
                    <RefreshCw :size="16" :class="{ spinning: isLoadingCollections }" />
                    Autodiscover
                  </button>
                </div>

                <div v-if="collectionsError" class="error-message">
                  {{ collectionsError }}
                </div>

                <div v-if="isLoadingCollections" class="loading-state">
                  <p>Autodiscovering collections...</p>
                </div>

                <div class="collections-config-list">
                  <div
                    v-for="required in requiredCollections"
                    :key="required.key"
                    class="collection-config-item"
                  >
                    <label :for="`collection-${required.key}`">{{ required.label }}</label>
                    <input
                      :id="`collection-${required.key}`"
                      v-model="collectionIds[required.key]"
                      type="text"
                      :placeholder="`Enter ${required.label} collection ID`"
                      class="input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Data Tab -->
        <div v-if="activeTab === 'data'" class="settings-tab-content">
          <div class="settings-section">
            <h2>Storage Management</h2>
            <p class="description">
              Manage your local storage data. This includes all widgets, settings, and cached API
              data.
            </p>

            <div class="storage-info">
              <div class="storage-stats">
                <div class="stat-item">
                  <span class="stat-label">Current Usage:</span>
                  <span class="stat-value">{{ storageSizeFormatted }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Estimated Limit:</span>
                  <span class="stat-value">{{ formatBytes(maxStorageSize) }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Usage:</span>
                  <span class="stat-value">{{ storagePercentage }}%</span>
                </div>
              </div>
              <div class="storage-bar">
                <div class="storage-bar-fill" :style="{ width: storagePercentage + '%' }"></div>
              </div>
            </div>

            <div class="form-group" style="margin-top: 24px">
              <label>Export/Import Data</label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap">
                <button @click="exportData" class="action-button">
                  <Database :size="16" />
                  Export All Data
                </button>
                <input
                  ref="importFileInput"
                  type="file"
                  accept="application/json"
                  style="display: none"
                  @change="importDataFromFile"
                />
                <button @click="triggerImportFile" class="action-button">
                  <Database :size="16" />
                  Import Data
                </button>
              </div>
              <p class="field-hint">
                <strong>Export:</strong> Download a complete backup of all your data (widgets,
                configuration, settings, and cache).<br />
                <strong>Import:</strong>
                <span style="color: #b91c1c"
                  >Warning: This will erase all current local data before importing.</span
                >
                The page will reload after a successful import.
              </p>
            </div>

            <button @click="clearLocalStorage" class="action-button danger-button">
              <Trash2 :size="18" />
              Clear All Local Data
            </button>
          </div>
        </div>

        <!-- Changelog Tab -->
        <div v-if="activeTab === 'changelog'" class="settings-tab-content">
          <div class="settings-section">
            <h2>Changelog</h2>

            <div class="form-group">
              <div class="changelog-container">
                <div v-for="(entry, index) in changelog" :key="index" class="changelog-entry">
                  <div class="changelog-header">
                    <span class="changelog-date">{{ entry.date }}</span>
                  </div>
                  <ul class="changelog-changes">
                    <li v-for="(change, changeIndex) in entry.changes" :key="changeIndex">
                      {{ change }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.settings-container-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-primary);
}

.settings-tab-content {
  flex: 1;
}

.settings-section {
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-primary);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

h2 {
  margin: 0 0 8px 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.description {
  margin: 0 0 18px 0;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.form-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-sizing: border-box;
  background: var(--input-bg);
  color: var(--input-text);
}

.input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input::placeholder {
  color: var(--text-muted);
}

.save-button-subheader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
  white-space: nowrap;
}

.save-button-subheader:hover {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.save-button-subheader:active {
  transform: translateY(0);
}

.field-hint {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  font-style: italic;
}

.field-hint a.template-link {
  color: var(--btn-primary-bg);
  text-decoration: none;
  font-weight: 600;
  font-style: normal;
  transition: color 0.2s ease;
}

.field-hint a.template-link:hover {
  color: var(--btn-primary-hover, var(--btn-primary-bg));
  text-decoration: underline;
}

.calendar-url-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.calendar-url-row .input {
  flex: 1;
}

.remove-calendar-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-calendar-button:hover {
  background: var(--bg-primary);
  border-color: #ef4444;
  color: #ef4444;
}

.add-calendar-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 4px;
}

.add-calendar-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
  color: var(--btn-primary-bg);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 0;
}

.checkbox-label span {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--btn-primary-bg);
}

.storage-info {
  margin: 16px 0;
  padding: 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.storage-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.storage-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  overflow: hidden;
}

.storage-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.danger-button {
  background: var(--btn-danger-bg) !important;
  color: white !important;
}

.danger-button:hover {
  background: var(--btn-danger-hover) !important;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  margin-top: 8px;
}

.version-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.version-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}

.collections-section {
  margin-top: 8px;
}

.collections-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.collections-header .field-hint {
  flex: 1;
  margin: 0;
}

.refresh-collections-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.refresh-collections-btn:hover:not(:disabled) {
  background: var(--bg-primary);
  border-color: var(--btn-primary-bg);
  color: var(--btn-primary-bg);
}

.refresh-collections-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-collections-btn .spinning {
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

.collections-config-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.collection-config-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.collection-config-item label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.loading-state,
.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  margin-top: 12px;
}

.form-group-separator {
  height: 1px;
  background: var(--border-primary);
  margin: 24px 0;
  border: none;
}

.error-message {
  padding: 12px;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
  font-size: 12px;
  margin-top: 12px;
}

.changelog-title {
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.changelog-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.changelog-entry {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.changelog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-primary);
}

.changelog-date {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.changelog-changes {
  margin: 0;
  padding-left: 20px;
  list-style-type: disc;
}

.changelog-changes li {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  line-height: 1.5;
}

.changelog-changes li:last-child {
  margin-bottom: 0;
}
</style>
