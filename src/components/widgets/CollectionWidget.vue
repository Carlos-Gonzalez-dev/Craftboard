<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import {
  Settings,
  RefreshCw,
  Loader,
  ExternalLink,
  Library,
  Filter,
  Table,
  Grid3x3,
} from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { useCollectionsApiStore } from '../../stores/collectionsApi'
import {
  renderPropertyValue,
  fetchDocuments,
  type Collection,
  type CollectionSchema,
  type CollectionItem,
  type CraftDocument,
  getApiUrl,
  getSpaceId,
  fetchAndCacheSpaceId,
  openCraftLink,
} from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const collectionsApiStore = useCollectionsApiStore()

const collections = computed(() => collectionsApiStore.collections)
const selectedCollection = ref<Collection | null>(null)
const schema = ref<CollectionSchema | null>(null)
const items = ref<CollectionItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const isConfiguring = ref(false)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

const isConfigured = computed(() => !!props.widget.data?.collectionId)
const hasApiConfig = computed(() => !!getApiUrl())

// Widget view mode
const { isCompactView } = useWidgetView()

const lastUpdated = ref<number | null>(null)

const loadCollections = async () => {
  try {
    loading.value = true
    error.value = null
    await collectionsApiStore.initializeCollections()
  } catch (e: any) {
    error.value = e.message || 'Failed to load collections'
    console.error('Failed to load collections:', e)
  } finally {
    loading.value = false
  }
}

const selectCollection = async (collection: Collection) => {
  try {
    loading.value = true
    error.value = null

    // Save the collection selection with name and documentId for future loads
    emit('update:data', {
      collectionId: collection.id,
      collectionName: collection.name,
      documentId: collection.documentId,
    })
    emit('update:title', collection.name)

    selectedCollection.value = collection
    isConfiguring.value = false

    // Load the collection data
    await loadCollectionData(collection.id)
    // Load saved filter state for the new collection
    await nextTick()
    loadTableState()
  } catch (e: any) {
    error.value = e.message || 'Failed to select collection'
    console.error('Failed to select collection:', e)
  } finally {
    loading.value = false
  }
}

const loadCollectionData = async (collectionId: string, forceRefresh: boolean = false) => {
  try {
    error.value = null

    // Only set loading state if we need to fetch from API
    loading.value = true
    totalApiCalls.value = 1
    completedApiCalls.value = 0

    const collectionData = await collectionsApiStore.initializeCollection(
      collectionId,
      forceRefresh,
    )

    schema.value = collectionData.schema
    items.value = collectionData.items
    lastUpdated.value = Date.now()
    completedApiCalls.value++
  } catch (e: any) {
    error.value = e.message || 'Failed to load collection data'
    console.error('Failed to load collection data:', e)
  } finally {
    loading.value = false
  }
}

const refresh = async () => {
  if (props.widget.data?.collectionId) {
    // Force refresh bypasses cache
    await loadCollectionData(props.widget.data.collectionId, true)
  }
}

const reconfigure = () => {
  isConfiguring.value = true
  loadCollections()
}

const openCollectionInCraft = async () => {
  if (!props.widget.data?.collectionId) return

  const blockId = props.widget.data.collectionId
  // For collections, we can use the collection's documentId if available
  const documentId = selectedCollection.value?.documentId

  // Try to get clickableLink from the document
  let clickableLink: string | undefined
  if (documentId) {
    try {
      const result = await fetchDocuments({ fetchMetadata: true })
      const doc = result.items.find((d: CraftDocument) => d.id === documentId)
      if (doc?.clickableLink) {
        clickableLink = doc.clickableLink
      }
    } catch (e) {
      // If fetch fails, continue without clickableLink
      console.warn('Failed to fetch document metadata for clickableLink:', e)
    }
  }

  await openCraftLink(blockId, documentId, clickableLink)
}

const openItemInCraft = async (itemId: string) => {
  // For items, we only have the blockId, so we'll use that
  await openCraftLink(itemId)
}

