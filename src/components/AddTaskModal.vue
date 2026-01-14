<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { X, ListTodo, Loader } from 'lucide-vue-next'
import { getSpaceId, fetchAndCacheSpaceId } from '../utils/craftApi'

const props = defineProps<{
  documentId: string
  documentTitle?: string | null
}>()

const emit = defineEmits<{
  close: []
  added: []
}>()

const taskText = ref('')
const isAdding = ref(false)
const error = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

// Focus input when modal opens
watch(
  () => props.documentId,
  async () => {
    await nextTick()
    inputRef.value?.focus()
  },
  { immediate: true },
)

const getSpace = async (): Promise<string> => {
  let spaceId = getSpaceId()
  if (!spaceId) {
    spaceId = (await fetchAndCacheSpaceId()) || ''
  }
  return spaceId
}

const addTask = async () => {
  if (!taskText.value.trim()) return

  isAdding.value = true
  error.value = null

  try {
    const spaceId = await getSpace()
    if (!spaceId) {
      error.value = 'Space ID not configured. Please set it in Settings.'
      return
    }

    // Build the task markdown: "- [ ] Task text"
    const taskMarkdown = `- [ ] ${taskText.value.trim()}`
    const encodedContent = encodeURIComponent(taskMarkdown)

    // Use createblock URL scheme to append task to the document
    window.location.href = `craftdocs://createblock?parentBlockId=${props.documentId}&spaceId=${spaceId}&content=${encodedContent}&index=9999`

    taskText.value = ''
    emit('added')
    emit('close')
  } catch (err) {
    console.error('Failed to add task:', err)
    error.value = 'Failed to add task. Please try again.'
  } finally {
    isAdding.value = false
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    addTask()
  } else if (event.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
          <div class="modal-header">
            <div class="header-title">
              <ListTodo :size="18" />
              <span>Add Task</span>
            </div>
            <button @click="$emit('close')" class="close-btn">
              <X :size="18" />
            </button>
          </div>

          <div class="modal-body">
            <div v-if="documentTitle" class="document-label">
              Adding to: <strong>{{ documentTitle }}</strong>
            </div>

            <div class="input-wrapper">
              <input
                ref="inputRef"
                v-model="taskText"
                type="text"
                placeholder="Enter task description..."
                class="task-input"
                :disabled="isAdding"
                @keydown="handleKeydown"
              />
            </div>

            <div v-if="error" class="error-message">{{ error }}</div>
          </div>

          <div class="modal-footer">
            <button @click="$emit('close')" class="cancel-btn" :disabled="isAdding">Cancel</button>
            <button
              @click="addTask"
              class="add-btn"
              :disabled="isAdding || !taskText.trim()"
            >
              <Loader v-if="isAdding" :size="14" class="spinning" />
              <span v-else>Add Task</span>
            </button>
          </div>
        </div>
      </div>
  </Teleport>
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
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  width: 90%;
  max-width: 400px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.document-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.document-label strong {
  color: var(--text-primary);
}

.input-wrapper {
  width: 100%;
}

.task-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: all 0.2s;
}

.task-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
}

.task-input::placeholder {
  color: var(--text-tertiary);
}

.task-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  padding: 10px 12px;
  background: rgba(244, 63, 94, 0.1);
  border: 1px solid rgba(244, 63, 94, 0.3);
  border-radius: 6px;
  color: var(--btn-danger-bg);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-primary);
}

.cancel-btn,
.add-btn {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cancel-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
}

.cancel-btn:hover:not(:disabled) {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.add-btn {
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border: none;
  color: white;
  min-width: 100px;
}

.add-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.add-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
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
</style>
