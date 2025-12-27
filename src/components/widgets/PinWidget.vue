<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  Settings,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Search,
  Maximize2,
  Minimize2,
} from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import {
  searchDocuments,
  fetchDocuments,
  getBlockContent,
  extractImagesFromBlock,
  getDocumentTitle,
  getCraftLinkPreference,
  buildCraftAppLink,
  buildCraftWebLink,
  getSpaceId,
  getShareToken,
  parseCraftLink,
  type CraftDocument,
} from '../../utils/craftApi'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

type PinType = 'document' | 'block' | 'external'

const pinType = ref<PinType>((props.widget.data?.pinType as PinType) || 'document')
const isConfiguring = ref(
  !props.widget.data?.targetId && !props.widget.data?.externalUrl && !props.widget.data?.blockLink,
)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const previewData = ref<any>(null)
const isLoadingPreview = ref(false)
const error = ref<string | null>(null)
const externalUrl = ref(props.widget.data?.externalUrl || '')
const externalTitle = ref(props.widget.data?.externalTitle || '')
const externalImage = ref(props.widget.data?.externalImage || '')
const blockLink = ref(props.widget.data?.blockLink || '')
const blockTitle = ref(props.widget.data?.blockTitle || '')
const blockImage = ref(props.widget.data?.blockImage || '')
const isImageExpanded = ref(props.widget.data?.isImageExpanded || false)

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Watch for pin type changes
watch(pinType, () => {
  if (pinType.value === 'external') {
    isConfiguring.value = !externalUrl.value
  } else if (pinType.value === 'block') {
    isConfiguring.value = !blockLink.value
  } else {
    isConfiguring.value = !props.widget.data?.targetId
  }
})

// Search documents with debounce (only for document type)
const performSearch = async () => {
  // Clear existing timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  // Debounce: wait 500ms after user stops typing
  searchDebounceTimer = setTimeout(async () => {
    isSearching.value = true
    error.value = null

    try {
      if (pinType.value === 'document') {
        const results = await searchDocuments(searchQuery.value)
        // Limit to 5 results
        const limitedResults = results.slice(0, 5)

        // Use titles directly from search results (already extracted from markdown)
        searchResults.value = limitedResults.map((doc) => ({
          id: doc.id,
          title: doc.title,
          snippet: doc.snippet,
        }))
      }
    } catch (err) {
      console.error('Search error:', err)
      error.value = err instanceof Error ? err.message : 'Failed to search'
    } finally {
      isSearching.value = false
    }
  }, 500)
}

// Select a document/block
const selectTarget = async (targetId: string, title?: string) => {
  let clickableLink: string | undefined
  
  // For document type, try to fetch the document to get clickableLink
  if (pinType.value === 'document') {
    try {
      const result = await fetchDocuments({ fetchMetadata: true })
      const doc = result.items.find((d: CraftDocument) => d.id === targetId)
      if (doc?.clickableLink) {
        clickableLink = doc.clickableLink
      }
    } catch (e) {
      // If fetch fails, continue without clickableLink
      console.warn('Failed to fetch document metadata for clickableLink:', e)
    }
  }
  
  const widgetData: any = {
    pinType: pinType.value,
    targetId,
  }
  if (clickableLink) {
    widgetData.clickableLink = clickableLink
  }
  emit('update:data', widgetData)
  isConfiguring.value = false

  // Update widget title immediately if we have it
  if (title) {
    emit('update:title', title)
  }

  // Load preview (will also update title if not already set)
  await loadPreview(targetId)
}

// Select block link
const saveBlockLink = () => {
  if (!blockLink.value.trim()) {
    error.value = 'Please enter a Craft block link'
    return
  }

  const parsed = parseCraftLink(blockLink.value)
  if (!parsed) {
    error.value =
      'Invalid Craft link. Please use a craftdocs:// link (app) or docs.craft.do link (web). You can paste markdown links like [Text](craftdocs://...)'
    return
  }

  // Extract the actual link from markdown if present
  let actualLink = blockLink.value.trim()
  const markdownLinkMatch = blockLink.value.match(/\[([^\]]+)\]\(([^\)]+)\)/)
  if (markdownLinkMatch && markdownLinkMatch[2]) {
    actualLink = markdownLinkMatch[2].trim()
    // Use the markdown text as title if no title provided
    if (!blockTitle.value && markdownLinkMatch[1]) {
      blockTitle.value = markdownLinkMatch[1]
    }
  }

  const title = blockTitle.value || 'Craft Block'
  const widgetData = {
    pinType: 'block',
    blockLink: actualLink, // Store the actual link, not the markdown
    blockTitle: title,
    blockImage: blockImage.value,
    targetId: parsed.blockId,
    documentId: parsed.documentId,
    isAppLink: parsed.isAppLink,
    isWebLink: parsed.isWebLink,
  }
  emit('update:data', widgetData)
  emit('update:title', title)
  isConfiguring.value = false

  // Set preview data without API call (like external links)
  previewData.value = {
    url: actualLink,
    title,
    image: blockImage.value,
  }
}