onMounted(async () => {
  // Load view mode preference
  loadViewMode()

  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  if (isConfigured.value) {
    // Load the configured collection
    const collectionId = props.widget.data.collectionId
    const collectionName = props.widget.data.collectionName

    // Use stored collection name if available, otherwise try to fetch it
    if (collectionName) {
      selectedCollection.value = {
        id: collectionId,
        name: collectionName,
        itemCount: 0,
        documentId: props.widget.data.documentId || '',
      } as Collection
    } else {
      // Only fetch collections list if we don't have the name stored
      try {
        await collectionsApiStore.initializeCollections()
        const found = collectionsApiStore.collections.find((c: Collection) => c.id === collectionId)
        if (found) {
          selectedCollection.value = found
          // Store the collection name for future loads
          emit('update:data', {
            ...props.widget.data,
            collectionName: found.name,
            documentId: found.documentId,
          })
        }
      } catch (e) {
        // Continue even if we can't get the collection list
      }
    }

    await loadCollectionData(collectionId)
    // Load saved filter state after collection is set
    await nextTick()
    loadTableState()
  } else {
    // Show configuration
    isConfiguring.value = true
    await loadCollections()
  }
})

// --- Table filter/sort/search state ---
// Include widget ID to ensure filters are per-widget
const filterKey = computed(() => {
  const widgetId = props.widget.id || ''
  const collectionId = selectedCollection.value?.id || ''
  return `${widgetId}-${collectionId}`
})
const STORAGE_PREFIX = 'craft-collection-table-'

const searchText = ref('')
const columnFilters = ref<Record<string, string>>({})
const sortBy = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')

// Load persisted state
function loadTableState() {
  if (!filterKey.value) return
  const raw = localStorage.getItem(STORAGE_PREFIX + filterKey.value)
  if (!raw) return
  try {
    const state = JSON.parse(raw)
    searchText.value = state.searchText || ''
    columnFilters.value = state.columnFilters || {}
    sortBy.value = state.sortBy || ''
    sortDir.value = state.sortDir || 'asc'
  } catch (e) {
    console.error('Failed to load table state from localStorage:', e)
  }
}

// Save state
function saveTableState() {
  if (!filterKey.value) return
  try {
    localStorage.setItem(
      STORAGE_PREFIX + filterKey.value,
      JSON.stringify({
        searchText: searchText.value,
        columnFilters: columnFilters.value,
        sortBy: sortBy.value,
        sortDir: sortDir.value,
      }),
    )
  } catch (e) {
    console.error('Failed to save table state to localStorage:', e)
  }
}

// Watch for changes and save to localStorage
// Use deep watch for columnFilters to catch nested object changes
watch(searchText, saveTableState)
watch(columnFilters, saveTableState, { deep: true })
watch(sortBy, saveTableState)
watch(sortDir, saveTableState)

// Load state when filterKey changes (e.g., collection changes)
watch(
  filterKey,
  (newKey, oldKey) => {
    if (newKey && newKey !== oldKey) {
      loadTableState()
    }
  },
  { immediate: true },
)

// --- Filtering and sorting logic ---
const filterableTypes = ['tag', 'choices', 'relationship', 'select', 'multiselect']

const showFilters = ref(false)
const isFiltering = ref(false)

// View mode: 'table' or 'gallery'
const viewMode = ref<'table' | 'gallery'>('table')

// Load view mode from localStorage
const VIEW_MODE_STORAGE_KEY = `craft-collection-view-mode-${props.widget.id || ''}`
function loadViewMode() {
  const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  if (saved === 'table' || saved === 'gallery') {
    viewMode.value = saved
  }
}

// Save view mode to localStorage
watch(viewMode, (newMode) => {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode)
})

// Load view mode on mount (integrated into existing onMounted)

