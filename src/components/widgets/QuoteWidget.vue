<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Loader, RefreshCw, Shuffle } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { getApiUrl } from '../../utils/craftApi'
import { useWidgetView } from '../../composables/useWidgetView'
import { useQuotesApiStore } from '../../stores/quotesApi'
import ProgressIndicator from '../ProgressIndicator.vue'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const quotesApiStore = useQuotesApiStore()

// API Configuration
const apiBaseUrl = ref('')
const quotesCollectionId = ref<string | null>(null)

// State
const quotes = computed(() => quotesApiStore.quotes)
const selectedQuote = ref<any | null>(null)
const isLoading = computed(() => quotesApiStore.isLoading)
const error = ref<string | null>(null)
const totalApiCalls = computed(() => quotesApiStore.totalApiCalls)
const completedApiCalls = computed(() => quotesApiStore.completedApiCalls)

// Widget view mode
const { isCompactView } = useWidgetView()

const discoverCollection = async () => {
  if (!apiBaseUrl.value) return

  // Load collection ID from settings
  const quotesId = localStorage.getItem('collection-id-quotes')

  if (!quotesId) {
    error.value =
      'Quotes collection ID not configured. Please configure it in Settings > API > Collection IDs.'
    return
  }

  quotesCollectionId.value = quotesId
}

const selectRandomQuote = () => {
  if (quotes.value.length === 0) {
    selectedQuote.value = null
    return
  }

  const randomIndex = Math.floor(Math.random() * quotes.value.length)
  selectedQuote.value = quotes.value[randomIndex]

  // Save selected quote ID for consistency (optional, but good for tracking)
  emit('update:data', {
    ...props.widget.data,
    quoteId: selectedQuote.value.id,
  })
}

const fetchQuotes = async (forceRefresh = false) => {
  if (!apiBaseUrl.value || !quotesCollectionId.value) {
    return
  }

  error.value = null

  try {
    await quotesApiStore.initializeQuotes(quotesCollectionId.value, forceRefresh)
    selectRandomQuote()
  } catch (err) {
    console.error('Error fetching quotes:', err)
    error.value = 'Failed to fetch quotes'
  }
}

const refreshQuotes = async () => {
  await fetchQuotes(true)
}

const randomizeQuote = () => {
  selectRandomQuote()
}

const initialize = async () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    error.value = 'Craft API URL not configured'
    return
  }

  await discoverCollection()
  if (quotesCollectionId.value) {
    await fetchQuotes()
  }
}

onMounted(() => {
  initialize()
})
</script>

<template>
  <div class="quote-widget">
    <div v-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading quotes"
      />
    </div>

    <div v-else-if="error" class="error-message">{{ error }}</div>

    <div v-else-if="quotes.length === 0" class="empty-state">
      <p>No quotes found. Please configure quotes in Settings.</p>
    </div>

    <div v-else-if="selectedQuote" class="display-view">
      <div class="quote-content">
        <div class="quote-title">{{ selectedQuote.title }}</div>
        <div v-if="selectedQuote.author" class="quote-author">— {{ selectedQuote.author }}</div>
      </div>

      <!-- Footer with action buttons -->
      <div v-if="!isCompactView" class="widget-footer">
        <button @click="randomizeQuote" class="footer-button" title="Random quote">
          <Shuffle :size="16" />
        </button>
        <button @click="refreshQuotes" class="footer-button" title="Refresh" :disabled="isLoading">
          <RefreshCw :size="16" :class="{ spinning: isLoading }" />
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No quote available</p>
    </div>
  </div>
</template>

<style scoped>
.quote-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
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

.error-message {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--btn-danger-bg);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 12px;
  margin: 16px;
}

.display-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-bottom: 38px; /* Space for footer buttons */
  position: relative;
}

.quote-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
  max-width: 100%;
}

.quote-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.6;
  font-style: italic;
}

.quote-author {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
  margin-top: 8px;
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
