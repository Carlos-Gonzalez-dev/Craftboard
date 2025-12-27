<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Settings,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
} from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { parseCraftLink } from '../../utils/craftApi'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

const isConfiguring = ref(!props.widget.data?.blockLink)
const error = ref<string | null>(null)
const blockLink = ref(props.widget.data?.blockLink || '')
const blockTitle = ref(props.widget.data?.blockTitle || '')
const blockImage = ref(props.widget.data?.blockImage || '')
const isImageExpanded = ref(props.widget.data?.isImageExpanded || false)
const previewData = ref<any>(null)

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
    if (!blockTitle.value && markdownLinkMatch[1]) {
      blockTitle.value = markdownLinkMatch[1]
    }
  }

  const title = blockTitle.value || 'Craft Block'
  const widgetData = {
    blockLink: actualLink,
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

  previewData.value = {
    url: actualLink,
    title,
    image: blockImage.value,
  }
}

// Get Craft link URL
const getCraftLinkUrl = computed(() => {
  return props.widget.data?.blockLink || blockLink.value
})

// Open in Craft
const openInCraft = async () => {
  const link = getCraftLinkUrl.value
  if (!link) return

  if (link.startsWith('https://') || link.startsWith('http://')) {
    window.open(link, '_blank')
  } else if (link.startsWith('craftdocs://')) {
    window.location.href = link
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

// Save image expanded state
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
  openInCraft()
}

// Load preview on mount if already configured
onMounted(() => {
  isImageExpanded.value = props.widget.data?.isImageExpanded || false

  if (props.widget.data?.blockLink) {
    previewData.value = {
      url: props.widget.data.blockLink,
      title: props.widget.data.blockTitle || 'Craft Block',
      image: props.widget.data.blockImage,
    }
    error.value = null
  }
})

// Reconfigure
const reconfigure = () => {
  isConfiguring.value = true
  blockLink.value = props.widget.data?.blockLink || ''
  blockTitle.value = props.widget.data?.blockTitle || ''
  blockImage.value = props.widget.data?.blockImage || ''
  previewData.value = null
}
</script>

<template>
  <div class="pin-widget">
    <!-- Configuration Mode -->
    <div v-if="isConfiguring" class="config-mode">
      <div class="block-link-section">
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
        <!-- Block Preview -->
        <div v-if="previewData" class="preview-content external-preview">
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

    <!-- Footer with action buttons -->
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
        :href="getCraftLinkUrl || '#'"
        @click.prevent="openInCraft"
        class="footer-button"
        title="Open in Craft"
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

.block-link-section {
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
  padding-bottom: 38px;
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
  border-radius: 8px;
  margin-bottom: 12px;
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

.error-message {
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
}
</style>