// Helper function to get first image from item content
function getItemImage(item: CollectionItem): string | null {
  if (!item.content || !Array.isArray(item.content)) return null
  const imageContent = item.content.find((c: any) => c.type === 'image')
  return imageContent?.url || null
}

const hasActiveFilters = computed(() => {
  if (searchText.value.trim()) return true
  for (const key in columnFilters.value) {
    if (columnFilters.value[key] && columnFilters.value[key] !== '__ALL__') return true
  }
  return false
})

// --- Filterable properties: only those with 'Existing options:' in description ---
function parseOptionsFromDescription(desc) {
  if (!desc) return []
  const match = desc.match(/Existing options:\s*([^\"]+\"[^\"]+\")+/i)
  if (!match) return []
  // Extract all quoted options
  return Array.from(desc.matchAll(/"([^"]+)"/g)).map((m) => m[1])
}

const filterableProps = computed(() =>
  (schema.value?.properties || []).filter((p) => {
    const type = (p.type || '').toLowerCase()
    // Include boolean fields
    if (type === 'boolean' || type === 'checkbox') {
      return true
    }
    // Include fields with existing options
    return (
      typeof p.description === 'string' &&
      /existing options:/i.test(p.description) &&
      (type === 'object' ||
        type === 'string' ||
        type === 'number' ||
        type.includes('select') ||
        type === 'tag' ||
        type === 'choices' ||
        type === 'relationship')
    )
  }),
)

const filterOptions = computed(() => {
  const opts = {}
  for (const prop of filterableProps.value) {
    const type = (prop.type || '').toLowerCase()
    // For boolean fields, provide true/false options
    if (type === 'boolean' || type === 'checkbox') {
      opts[prop.key] = ['true', 'false']
    } else {
      opts[prop.key] = parseOptionsFromDescription(prop.description)
    }
  }
  return opts
})

const uniqueOptions = (propKey) => {
  const values = new Set()
  for (const item of items.value) {
    const v = item.properties?.[propKey]
    if (Array.isArray(v)) v.forEach((val) => values.add(val))
    else if (v != null) values.add(v)
  }
  return Array.from(values).sort()
}

const filteredItems = computed(() => {
  let out = items.value
  // Text search
  if (searchText.value.trim()) {
    const q = searchText.value.trim().toLowerCase()
    out = out.filter((item) => {
      if (item.title?.toLowerCase().includes(q)) return true
      return (schema.value?.properties || []).some((prop) => {
        const val = item.properties?.[prop.key]
        if (val == null) return false
        if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(q))
        return String(val).toLowerCase().includes(q)
      })
    })
  }
  // Column filters (single select)
  for (const prop of filterableProps.value) {
    const filterVal = columnFilters.value[prop.key]
    if (filterVal && filterVal !== '__ALL__') {
      out = out.filter((item) => {
        const val = item.properties?.[prop.key]
        const type = (prop.type || '').toLowerCase()

        // Handle boolean fields
        if (type === 'boolean' || type === 'checkbox') {
          const boolVal = filterVal === 'true'
          if (val == null) return false // null/undefined values don't match
          if (Array.isArray(val)) {
            return val.some((v) => {
              // Handle various boolean representations
              const vBool =
                v === true || v === 'true' || v === 1 || String(v).toLowerCase() === 'true'
              return vBool === boolVal
            })
          }
          // Handle various boolean representations
          const valBool =
            val === true || val === 'true' || val === 1 || String(val).toLowerCase() === 'true'
          return valBool === boolVal
        }

        // Handle other types
        if (Array.isArray(val)) return val.includes(filterVal)
        return val === filterVal
      })
    }
  }
  // Sorting
  if (sortBy.value) {
    out = [...out].sort((a, b) => {
      let va = sortBy.value === 'title' ? a.title : a.properties?.[sortBy.value]
      let vb = sortBy.value === 'title' ? b.title : b.properties?.[sortBy.value]
      if (va == null) va = ''
      if (vb == null) vb = ''
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir.value === 'asc' ? va - vb : vb - va
      }
      return 0
    })
  }
  return out
})

function setSort(col) {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = col
    sortDir.value = 'asc'
  }
}

