<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Widget } from '../../types/widget'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const isConfiguring = ref(!props.widget.data?.iframeUrl && !props.widget.data?.iframeCode)
const error = ref<string | null>(null)
const inputValue = ref(props.widget.data?.iframeUrl || props.widget.data?.iframeCode || '')
const iframeUrl = ref(props.widget.data?.iframeUrl || '')
const iframeCode = ref(props.widget.data?.iframeCode || '')

// Check if input is a URL or iframe code
const isUrl = (value: string): boolean => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const isIframeCode = (value: string): boolean => {
  return value.trim().toLowerCase().startsWith('<iframe')
}

// Extract URL from iframe code
const extractUrlFromIframe = (code: string): string | null => {
  const srcMatch = code.match(/src=["']([^"']+)["']/i)
  return srcMatch ? srcMatch[1] : null
}

// Save iframe configuration
const saveIframe = () => {
  if (!inputValue.value.trim()) {
    error.value = 'Please enter a URL or iframe code'
    return
  }

  error.value = null

  if (isIframeCode(inputValue.value)) {
    // It's iframe code
    const url = extractUrlFromIframe(inputValue.value)
    iframeCode.value = inputValue.value.trim()
    iframeUrl.value = url || ''
    
    const widgetData = {
      iframeCode: iframeCode.value,
      iframeUrl: iframeUrl.value,
    }
    emit('update:data', widgetData)
    
    // Try to extract title from iframe or use default
    const titleMatch = inputValue.value.match(/title=["']([^"']+)["']/i)
    const title = titleMatch ? titleMatch[1] : 'iFrame'
    emit('update:title', title)
  } else if (isUrl(inputValue.value)) {
    // It's a URL
    iframeUrl.value = inputValue.value.trim()
    iframeCode.value = ''
    
    const widgetData = {
      iframeUrl: iframeUrl.value,
      iframeCode: '',
    }
    emit('update:data', widgetData)
    
    try {
      const url = new URL(iframeUrl.value)
      emit('update:title', url.hostname)
    } catch {
      emit('update:title', 'iFrame')
    }
  } else {
    error.value = 'Please enter a valid URL or iframe code'
    return
  }

  isConfiguring.value = false
}


// Track if we have an active iframe
const hasActiveIframe = ref(false)

// Handle iframe loading errors
const handleIframeError = (event: Event) => {
  console.warn(
    '[iFrame Widget] Iframe failed to load. This may be due to CORS restrictions, network issues, or the content being unavailable.',
    event
  )
  hasActiveIframe.value = false
}

// Handle iframe load success
const handleIframeLoad = () => {
  hasActiveIframe.value = true
}

// Handle errors from iframe content
let errorHandler: ((event: ErrorEvent) => void) | null = null
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null

const setupIframeErrorHandling = () => {
  // Listen for errors that might be from iframe content
  errorHandler = (event: ErrorEvent) => {
    // Check if error message contains iframe-related keywords
    const errorMessage = event.message || ''
    const errorSource = event.filename || ''
    const isIframeError = 
      errorMessage.toLowerCase().includes('html') ||
      errorMessage.toLowerCase().includes('iframe') ||
      errorSource.includes('iframe') ||
      (event.target && (event.target as HTMLElement).tagName === 'IFRAME')
    
    if (isIframeError && hasActiveIframe.value) {
      console.warn(
        '[iFrame Widget] An error was detected from the iframe content. This is likely from the embedded page itself, not the widget.',
        { message: errorMessage, source: errorSource }
      )
      // Prevent default error logging for iframe errors
      event.preventDefault()
      return true
    }
  }
  
  window.addEventListener('error', errorHandler, true)

  // Handle unhandled promise rejections that might come from iframe
  rejectionHandler = (event: PromiseRejectionEvent) => {
    if (hasActiveIframe.value) {
      const reason = event.reason?.toString() || ''
      if (reason.toLowerCase().includes('html') || reason.toLowerCase().includes('iframe')) {
        console.warn(
          '[iFrame Widget] An unhandled promise rejection was detected from the iframe content.',
          event.reason
        )
        event.preventDefault()
      }
    }
  }
  
  window.addEventListener('unhandledrejection', rejectionHandler)
}

const cleanupIframeErrorHandling = () => {
  if (errorHandler) {
    window.removeEventListener('error', errorHandler, true)
  }
  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler)
  }
}

// Load on mount
onMounted(() => {
  if (props.widget.data?.iframeUrl || props.widget.data?.iframeCode) {
    iframeUrl.value = props.widget.data.iframeUrl || ''
    iframeCode.value = props.widget.data.iframeCode || ''
    inputValue.value = iframeCode.value || iframeUrl.value
    hasActiveIframe.value = true
  }
  
  // Setup error handling for iframe content
  setupIframeErrorHandling()
})

// Cleanup on unmount
onUnmounted(() => {
  hasActiveIframe.value = false
  cleanupIframeErrorHandling()
})
</script>

<template>
  <div class="iframe-widget">
    <!-- Configuration View -->
    <div v-if="isConfiguring" class="config-view">
      <div class="config-header">
        <h3>Configure iFrame</h3>
        <p class="config-description">Enter a URL or paste full iframe code</p>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <div class="config-content">
        <div class="form-group">
          <label for="iframe-input">URL or iFrame Code</label>
          <textarea
            id="iframe-input"
            v-model="inputValue"
            placeholder="https://example.com or &lt;iframe src=&quot;...&quot;&gt;&lt;/iframe&gt;"
            class="config-input"
            rows="4"
          ></textarea>
        </div>

        <div class="button-group">
          <button @click="saveIframe" class="save-button">Save</button>
        </div>
      </div>
    </div>

    <!-- Display View -->
    <div v-else class="display-view">
      <div v-if="iframeCode" class="iframe-container" v-html="iframeCode"></div>
      <iframe
        v-else-if="iframeUrl"
        :src="iframeUrl"
        class="iframe-content"
        frameborder="0"
        allowfullscreen
        @error="handleIframeError"
        @load="handleIframeLoad"
      ></iframe>
      <div v-else class="empty-state">
        <p>No iframe configured</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.iframe-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.config-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.config-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-description {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.error-message {
  padding: 8px 12px;
  background: rgba(244, 63, 94, 0.1);
  border: 1px solid rgba(244, 63, 94, 0.3);
  border-radius: 6px;
  color: #f43f5e;
  font-size: 12px;
}

.config-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.config-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  color: var(--input-text);
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  resize: vertical;
  transition: border-color 0.2s ease;
}

.config-input:focus {
  outline: none;
  border-color: var(--input-focus);
}

.button-group {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.save-button {
  padding: 8px 16px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.save-button:hover {
  background: var(--btn-primary-hover);
}

.display-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.iframe-container {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.iframe-container :deep(iframe) {
  width: 100%;
  height: 100%;
  border: none;
}

.iframe-content {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>

