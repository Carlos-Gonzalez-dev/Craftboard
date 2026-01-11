<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Search, Settings, Link as LinkIcon, Loader, RefreshCw } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import {
  searchDocuments,
  searchWithinDocument,
  getBlockContent,
  openCraftLink,
  getApiUrl,
  type DocumentSearchResult,
} from '../../utils/craftApi'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

// State
const isConfiguring = ref(!props.widget.data?.blockId)
const searchQuery = ref('')
const searchResults = ref<DocumentSearchResult[]>([])
const isSearching = ref(false)
const isLoadingBlock = ref(false)
const error = ref<string | null>(null)
const blockContent = ref<string | null>(null)
const selectedBlock = ref<{ id: string; title: string } | null>(null)

const hasApiConfig = computed(() => !!getApiUrl())

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const performSearch = async () => {
  if (!searchQuery.value.trim() || searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  error.value = null

  try {
    const results = await searchDocuments(searchQuery.value)
    searchResults.value = results
  } catch (err) {
    console.error('Search failed:', err)
    error.value = 'Search failed'
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(performSearch, 300)
})

// Select a block from search results
const selectBlock = async (result: DocumentSearchResult) => {
  isLoadingBlock.value = true
  error.value = null

  // Save the search query as the title before clearing it
  const title = searchQuery.value.trim() || 'Untitled'

  try {
    // Search within the document to find the actual blockId
    const blockResults = await searchWithinDocument(result.id, title)
    const blockId = blockResults.length > 0 ? blockResults[0].blockId : result.id

    // Fetch block content
    const block = await getBlockContent(blockId)

    // Save the selection
    const widgetData = {
      blockId,
      documentId: result.id,
      blockTitle: title,
    }

    emit('update:data', widgetData)
    emit('update:title', title)

    selectedBlock.value = { id: blockId, title }
    blockContent.value = block?.markdown || result.snippet || title
    isConfiguring.value = false
    searchQuery.value = ''
    searchResults.value = []
  } catch (err) {
    console.error('Failed to load block:', err)
    error.value = 'Failed to load block content'
  } finally {
    isLoadingBlock.value = false
  }
}

// Open block in Craft
const openBlock = async () => {
  const blockId = props.widget.data?.blockId || selectedBlock.value?.id
  if (!blockId) return

  await openCraftLink(blockId)
}

// Reconfigure widget
const reconfigure = () => {
  isConfiguring.value = true
  searchQuery.value = ''
  searchResults.value = []
  error.value = null
}

// Load saved block on mount
onMounted(async () => {
  if (props.widget.data?.blockId) {
    const title = props.widget.data.blockTitle || 'Untitled'
    selectedBlock.value = {
      id: props.widget.data.blockId,
      title,
    }

    // Try to load block content (title stays the same - it's the user's search query)
    try {
      const block = await getBlockContent(props.widget.data.blockId)
      blockContent.value = block?.markdown || title
    } catch {
      blockContent.value = title
    }
  }
})

// Refresh block content (keeps the title unchanged)
const refreshBlock = async () => {
  if (!props.widget.data?.blockId) return

  isLoadingBlock.value = true
  try {
    const block = await getBlockContent(props.widget.data.blockId)
    if (block?.markdown) {
      blockContent.value = block.markdown
    }
  } catch (err) {
    console.error('Failed to refresh block:', err)
  } finally {
    isLoadingBlock.value = false
  }
}
</script>

<template>
  <div class="pin-block-widget">
    <!-- Configuration Mode -->
    <div v-if="isConfiguring" class="config-mode">
      <div v-if="!hasApiConfig" class="error-message">
        Please configure your API URL in Settings
      </div>

      <template v-else>
        <!-- Search Input -->
        <div class="search-container">
          <Search :size="16" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search for a block..."
            class="search-input"
            :disabled="isSearching"
          />
          <Loader v-if="isSearching" :size="16" class="loading-icon" />
        </div>

        <!-- Error -->
        <div v-if="error" class="error-message">{{ error }}</div>

        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="search-results">
          <div
            v-for="result in searchResults"
            :key="result.id"
            class="search-result-item"
            @click="selectBlock(result)"
          >
            <div class="result-snippet">{{ result.snippet }}</div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="searchQuery.length >= 2 && !isSearching" class="empty-state">
          No results found
        </div>

        <div v-else-if="!searchQuery" class="hint-text">
          Type at least 2 characters to search
        </div>
      </template>
    </div>

    <!-- Preview Mode -->
    <div v-else class="preview-mode">
      <div v-if="isLoadingBlock" class="loading-state">
        <Loader :size="20" class="loading-icon" />
        <span>Loading...</span>
      </div>

      <div v-else class="block-content" @click="openBlock">
        <p class="block-text">{{ blockContent || selectedBlock?.title }}</p>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="!isConfiguring && !isCompactView" class="widget-footer">
      <button @click="refreshBlock" class="footer-button" title="Refresh" :disabled="isLoadingBlock">
        <RefreshCw :size="16" :class="{ spinning: isLoadingBlock }" />
      </button>
      <button @click="openBlock" class="footer-button" title="Open in Craft">
        <LinkIcon :size="16" />
      </button>
      <button @click="reconfigure" class="footer-button" title="Reconfigure">
        <Settings :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin-block-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.config-mode {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--input-text);
  font-size: 14px;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.loading-icon {
  position: absolute;
  right: 12px;
  color: var(--text-tertiary);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.search-results {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-result-item {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-result-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
}

.result-snippet {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state,
.hint-text {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.error-message {
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
}

.preview-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  padding-bottom: 38px;
  overflow: hidden;
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

.block-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 16px;
  overflow: auto;
}

.block-text {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.5;
  word-break: break-word;
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

.spinning {
  animation: spin 1s linear infinite;
}
</style>