const clearTableFilters = () => {
  searchText.value = ''
  columnFilters.value = {}
  sortBy.value = ''
  sortDir.value = 'asc'
}

const applyFilters = () => {
  isFiltering.value = false
  saveTableState()
}

const cancelFilters = () => {
  // Optionally reset to saved state or keep current values
  loadTableState()
  isFiltering.value = false
}

const clearAllFilters = () => {
  searchText.value = ''
  columnFilters.value = {}
  sortBy.value = ''
  sortDir.value = 'asc'
  saveTableState()
}

// Helper function to check if a property is a URL field
const isUrlProperty = (prop: any): boolean => {
  if (!prop) return false
  const key = prop.key?.toLowerCase() || ''
  const title = prop.title?.toLowerCase() || ''
  const description = prop.description?.toLowerCase() || ''

  // Check if key, title, or description contains "url"
  return (
    key === 'url' ||
    title.includes('url') ||
    description.includes('url property') ||
    description.includes('url format')
  )
}

// Helper function to check if a property is an email field
const isEmailProperty = (prop: any): boolean => {
  if (!prop) return false
  const key = prop.key?.toLowerCase() || ''
  const title = prop.title?.toLowerCase() || ''
  const description = prop.description?.toLowerCase() || ''

  // Check if key, title, or description contains "email" or "e-mail"
  return (
    key === 'email' ||
    key === 'e-mail' ||
    title.includes('email') ||
    title.includes('e-mail') ||
    description.includes('email property') ||
    description.includes('email format')
  )
}

// Helper function to format URL (add protocol if missing)
const formatUrl = (url: string): string => {
  if (!url) return url
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

// Helper function to check if a string looks like an email
const isEmail = (value: string): boolean => {
  if (!value || typeof value !== 'string') return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value.trim())
}
</script>