// Select external link
const saveExternalLink = () => {
  if (!externalUrl.value.trim()) {
    error.value = 'Please enter a URL'
    return
  }

  const title = externalTitle.value || new URL(externalUrl.value).hostname
  const widgetData = {
    pinType: 'external',
    externalUrl: externalUrl.value,
    externalTitle: title,
    externalImage: externalImage.value,
  }
  emit('update:data', widgetData)
  emit('update:title', title)
  isConfiguring.value = false
  previewData.value = {
    url: externalUrl.value,
    title,
    image: externalImage.value,
  }
}

// Load preview for document/block
const loadPreview = async (targetId: string) => {
  if (!targetId) return

  isLoadingPreview.value = true
  error.value = null

  try {
    const block = await getBlockContent(targetId)
    if (!block) {
      error.value = 'Content not found'
      return
    }

    const title = getDocumentTitle(block)
    const images = extractImagesFromBlock(block)
    const firstImage = images.length > 0 ? images[0] : null

    // Extract preview text (first few lines of markdown)
    const extractPreviewText = (blk: any, maxLength = 200): string => {
      let text = ''
      if (blk.markdown && blk.type !== 'page') {
        text += blk.markdown.replace(/<[^>]*>/g, '').trim() + ' '
      }
      if (blk.content && Array.isArray(blk.content)) {
        for (const child of blk.content) {
          if (text.length >= maxLength) break
          text += extractPreviewText(child, maxLength - text.length)
        }
      }
      return text.substring(0, maxLength).trim()
    }

    const previewText = extractPreviewText(block)

    previewData.value = {
      id: targetId,
      title,
      image: firstImage,
      previewText,
    }

    // Always update widget title with the document/block title
    emit('update:title', title)
  } catch (err) {
    console.error('Failed to load preview:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load preview'
  } finally {
    isLoadingPreview.value = false
  }
}

// Get Craft link URL
const getCraftLinkUrl = computed(() => {
  // For block type, use the stored link directly
  if (pinType.value === 'block' && props.widget.data?.blockLink) {
    return props.widget.data.blockLink
  }

  // For document type, build link based on preference
  const preference = getCraftLinkPreference()
  const spaceId = getSpaceId()
  const targetId = props.widget.data?.targetId
  const clickableLink = props.widget.data?.clickableLink

  if (!targetId || !spaceId) return null

  if (preference === 'web') {
    // Use clickableLink if available (contains correct document ID and share token)
    if (clickableLink) {
      return clickableLink
    }
    return buildCraftWebLink(targetId, spaceId)
  } else {
    return buildCraftAppLink(targetId, spaceId)
  }
})

// Open in Craft
const openInCraft = async () => {
  const link = getCraftLinkUrl.value
  if (!link) return

  // Check if it's a web link or app link
  if (link.startsWith('https://') || link.startsWith('http://')) {
    window.open(link, '_blank')
  } else if (link.startsWith('craftdocs://')) {
    window.location.href = link
  } else {
    // Fallback to preference-based behavior
    const preference = getCraftLinkPreference()
    if (preference === 'web') {
      window.open(link, '_blank')
    } else {
      window.location.href = link
    }
  }
}

// Get external link URL
const getExternalLinkUrl = computed(() => {
  return props.widget.data?.externalUrl || externalUrl.value
})

// Open external link
const openExternalLink = () => {
  const url = getExternalLinkUrl.value
  if (url) {
    window.open(url, '_blank')
  }
}

// Expand image
const expandImage = () => {
  isImageExpanded.value = true
  saveImageExpandedState()
}

// Collapse image
const collapseImage = () => {
  isImageExpanded.value = false
  saveImageExpandedState()
}

// Save image expanded state to widget data
const saveImageExpandedState = () => {
  const currentData = props.widget.data || {}
  const updatedData = {
    ...currentData,
    isImageExpanded: isImageExpanded.value,
  }
  emit('update:data', updatedData)
}

// Handle image click
const handleImageClick = () => {
  if (pinType.value === 'document' || pinType.value === 'block') {
    openInCraft()
  } else {
    openExternalLink()
  }
}

// Load preview on mount if already configured
onMounted(() => {
  // Load expanded state from widget data
  isImageExpanded.value = props.widget.data?.isImageExpanded || false

  // Only load preview for documents (which need API call)
  if (pinType.value === 'document' && props.widget.data?.targetId && !isConfiguring.value) {
    loadPreview(props.widget.data.targetId)
  } else if (pinType.value === 'block' && props.widget.data?.blockLink) {
    // Blocks: just display configured data, no API call
    previewData.value = {
      url: props.widget.data.blockLink,
      title: props.widget.data.blockTitle || 'Craft Block',
      image: props.widget.data.blockImage,
    }
    isLoadingPreview.value = false
    error.value = null
  } else if (pinType.value === 'external' && props.widget.data?.externalUrl) {
    // External links: just display configured data, no API call
    previewData.value = {
      url: props.widget.data.externalUrl,
      title: props.widget.data.externalTitle || new URL(props.widget.data.externalUrl).hostname,
      image: props.widget.data.externalImage,
    }
    isLoadingPreview.value = false
    error.value = null
  }
})

// Reconfigure
const reconfigure = () => {
  isConfiguring.value = true
  searchQuery.value = ''
  searchResults.value = []
  previewData.value = null
  blockLink.value = props.widget.data?.blockLink || ''
  blockTitle.value = props.widget.data?.blockTitle || ''
  blockImage.value = props.widget.data?.blockImage || ''
}
</script>

<template>
  <div class="pin-widget">
    <!-- Configuration Mode -->
    <div v-if="isConfiguring" class="config-mode">
      <div class="type-selector">
        <label>Pin Type:</label>
        <select v-model="pinType" class="type-select">
          <option value="document">Craft Document</option>
          <option value="block">Craft Block</option>
          <option value="external">External Link</option>
        </select>
      </div>

      <!-- Document Search -->
      <div v-if="pinType === 'document'" class="search-section">
        <div class="search-input-wrapper">
          <Search :size="18" class="search-icon" />
          <input
            v-model="searchQuery"
            @input="performSearch"
            @keyup.enter="performSearch"
            type="text"
            placeholder="Search for documents..."
            class="search-input"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div v-if="isSearching" class="loading-state">
          <div class="spinner"></div>
          <span>Searching...</span>
        </div>

        <div v-if="searchResults.length > 0" class="search-results">
          <button
            v-for="result in searchResults"
            :key="result.id"
            @click="selectTarget(result.id, result.title)"
            class="search-result-item"
          >
            <FileText :size="16" />
            <div class="result-info">
              <div class="result-title">{{ result.title }}</div>
              <div v-if="result.snippet" class="result-snippet">
                {{ result.snippet.replace(/\*\*/g, '').substring(0, 100) }}...
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Block Link Input -->
      <div v-else-if="pinType === 'block'" class="block-link-section">
        <div class="info-text">
          <p>Go to the block in Craft and copy its link. You can use either:</p>
          <ul>
            <li><strong>Deep link</strong> (craftdocs://...) - Opens in Craft app</li>
            <li><strong>Direct link</strong> (https://docs.craft.do/...) - Opens in Craft web</li>
          </ul>
        </div>
        <div class="form-group">
          <label>Block Link:</label>
          <input
            v-model="blockLink"
            type="text"
            placeholder="[Text](craftdocs://open?blockId=...) or craftdocs://open?blockId=..."
            class="input"
          />
          <p class="field-hint">
            Paste a Craft deep link. You can use markdown format like [Text](craftdocs://...) or
            just the link directly.
          </p>
        </div>
        <div class="form-group">
          <label>Title (optional):</label>
          <input v-model="blockTitle" type="text" placeholder="Block title" class="input" />
        </div>
        <div class="form-group">
          <label>Preview Image URL (optional):</label>
          <input
            v-model="blockImage"
            type="url"
            placeholder="https://example.com/image.jpg"
            class="input"
          />
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <button @click="saveBlockLink" class="save-button">Save Block</button>
      </div>

      <!-- External Link Input -->
      <div v-else class="external-link-section">
        <div class="form-group">
          <label>URL:</label>
          <input v-model="externalUrl" type="url" placeholder="https://example.com" class="input" />
        </div>
        <div class="form-group">
          <label>Title (optional):</label>
          <input v-model="externalTitle" type="text" placeholder="Link title" class="input" />
        </div>
        <div class="form-group">
          <label>Preview Image URL (optional):</label>
          <input
            v-model="externalImage"
            type="url"
            placeholder="https://example.com/image.jpg"
            class="input"
          />
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <button @click="saveExternalLink" class="save-button">Save Link</button>
      </div>
    </div>

    <!-- Preview Mode -->
    <div v-else class="preview-mode">
      <!-- Expanded Image View -->
      <div
        v-if="isImageExpanded && previewData?.image"
        class="expanded-image-view"
        :style="{ backgroundImage: `url(${previewData.image})` }"
        @click="handleImageClick"
      ></div>

      <!-- Normal Preview View -->
      <template v-else>
        <!-- Loading State (only for documents) -->
        <div v-if="pinType === 'document' && isLoadingPreview" class="loading-state">
          <div class="spinner"></div>
          <span>Loading preview...</span>
        </div>

        <!-- Error State (only for documents) -->
        <div v-else-if="pinType === 'document' && error" class="error-state">
          <p>{{ error }}</p>
          <button @click="reconfigure" class="retry-button">Reconfigure</button>
        </div>

        <!-- Document Preview -->
        <div v-else-if="pinType === 'document' && previewData" class="preview-content">
          <div
            v-if="previewData?.image"
            class="preview-image"
            :style="{ backgroundImage: `url(${previewData.image})` }"
            @click="handleImageClick"
          ></div>
          <div class="preview-text" @click="handleImageClick">
            <p v-if="previewData?.previewText" class="preview-description">
              {{ previewData.previewText }}
            </p>
          </div>
        </div>

        <!-- Block/External Link Preview -->
        <div
          v-else-if="(pinType === 'block' || pinType === 'external') && previewData"
          class="preview-content external-preview"
        >
          <div
            v-if="previewData?.image"
            class="preview-image"
            :style="{ backgroundImage: `url(${previewData.image})` }"
            @click="handleImageClick"
          ></div>
          <div class="preview-text" @click="handleImageClick">
            <p v-if="previewData?.title" class="preview-title-text">{{ previewData.title }}</p>
            <p class="preview-url">{{ previewData?.url }}</p>
          </div>
        </div>
      </template>
    </div>

    <!-- Footer with action buttons (only show in preview mode, not when configuring) -->
    <div v-if="!isConfiguring && !isCompactView" class="widget-footer">
      <!-- Expand/Collapse Image Button -->
      <button
        v-if="previewData?.image"
        @click="isImageExpanded ? collapseImage() : expandImage()"
        class="footer-button"
        :title="isImageExpanded ? 'Collapse Image' : 'Expand Image'"
      >
        <Maximize2 v-if="!isImageExpanded" :size="16" />
        <Minimize2 v-else :size="16" />
      </button>

      <!-- Link Button -->
      <a
        v-if="pinType === 'document' || pinType === 'block'"
        :href="getCraftLinkUrl || '#'"
        @click.prevent="openInCraft"
        class="footer-button"
        :title="getCraftLinkPreference() === 'web' ? 'Open in Craft Web' : 'Open in Craft App'"
      >
        <LinkIcon :size="16" />
      </a>
      <a
        v-else-if="pinType === 'external'"
        :href="getExternalLinkUrl || '#'"
        @click.prevent="openExternalLink"
        class="footer-button"
        title="Open Link"
      >
        <LinkIcon :size="16" />
      </a>

      <!-- Configure Button -->
      <button @click="reconfigure" class="footer-button" title="Reconfigure">
        <Settings :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.config-mode {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--bg-secondary);
}

.config-mode::-webkit-scrollbar {
  width: 8px;
}

.config-mode::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 4px;
}

.config-mode::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.config-mode::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.type-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-selector label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.type-select {
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--input-text);
  font-size: 13px;
  font-family: inherit;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-wrapper {
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
  padding: 8px 12px 8px 36px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--input-text);
  font-size: 13px;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.search-result-item:hover {
  background: var(--bg-primary);
  border-color: var(--btn-primary-bg);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.result-snippet {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.block-link-section,
.external-link-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-text {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.info-text p {
  margin: 0 0 8px 0;
}

.info-text ul {
  margin: 0;
  padding-left: 20px;
}

.info-text li {
  margin-bottom: 4px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.field-hint {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  font-style: italic;
}

.input {
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--input-text);
  font-size: 13px;
  font-family: inherit;
}

.input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.save-button {
  padding: 8px 16px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.save-button:hover {
  background: var(--btn-primary-hover);
}

.preview-mode {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  padding-bottom: 38px; /* Space for footer buttons */
}

.expanded-image-view {
  position: absolute;
  top: -12px;
  left: -12px;
  right: -12px;
  bottom: -12px;
  width: calc(100% + 24px);
  height: calc(100% + 24px);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  background-color: var(--bg-secondary);
  z-index: 10;
  padding: 0;
  margin: 0;
  cursor: pointer;
  border-radius: 12px;
}

.preview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--bg-tertiary);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.preview-image:hover {
  opacity: 0.9;
}

.preview-text {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  cursor: pointer;
}

.preview-description {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.preview-title-text {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-url {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
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
  text-decoration: none;
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

.loading-state,
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-tertiary);
}

.spinner {
  width: 24px;
  height: 24px;
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

.error-message {
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
}

.retry-button {
  padding: 8px 16px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.external-preview .preview-image {
  border-radius: 8px;
  margin-bottom: 12px;
}
</style>
