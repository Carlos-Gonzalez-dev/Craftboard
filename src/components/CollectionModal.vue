<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, Search, Settings } from 'lucide-vue-next'
import { listCollections, setApiToken, getApiToken } from '../../utils/craftApi'
import type { Collection } from '../../utils/craftApi'

const emit = defineEmits<{
  'select': [collectionId: string, collectionName: string]
  'close': []
}>()

const collections = ref<Collection[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const showApiTokenForm = ref(false)
const apiToken = ref('')
const step = ref<'token' | 'select'>('token')

onMounted(() => {
  const savedToken = getApiToken()
  if (savedToken) {
    apiToken.value = savedToken
    step.value = 'select'
    loadCollections()
  }
})

const handleApiTokenSubmit = () => {
  if (!apiToken.value.trim()) {
    error.value = 'API token is required'
    return
  }
  
  setApiToken(apiToken.value.trim())
  step.value = 'select'
  loadCollections()
}

const loadCollections = async () => {
  try {
    isLoading.value = true
    error.value = null
    collections.value = await listCollections()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load collections'
    console.error('Error loading collections:', err)
  } finally {
    isLoading.value = false
  }
}

const filteredCollections = () => {
  if (!searchQuery.value.trim()) {
    return collections.value
  }
  
  const query = searchQuery.value.toLowerCase()
  return collections.value.filter(c => 
    c.name.toLowerCase().includes(query) ||
    c.id.toLowerCase().includes(query)
  )
}

const selectCollection = (collection: Collection) => {
  emit('select', collection.id, collection.name)
  emit('close')
}

const resetToken = () => {
  apiToken.value = ''
  step.value = 'token'
  error.value = null
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Configure Collection Widget</h2>
        <button @click="$emit('close')" class="close-btn">
          <X :size="20" />
        </button>
      </div>

      <!-- Step 1: API Token -->
      <div v-if="step === 'token'" class="modal-body">
        <div class="token-form">
          <div class="form-group">
            <label for="api-token">Craft API Token</label>
            <input
              id="api-token"
              v-model="apiToken"
              type="password"
              placeholder="Enter your Craft API token"
              class="token-input"
              @keyup.enter="handleApiTokenSubmit"
            />
            <small class="hint">
              Get your API token from Craft settings. This will be stored locally in your browser.
            </small>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <button @click="handleApiTokenSubmit" class="primary-btn">
            Connect to Craft
          </button>
        </div>
      </div>

      <!-- Step 2: Select Collection -->
      <div v-if="step === 'select'" class="modal-body">
        <div class="search-box">
          <Search :size="18" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search collections..."
            class="search-input"
          />
          <button @click="resetToken" class="reset-token-btn" title="Use different token">
            <Settings :size="16" />
          </button>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div v-if="isLoading" class="loading-state">
          <p>Loading collections...</p>
        </div>

        <div v-else-if="collections.length === 0" class="empty-state">
          <p>No collections found</p>
          <button @click="loadCollections" class="retry-btn">Try Again</button>
        </div>

        <div v-else class="collections-list">
          <div
            v-for="collection in filteredCollections()"
            :key="collection.id"
            @click="selectCollection(collection)"
            class="collection-item"
          >
            <div class="collection-name">{{ collection.name }}</div>
            <div class="collection-meta">
              <span class="item-count">{{ collection.itemCount }} item{{ collection.itemCount !== 1 ? 's' : '' }}</span>
              <span class="document-id">{{ collection.documentId }}</span>
            </div>
          </div>

          <div v-if="filteredCollections().length === 0 && searchQuery" class="no-results">
            No collections match your search
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  border: 3px solid #d4af37;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  font-family: 'Comic Sans MS', cursive, sans-serif;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 3px dashed #d4af37;
  background: linear-gradient(90deg, #fff8dc 0%, #fffacd 100%);
}

.modal-header h2 {
  margin: 0;
  color: #333;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.token-form {
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
  font-weight: bold;
  color: #333;
  font-size: 14px;
}

.token-input {
  padding: 10px 12px;
  border: 2px solid #d4af37;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #333;
  background: white;
}

.token-input:focus {
  outline: none;
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.1);
}

.hint {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.search-box {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: rgba(212, 175, 55, 0.1);
  border: 2px solid #d4af37;
  border-radius: 6px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  color: #333;
}

.search-input::placeholder {
  color: #999;
}

.search-input:focus {
  outline: none;
}

.reset-token-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.reset-token-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.primary-btn,
.retry-btn {
  padding: 10px 16px;
  background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-family: inherit;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.primary-btn:hover,
.retry-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);
}

.error-message {
  padding: 12px;
  background: #ffe0e0;
  border: 2px solid #ff6b6b;
  border-radius: 6px;
  color: #d32f2f;
  font-size: 13px;
  line-height: 1.4;
}

.loading-state,
.empty-state,
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #666;
  text-align: center;
  gap: 12px;
}

.collections-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.collection-item {
  padding: 12px;
  background: white;
  border: 2px solid #d4af37;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.collection-item:hover {
  background: #fffacd;
  border-color: #ff6b6b;
  transform: translateX(4px);
}

.collection-name {
  font-weight: bold;
  color: #333;
  font-size: 14px;
  margin-bottom: 4px;
}

.collection-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
}

.item-count {
  background: rgba(78, 205, 196, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

.document-id {
  background: rgba(212, 175, 55, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}
</style>