<template>
  <div class="collection-widget">
    <!-- Configuration State -->
    <div v-if="isConfiguring" class="config-state">
      <h3>Select a collection</h3>
      <p class="config-description">Choose which collection you want to display in this widget</p>

      <div v-if="loading" class="loading-state">
        <ProgressIndicator
          :completed="completedApiCalls"
          :total="totalApiCalls"
          message="Loading collections"
        />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button v-if="!hasApiConfig" @click="$router?.push('/settings')" class="config-button">
          Go to Settings
        </button>
        <button v-else @click="loadCollections" class="retry-button">Retry</button>
      </div>

      <div v-else-if="collections.length === 0" class="empty-state">
        <p>No collections found</p>
        <p class="empty-hint">Create a collection in Craft to get started</p>
      </div>

      <div v-else class="collections-list">
        <button
          v-for="collection in [...collections].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          )"
          :key="collection.id"
          @click="selectCollection(collection)"
          class="collection-option"
        >
          <div class="collection-icon">
            <Library :size="18" />
          </div>
          <div class="collection-info">
            <h4>{{ collection.name }}</h4>
            <p>{{ collection.itemCount }} items</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Display State -->
    <div v-else class="display-state">
      <div v-if="loading" class="loading-state">
        <ProgressIndicator
          :completed="completedApiCalls"
          :total="totalApiCalls"
          message="Loading data"
        />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button @click="refresh" class="retry-button">Retry</button>
      </div>

      <div v-else-if="items.length === 0" class="empty-state">
        <p>No items in this collection</p>
      </div>

      <!-- Filter Form View - only show when not loading/error and has items -->
      <template v-if="!loading && !error && items.length > 0">
        <div v-if="isFiltering" class="filter-form-view">
        <div class="filter-form">
          <h3 class="filter-form-title">Filter Collection</h3>

          <!-- Search -->
          <div class="filter-form-group">
            <label class="filter-form-label">Search</label>
            <input
              v-model="searchText"
              class="filter-form-input"
              type="search"
              placeholder="Search items..."
              :aria-label="'Search ' + (selectedCollection?.name || 'collection')"
            />
          </div>

          <!-- Column Filters -->
          <div v-for="prop in filterableProps" :key="prop.key" class="filter-form-group">
            <label class="filter-form-label">{{ prop.name }}</label>
            <select
              v-model="columnFilters[prop.key]"
              class="filter-form-select"
              :aria-label="'Filter by ' + prop.name"
            >
              <option value="__ALL__">All {{ prop.name }}</option>
              <option v-for="opt in filterOptions[prop.key]" :key="opt" :value="opt">
                {{
                  (prop.type || '').toLowerCase() === 'boolean' ||
                  (prop.type || '').toLowerCase() === 'checkbox'
                    ? opt === 'true'
                      ? 'Yes'
                      : 'No'
                    : opt
                }}
              </option>
            </select>
          </div>

          <!-- Sort -->
          <div class="filter-form-group">
            <label class="filter-form-label">Sort By</label>
            <select v-model="sortBy" class="filter-form-select" aria-label="Sort by">
              <option value="">None</option>
              <option value="title">Title</option>
              <option v-for="prop in schema?.properties" :key="prop.key" :value="prop.key">
                {{ prop.name }}
              </option>
            </select>
          </div>

          <!-- Sort Direction -->
          <div v-if="sortBy" class="filter-form-group">
            <label class="filter-form-label">Sort Direction</label>
            <select v-model="sortDir" class="filter-form-select" aria-label="Sort direction">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <!-- Apply Button -->
          <div class="filter-form-actions">
            <button @click="applyFilters" class="filter-apply-button">Apply Filters</button>
            <button @click="clearAllFilters" class="filter-clear-button">Clear All</button>
            <button @click="cancelFilters" class="filter-cancel-button">Cancel</button>
          </div>
        </div>
      </div>

        <!-- Collection Table View -->
        <div v-else-if="viewMode === 'table'" class="collection-table-wrapper">
        <table class="collection-table">
          <thead>
            <tr>
              <th
                class="title-header"
                @click="setSort('title')"
                :class="{
                  sortable: true,
                  sorted: sortBy === 'title',
                  desc: sortDir === 'desc' && sortBy === 'title',
                }"
              >
                Title
                <span v-if="sortBy === 'title'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th
                v-for="prop in schema?.properties"
                :key="prop.key"
                @click="setSort(prop.key)"
                :class="{
                  sortable: true,
                  sorted: sortBy === prop.key,
                  desc: sortDir === 'desc' && sortBy === prop.key,
                }"
                :title="`${prop.description || prop.name}\nType: ${prop.type}`"
              >
                {{ prop.name }}
                <span v-if="sortBy === prop.key">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id" class="table-row">
              <td class="title-cell" :title="item.title" @click="openItemInCraft(item.id)">
                {{ item.title }}
              </td>
              <td
                v-for="prop in schema?.properties"
                :key="prop.key"
                class="property-cell"
                :title="`${prop.name}: ${renderPropertyValue(item.properties?.[prop.key], prop.type)}`"
              >
                <template v-if="isUrlProperty(prop) && item.properties?.[prop.key]">
                  <a
                    :href="formatUrl(item.properties[prop.key])"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="property-link"
                    @click.stop
                  >
                    {{ renderPropertyValue(item.properties[prop.key], prop.type) }}
                  </a>
                </template>
                <template
                  v-else-if="
                    (isEmailProperty(prop) || isEmail(item.properties?.[prop.key])) &&
                    item.properties?.[prop.key]
                  "
                >
                  <a
                    :href="`mailto:${item.properties[prop.key]}`"
                    class="property-link"
                    @click.stop
                  >
                    {{ renderPropertyValue(item.properties[prop.key], prop.type) }}
                  </a>
                </template>
                <template v-else>
                  {{ renderPropertyValue(item.properties?.[prop.key], prop.type) }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

        <!-- Collection Gallery View -->
        <div v-else class="collection-gallery-wrapper">
        <div class="gallery-grid">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="gallery-card"
            @click="openItemInCraft(item.id)"
          >
            <div class="gallery-card-image-container">
              <img
                v-if="getItemImage(item)"
                :src="getItemImage(item)"
                :alt="item.title"
                class="gallery-card-image"
              />
              <div v-else class="gallery-card-placeholder">
                <Library :size="32" />
              </div>
            </div>
            <div class="gallery-card-title">{{ item.title }}</div>
          </div>
        </div>
      </div>
      </template>

      <!-- Footer with action buttons -->
      <div v-if="!isCompactView" class="widget-footer">
        <button
          v-if="items.length > 0"
          @click="isFiltering = true"
          class="footer-button filter-toggle"
          :class="{ active: hasActiveFilters }"
          title="Filter collection"
        >
          <Filter :size="16" />
        </button>

        <!-- View Mode Selector -->
        <div v-if="items.length > 0" class="view-mode-selector">
          <button
            @click="viewMode = 'table'"
            :class="['view-mode-button', { active: viewMode === 'table' }]"
            title="Table View"
          >
            <Table :size="14" />
            <span>Table</span>
          </button>
          <button
            @click="viewMode = 'gallery'"
            :class="['view-mode-button', { active: viewMode === 'gallery' }]"
            title="Gallery View"
          >
            <Grid3x3 :size="14" />
            <span>Gallery</span>
          </button>
        </div>

        <button @click="openCollectionInCraft" class="footer-button" title="Open in Craft">
          <ExternalLink :size="16" />
        </button>
        <button @click="refresh" class="footer-button" title="Refresh" :disabled="loading">
          <RefreshCw :size="16" :class="{ spinning: loading }" />
        </button>
        <button @click="reconfigure" class="footer-button" title="Change collection">
          <Settings :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collection-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-state,
.display-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 38px; /* Space for footer buttons */
}

