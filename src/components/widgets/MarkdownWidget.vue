<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { marked } from 'marked'
import type { Widget } from '../../types/widget'

const props = defineProps<{
  widget: Widget
}>()

const markdown = ref(
  props.widget.data?.markdown || '# Hello!\n\nStart typing your markdown here...',
)
const isEditing = ref(true)

const html = computed(() => {
  try {
    return marked(markdown.value)
  } catch {
    return markdown.value
  }
})

watch(markdown, (newValue) => {
  // Save to localStorage or widget data
  localStorage.setItem(`widget-${props.widget.id}`, newValue)
})

// Load from localStorage
const saved = localStorage.getItem(`widget-${props.widget.id}`)
if (saved) {
  markdown.value = saved
}
</script>

<template>
  <div class="markdown-widget">
    <div class="toggle-buttons">
      <button :class="{ active: isEditing }" @click="isEditing = true" class="toggle-button">
        Edit
      </button>
      <button :class="{ active: !isEditing }" @click="isEditing = false" class="toggle-button">
        Preview
      </button>
    </div>

    <textarea
      v-if="isEditing"
      v-model="markdown"
      class="markdown-editor"
      placeholder="Write your markdown here..."
    />

    <div v-else class="markdown-preview" v-html="html" />
  </div>
</template>

<style scoped>
.markdown-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toggle-buttons {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  width: fit-content;
}

.toggle-button {
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-button:hover {
  color: var(--text-secondary);
}

.toggle-button.active {
  background: var(--bg-secondary);
  color: var(--btn-primary-bg);
  box-shadow: 0 1px 2px var(--shadow-light);
}

.markdown-editor {
  flex: 1;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: none;
  outline: none;
  background: var(--input-bg);
  color: var(--input-text);
}

.markdown-editor:focus {
  border-color: var(--btn-primary-bg);
}

.markdown-preview {
  flex: 1;
  overflow: auto;
  line-height: 1.6;
  color: var(--text-primary);
}

.markdown-preview :deep(h1) {
  font-size: 20px;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.markdown-preview :deep(h2) {
  font-size: 17px;
  font-weight: 600;
  margin-top: 16px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.markdown-preview :deep(h3) {
  font-size: 14px;
  font-weight: 600;
  margin-top: 12px;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.markdown-preview :deep(p) {
  margin-bottom: 10px;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin-bottom: 10px;
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin-bottom: 4px;
}

.markdown-preview :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}

.markdown-preview :deep(pre) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 10px;
}

.markdown-preview :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-preview :deep(a) {
  color: var(--btn-primary-bg);
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.markdown-preview :deep(a:hover) {
  opacity: 0.8;
  text-decoration: underline;
}

.markdown-preview :deep(a:visited) {
  color: var(--btn-primary-bg);
}

.markdown-preview :deep(blockquote) {
  margin: 10px 0;
  padding-left: 12px;
  border-left: 3px solid var(--border-primary);
  color: var(--text-secondary);
}

.markdown-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-primary);
  margin: 16px 0;
}

.markdown-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 10px;
}

.markdown-preview :deep(table th),
.markdown-preview :deep(table td) {
  border: 1px solid var(--border-primary);
  padding: 6px 12px;
  text-align: left;
}

.markdown-preview :deep(table th) {
  background: var(--bg-tertiary);
  font-weight: 600;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
</style>
