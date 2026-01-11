<script setup lang="ts">
import { computed } from 'vue'
import type { CraftDocument, CraftFolder } from '../utils/craftApi'
import {
  getSpaceId,
  getCraftLinkPreference,
  buildCraftAppLink,
  buildCraftWebLink,
} from '../utils/craftApi'

interface GraphNode {
  id: string
  type: 'document' | 'folder' | 'collection' | 'tag' | 'dailyNote'
  label: string
  data: CraftDocument | CraftFolder | any
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'contains' | 'hasCollection' | 'hasTag'
}

const props = defineProps<{
  node: GraphNode | null
  nodes: GraphNode[]
  links: GraphLink[]
  nodeColors: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
  'node-click': [node: GraphNode]
}>()

function getNodeColor(node: GraphNode): string {
  const nodeType = node.type as keyof typeof props.nodeColors
  return props.nodeColors[nodeType] || '#6b7280'
}

function getNodeDates(node: GraphNode): Array<{ label: string; value: string }> {
  const dates: Array<{ label: string; value: string }> = []
  const data = node.data as any

  if (data.lastModifiedAt) {
    dates.push({
      label: 'Last Modified',
      value: new Date(data.lastModifiedAt).toLocaleString(),
    })
  }
  if (data.createdAt) {
    dates.push({
      label: 'Created',
      value: new Date(data.createdAt).toLocaleString(),
    })
  }
  if (data.dailyNoteDate) {
    dates.push({
      label: 'Date',
      value: new Date(data.dailyNoteDate).toLocaleDateString(),
    })
  }

  return dates
}

function getBacklinks(node: GraphNode): { node: GraphNode; type: string }[] {
  const backlinks: { node: GraphNode; type: string }[] = []

  props.links.forEach((link) => {
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id

    if (targetId === node.id) {
      const sourceNode = props.nodes.find((n) => n.id === sourceId)
      if (sourceNode) {
        backlinks.push({ node: sourceNode, type: link.type })
      }
    }
  })

  return backlinks
}

function getExternalLinks(node: GraphNode): { node: GraphNode; type: string }[] {
  const externalLinks: { node: GraphNode; type: string }[] = []

  props.links.forEach((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id

    if (sourceId === node.id) {
      const targetNode = props.nodes.find((n) => n.id === targetId)
      if (targetNode) {
        externalLinks.push({ node: targetNode, type: link.type })
      }
    }
  })

  return externalLinks
}

function getCraftLink(node: GraphNode): string | null {
  const spaceId = getSpaceId()
  if (!spaceId) return null

  const data = node.data as CraftDocument | { documentId?: string }
  const preference = getCraftLinkPreference()

  switch (node.type) {
    case 'document':
    case 'dailyNote': {
      const doc = data as CraftDocument
      if (preference === 'web') {
        if (doc.clickableLink) {
          return doc.clickableLink
        }
        return buildCraftWebLink(node.id, spaceId)
      }
      return buildCraftAppLink(node.id, spaceId)
    }
    case 'folder':
      return `craftdocs://openfolder?folderId=${node.id}&spaceId=${spaceId}&title=${encodeURIComponent(node.label)}`
    case 'collection': {
      if (preference === 'web') {
        return buildCraftWebLink(node.id, spaceId)
      }
      return buildCraftAppLink(node.id, spaceId)
    }
    default:
      return null
  }
}

function openCraftLink(node: GraphNode) {
  const spaceId = getSpaceId()
  if (!spaceId) {
    alert('Could not retrieve Space ID. Please configure it manually in Settings.')
    return
  }

  const preference = getCraftLinkPreference()
  const data = node.data as CraftDocument | { documentId?: string }

  switch (node.type) {
    case 'document':
    case 'dailyNote': {
      const doc = data as CraftDocument
      if (preference === 'web') {
        if (doc.clickableLink) {
          window.open(doc.clickableLink, '_blank')
          return
        }
        const webLink = buildCraftWebLink(node.id, spaceId)
        if (webLink) {
          window.open(webLink, '_blank')
          return
        }
      }
      const appLink = buildCraftAppLink(node.id, spaceId)
      if (appLink) {
        window.location.href = appLink
      }
      break
    }
    case 'folder': {
      const folderLink = `craftdocs://openfolder?folderId=${node.id}&spaceId=${spaceId}&title=${encodeURIComponent(node.label)}`
      window.location.href = folderLink
      break
    }
    case 'collection': {
      if (preference === 'web') {
        const webLink = buildCraftWebLink(node.id, spaceId)
        if (webLink) {
          window.open(webLink, '_blank')
          return
        }
      }
      const appLink = buildCraftAppLink(node.id, spaceId)
      if (appLink) {
        window.location.href = appLink
      }
      break
    }
  }
}

function handleNodeClick(node: GraphNode) {
  emit('node-click', node)
}
</script>