.config-state h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.config-description {
  margin: 0 0 16px 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.collections-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.collection-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.collection-option:first-child {
  margin-top: 5px;
}

.collection-option:hover {
  background: var(--bg-secondary);
  border-color: #a855f7;
  box-shadow:
    0 0 0 2px #a855f7,
    0 2px 12px 0 rgba(99, 102, 241, 0.13);
  z-index: 2;
}

.collection-icon {
  font-size: 18px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  border: 2px solid rgba(99, 102, 241, 0.25);
  border-radius: 7px;
  box-shadow: 0 2px 8px 0 rgba(99, 102, 241, 0.1);
  color: #fff;
  margin-bottom: 0;
  flex-shrink: 0;
}

.collection-info {
  flex: 1;
}

.collection-info h4 {
  margin: 0 0 2px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.collection-info p {
  margin: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
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
  position: relative;
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

.footer-button.filter-toggle.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: white;
}

.collection-table-wrapper {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-tertiary);
  display: flex;
  flex-direction: column;
}

.debug-info {
  padding: 6px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
  font-size: 10px;
  flex-shrink: 0;
}

.debug-info summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 4px;
  user-select: none;
}

.debug-info summary:hover {
  color: var(--text-primary);
}

.debug-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.debug-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-section strong {
  color: var(--text-primary);
  font-size: 12px;
}

.debug-info pre {
  margin: 0;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  overflow: auto;
  max-height: 300px;
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.collection-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  overflow: auto;
}

.collection-table thead {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 1;
}

.collection-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-primary);
  white-space: nowrap;
}

.title-header {
  min-width: 120px;
}

.collection-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-secondary);
  font-weight: 500;
  color: var(--text-secondary);
}

.collection-table tr:last-child td {
  border-bottom: none;
}

.collection-table tbody tr:hover {
  background: var(--bg-primary);
}

.table-row {
  transition: background 0.15s ease;
}

