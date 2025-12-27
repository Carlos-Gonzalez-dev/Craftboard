<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Widget } from '../../types/widget'
import { Plus, Check, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  widget: Widget
}>()

interface Note {
  id: string
  text: string
  completed: boolean
}

const notes = ref<Note[]>(props.widget.data?.notes || [])
const newNoteText = ref('')

const addNote = () => {
  if (newNoteText.value.trim()) {
    notes.value.push({
      id: Date.now().toString(),
      text: newNoteText.value.trim(),
      completed: false,
    })
    newNoteText.value = ''
  }
}

const toggleNote = (id: string) => {
  const note = notes.value.find((n) => n.id === id)
  if (note) {
    note.completed = !note.completed
  }
}

const deleteNote = (id: string) => {
  notes.value = notes.value.filter((n) => n.id !== id)
}

watch(
  notes,
  (newValue) => {
    localStorage.setItem(`widget-${props.widget.id}`, JSON.stringify(newValue))
  },
  { deep: true },
)

// Load from localStorage
const saved = localStorage.getItem(`widget-${props.widget.id}`)
if (saved) {
  try {
    notes.value = JSON.parse(saved)
  } catch {
    // ignore parse errors
  }
}
</script>

<template>
  <div class="notes-widget">
    <div class="add-note">
      <input
        v-model="newNoteText"
        @keyup.enter="addNote"
        type="text"
        placeholder="Add a checklist item..."
        class="note-input"
      />
      <button @click="addNote" class="add-button">
        <Plus :size="16" />
      </button>
    </div>

    <div class="notes-list">
      <div
        v-for="note in notes"
        :key="note.id"
        class="note-item"
        :class="{ completed: note.completed }"
      >
        <button @click="toggleNote(note.id)" class="check-button">
          <Check v-if="note.completed" :size="14" />
        </button>
        <span class="note-text">{{ note.text }}</span>
        <button @click="deleteNote(note.id)" class="delete-button">
          <Trash2 :size="14" />
        </button>
      </div>

      <div v-if="notes.length === 0" class="empty-state">
        No checklist items yet. Add one above!
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.add-note {
  display: flex;
  gap: 6px;
}

.note-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  outline: none;
  background: var(--input-bg);
  color: var(--input-text);
}

.note-input:focus {
  border-color: var(--btn-primary-bg);
}

.note-input::placeholder {
  color: var(--text-muted);
}

.add-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.add-button:hover {
  background: var(--btn-primary-hover);
}

.notes-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  transition: background 0.2s ease;
}

.note-item:hover {
  background: var(--bg-primary);
}

.note-item.completed .note-text {
  text-decoration: line-through;
  color: var(--text-muted);
}

.check-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.check-button:hover {
  border-color: var(--btn-primary-bg);
}

.note-item.completed .check-button {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: white;
}

.note-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
}

.delete-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0;
}

.note-item:hover .delete-button {
  opacity: 1;
}

.delete-button:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--btn-danger-bg);
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