<template>
  <div v-if="node" class="node-modal-overlay" @click.self="emit('close')">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="node" class="node-modal">
        <!-- Modal Header with Accent Bar -->
        <div class="node-modal-accent" :style="{ backgroundColor: getNodeColor(node) }"></div>

        <div class="node-modal-header">
          <div class="node-modal-title-section">
            <div class="node-modal-icon" :style="{ backgroundColor: getNodeColor(node) }">
              <!-- Document Icon -->
              <svg
                v-if="node.type === 'document' || node.type === 'dailyNote'"
                class="icon-large"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <!-- Folder Icon -->
              <svg
                v-else-if="node.type === 'folder'"
                class="icon-large"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <!-- Collection Icon -->
              <svg
                v-else-if="node.type === 'collection'"
                class="icon-large"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <!-- Tag Icon -->
              <svg
                v-else-if="node.type === 'tag'"
                class="icon-large"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            </div>
            <div class="node-modal-title-content">
              <h2 class="node-modal-title">{{ node.label }}</h2>
              <div class="node-modal-badge-container">
                <span
                  class="node-modal-badge"
                  :style="{
                    backgroundColor: getNodeColor(node) + '20',
                    color: getNodeColor(node),
                  }"
                >
                  {{ node.type }}
                </span>
              </div>
            </div>
          </div>
          <button @click="emit('close')" class="node-modal-close">
            <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="node-modal-content">
          <!-- Dates Section -->
          <div v-if="getNodeDates(node).length > 0" class="node-modal-section">
            <div class="node-modal-section-header">
              <svg class="icon-small" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 class="node-modal-section-title">Timeline</h3>
            </div>
            <div class="node-modal-dates-list">
              <div
                v-for="date in getNodeDates(node)"
                :key="date.label"
                class="node-modal-date-item"
              >
                <span class="node-modal-date-label">{{ date.label }}</span>
                <span class="node-modal-date-value">{{ date.value }}</span>
              </div>
            </div>
          </div>

          <!-- Backlinks Section -->
          <div v-if="getBacklinks(node).length > 0" class="node-modal-section">
            <div class="node-modal-section-header">
              <svg class="icon-small" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
              <h3 class="node-modal-section-title">Referenced By</h3>
              <span class="node-modal-section-count">{{ getBacklinks(node).length }}</span>
            </div>
            <div class="node-modal-links-list">
              <button
                v-for="link in getBacklinks(node)"
                :key="link.node.id"
                @click="handleNodeClick(link.node)"
                class="node-modal-link-item"
              >
                <div
                  class="node-modal-link-dot"
                  :style="{ backgroundColor: getNodeColor(link.node) }"
                ></div>
                <div class="node-modal-link-content">
                  <div class="node-modal-link-title">{{ link.node.label }}</div>
                  <div class="node-modal-link-type">{{ link.node.type }}</div>
                </div>
                <svg
                  class="icon-small node-modal-link-arrow"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- External Links Section -->
          <div v-if="getExternalLinks(node).length > 0" class="node-modal-section">
            <div class="node-modal-section-header">
              <svg class="icon-small" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
              <h3 class="node-modal-section-title">Links To</h3>
              <span class="node-modal-section-count">{{ getExternalLinks(node).length }}</span>
            </div>
            <div class="node-modal-links-list">
              <button
                v-for="link in getExternalLinks(node)"
                :key="link.node.id"
                @click="handleNodeClick(link.node)"
                class="node-modal-link-item"
              >
                <div
                  class="node-modal-link-dot"
                  :style="{ backgroundColor: getNodeColor(link.node) }"
                ></div>
                <div class="node-modal-link-content">
                  <div class="node-modal-link-title">{{ link.node.label }}</div>
                  <div class="node-modal-link-type">{{ link.node.type }}</div>
                </div>
                <svg
                  class="icon-small node-modal-link-arrow"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Open in Craft Button -->
          <div v-if="getCraftLink(node)" class="node-modal-actions">
            <button @click="openCraftLink(node)" class="node-modal-open-button">
              <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              <span>Open in Craft</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Node Modal Styles */
.node-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.node-modal {
  background-color: var(--bg-secondary);
  border-radius: 16px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.3),
    0 10px 10px -5px rgba(0, 0, 0, 0.2);
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-modal-accent {
  height: 4px;
  width: 100%;
}

.node-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid var(--border-primary);
}

.node-modal-title-section {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
}

.node-modal-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.icon-large {
  width: 28px;
  height: 28px;
}

.node-modal-title-content {
  flex: 1;
}

.node-modal-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.node-modal-badge-container {
  display: flex;
  gap: 8px;
}

.node-modal-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-modal-close {
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-modal-close:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.node-modal-close .icon {
  width: 20px;
  height: 20px;
}

.node-modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.node-modal-section {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-primary);
}

.node-modal-section:last-child {
  border-bottom: none;
}

.node-modal-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.icon-small {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
}

.node-modal-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-modal-section-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

.node-modal-dates-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-modal-date-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.node-modal-date-label {
  color: var(--text-secondary);
}

.node-modal-date-value {
  color: var(--text-primary);
  font-weight: 500;
}

.node-modal-links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-modal-link-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  width: 100%;
}

.node-modal-link-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
}

.node-modal-link-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.node-modal-link-content {
  flex: 1;
  min-width: 0;
}

.node-modal-link-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-modal-link-type {
  font-size: 11px;
  color: var(--text-tertiary);
}

.node-modal-link-arrow {
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}

.node-modal-link-item:hover .node-modal-link-arrow {
  transform: translateX(2px);
}

.node-modal-actions {
  padding: 20px 24px;
}

.node-modal-open-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 20px;
  background-color: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-modal-open-button:hover {
  background-color: var(--btn-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.node-modal-open-button:active {
  transform: translateY(0);
}

.node-modal-open-button .icon {
  width: 18px;
  height: 18px;
}
</style>