.title-cell {
  font-weight: 600;
  color: var(--text-primary);
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s ease;
}

.title-cell:hover {
  color: var(--btn-primary-bg);
}

.property-cell {
  color: var(--text-secondary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-link {
  color: var(--btn-primary-bg);
  text-decoration: none;
  transition: color 0.2s ease;
  cursor: pointer;
}

.property-link:hover {
  color: var(--btn-primary-hover);
  text-decoration: underline;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  flex: 1;
}

.loading-state p,
.error-state p,
.empty-state p {
  margin: 6px 0 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.empty-hint {
  font-size: 11px !important;
  color: var(--text-muted) !important;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

.config-button,
.retry-button {
  margin-top: 10px;
  padding: 6px 14px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.config-button:hover,
.retry-button:hover {
  background: var(--btn-primary-hover);
  transform: translateY(-1px);
}

.retry-button {
  background: var(--btn-success-bg);
}

.retry-button:hover {
  background: var(--btn-success-hover);
}

.table-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
  margin: 0 0 10px 0;
  padding: 0 2px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-primary);
  transition: border-color 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
}

.column-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.filter-controls {
  position: relative;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-primary);
  transition: border-color 0.15s ease;
  appearance: none;
}

.filter-select:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
}

.sort-controls {
  display: flex;
  gap: 8px;
}

.sort-button {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.sort-button:hover {
  border-color: var(--btn-primary-bg);
}

.sort-button.active {
  background: var(--btn-primary-bg);
  color: white;
  border-color: var(--btn-primary-bg);
}

.table-search {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 7px 12px;
  font-size: 13px;
  min-width: 160px;
  outline: none;
  transition: border-color 0.15s;
}

.table-search:focus {
  border-color: var(--btn-primary-bg);
}

.table-filters {
  display: flex;
  gap: 10px;
}

.table-filter {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 7px 10px;
  font-size: 13px;
  outline: none;
  min-width: 110px;
  transition: border-color 0.15s;
}

.table-filter:focus {
  border-color: var(--btn-primary-bg);
}

.collection-table th.sortable {
  cursor: pointer;
  user-select: none;
  position: relative;
}

.collection-table th.sorted {
  color: #a855f7;
}

.collection-table th.sorted:after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  height: 2px;
  background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
  border-radius: 2px;
  opacity: 0.7;
}

.collection-table th.desc {
  font-style: italic;
}

.filter-form-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px;
}

.filter-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}

.filter-form-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.filter-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-form-input,
.filter-form-select {
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s ease;
  outline: none;
}

.filter-form-input:focus,
.filter-form-select:focus {
  border-color: #a855f7;
  box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.1);
}

.filter-form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px;
  padding-right: 36px;
}

.filter-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-primary);
  flex-wrap: wrap;
}

.filter-apply-button {
  flex: 1;
  min-width: 120px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.filter-apply-button:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.filter-apply-button:active {
  transform: translateY(0);
}

.filter-clear-button {
  flex: 1;
  min-width: 100px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.filter-clear-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--btn-danger-bg);
  color: var(--btn-danger-bg);
}

.filter-cancel-button {
  flex: 1;
  min-width: 100px;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.filter-cancel-button:hover {
  background: var(--bg-secondary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

/* View Mode Selector */
.view-mode-selector {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
  margin: 0 4px;
}

.view-mode-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.view-mode-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.view-mode-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.view-mode-button.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.view-mode-button span {
  font-size: 11px;
}

/* Gallery View */
.collection-gallery-wrapper {
  flex: 1;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-tertiary);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 4px;
}

@media (max-width: 768px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
}

.gallery-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 100%;
  min-height: 200px;
}

.gallery-card:hover {
  border-color: #a855f7;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.2);
  transform: translateY(-2px);
}

.gallery-card-image-container {
  width: 100%;
  flex: 1;
  min-height: 150px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.gallery-card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  min-height: 150px;
}

.gallery-card-title {
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
</style>
