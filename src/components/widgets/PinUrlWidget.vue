<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Settings, Link as LinkIcon, Maximize2, Minimize2 } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

const isConfiguring = ref(!props.widget.data?.externalUrl)
const error = ref<string | null>(null)
const externalUrl = ref(props.widget.data?.externalUrl || '')
const externalTitle = ref(props.widget.data?.externalTitle || '')
const externalImage = ref(props.widget.data?.externalImage || '')
const isImageExpanded = ref(props.widget.data?.isImageExpanded || false)
const previewData = ref<any>(null)

// Select external link
const saveExternalLink = () => {
  if (!externalUrl.value.trim()) {
    error.value = 'Please enter a URL'
    return
  }

  const title = externalTitle.value || new URL(externalUrl.value).hostname
  const widgetData = {
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
  openExternalLink()
}

// Load preview on mount if already configured
onMounted(() => {
  isImageExpanded.value = props.widget.data?.isImageExpanded || false

  if (props.widget.data?.externalUrl) {
    previewData.value = {
      url: props.widget.data.externalUrl,
      title: props.widget.data.externalTitle || new URL(props.widget.data.externalUrl).hostname,
      image: props.widget.data.externalImage,
    }
    error.value = null
  }
})

// Reconfigure
const reconfigure = () => {
  isConfiguring.value = true
  externalUrl.value = props.widget.data?.externalUrl || ''
  externalTitle.value = props.widget.data?.externalTitle || ''
  externalImage.value = props.widget.data?.externalImage || ''
  previewData.value = null
}
</script>

<template>
  <div class="pin-widget">
    <!-- Configuration Mode -->
    <div v-if="isConfiguring" class="config-mode">
      <div class="external-link-section">
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
        <!-- External Link Preview -->
        <div v-if="previewData" class="preview-content external-preview">
          <div
            v-if="previewData?.image"
            class="preview-image"
            :style="{ backgroundImage: `url(${previewData.image})` }"
            @click="handleImageClick"
          ></div>
          <div class="preview-text" @click="handleImageClick">
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

.external-link-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  justify-content: center;
  align-items: center;
  overflow-y: auto;
  cursor: pointer;
}

.preview-url {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
  text-align: center;
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
