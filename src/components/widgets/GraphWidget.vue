<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { Settings, RefreshCw, Move, Maximize2 } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { useGraphApiStore } from '../../stores/graphApi'
import { getApiUrl, type CraftDocument, type CraftFolder } from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'
import GraphNodeModal from '../GraphNodeModal.vue'
import * as d3 from 'd3'

const props = defineProps<{
  widget: Widget
}>()

const emit = defineEmits<{
  'update:data': [data: any]
  'update:title': [title: string]
}>()

const { isCompactView } = useWidgetView()

const graphApiStore = useGraphApiStore()

// Check if d3 is available
let d3Available = true
try {
  if (typeof d3 === 'undefined') {
    d3Available = false
    console.warn('D3.js not available. Graph visualization will not work.')
  }
} catch {
  d3Available = false
  console.warn('D3.js not available. Graph visualization will not work.')
}

// Get data from store (shared with GraphView)
const documents = computed(() => graphApiStore.documents)
const folders = computed(() => graphApiStore.folders)
const collections = computed(() => graphApiStore.collections)
const tagDocuments = computed(() => graphApiStore.tagDocuments)
const userTags = computed(() => graphApiStore.userTags)
const isLoading = computed(() => graphApiStore.isLoading || graphApiStore.isLoadingTags)
const totalApiCalls = computed(() => graphApiStore.totalApiCalls)
const completedApiCalls = computed(() => graphApiStore.completedApiCalls)

// Read user tags from localStorage for UI (when store not yet loaded)
const TAGS_STORAGE_KEY = 'craftboard-tags'
const availableTags = computed(() => {
  if (userTags.value.length > 0) return userTags.value
  try {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY)
    if (stored) return JSON.parse(stored) as string[]
  } catch {
    // Ignore
  }
  return []
})

// State
const error = ref<string | null>(null)
const isConfiguring = ref(false)
const configStep = ref<'mode' | 'select'>('mode')
const showLabels = ref(true)
const selectedNode = ref<GraphNode | null>(null)

const hasApiConfig = computed(() => !!getApiUrl())

// Widget mode and configuration
const widgetMode = computed(() => props.widget.data?.mode as 'folder' | 'tag' | undefined)
const isConfigured = computed(() => {
  if (widgetMode.value === 'folder') return !!props.widget.data?.rootId
  if (widgetMode.value === 'tag') return !!props.widget.data?.tagName
  return false
})

// Folder mode props
const rootId = computed(() => props.widget.data?.rootId)
const rootTitle = computed(() => props.widget.data?.rootTitle || '')

// Tag mode props
const selectedTagName = computed(() => props.widget.data?.tagName as string | undefined)

// Graph types
interface GraphNode {
  id: string
  type: 'document' | 'folder' | 'collection' | 'tag' | 'dailyNote'
  label: string
  data: CraftDocument | CraftFolder | any
}

interface GraphLink {
  source: string
  target: string
  type: 'contains' | 'hasCollection' | 'hasTag'
}

// Helper to format daily note date
const formatDailyNoteLabel = (dateStr: string): string => {
  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// Find folder and all its descendants
const findFolderWithDescendants = (
  folderList: CraftFolder[],
  targetId: string,
): { folder: CraftFolder | null; allFolderIds: Set<string> } => {
  const allFolderIds = new Set<string>()

  const findFolder = (folders: CraftFolder[]): CraftFolder | null => {
    for (const folder of folders) {
      if (folder.id === targetId) {
        // Found the target, collect all descendant IDs
        const collectDescendants = (f: CraftFolder) => {
          allFolderIds.add(f.id)
          if (f.folders) {
            f.folders.forEach(collectDescendants)
          }
        }
        collectDescendants(folder)
        return folder
      }
      if (folder.folders) {
        const found = findFolder(folder.folders)
        if (found) return found
      }
    }
    return null
  }

  const folder = findFolder(folderList)
  return { folder, allFolderIds }
}

// Computed graph nodes for FOLDER mode
const graphNodesForFolder = computed<GraphNode[]>(() => {
  if (!rootId.value) return []

  const nodes: GraphNode[] = []
  const nodeIds = new Set<string>()

  const { folder: rootFolder, allFolderIds } = findFolderWithDescendants(
    folders.value,
    rootId.value,
  )
  if (!rootFolder) return []

  // Add folder nodes
  const addFolderNodes = (folder: CraftFolder) => {
    if (!nodeIds.has(folder.id)) {
      nodes.push({
        id: folder.id,
        type: 'folder',
        label: folder.name,
        data: folder,
      })
      nodeIds.add(folder.id)
    }
    if (folder.folders) {
      folder.folders.forEach(addFolderNodes)
    }
  }
  addFolderNodes(rootFolder)

  // Add documents that belong to these folders
  documents.value.forEach((doc) => {
    if (doc.folderId && allFolderIds.has(doc.folderId) && !nodeIds.has(doc.id)) {
      const label = doc.dailyNoteDate ? formatDailyNoteLabel(doc.dailyNoteDate) : doc.title
      nodes.push({
        id: doc.id,
        type: doc.dailyNoteDate ? 'dailyNote' : 'document',
        label: label,
        data: doc,
      })
      nodeIds.add(doc.id)
    }
  })

  // Add collections for documents in the graph
  const documentIdsInGraph = new Set(nodes.filter((n) => n.type === 'document').map((n) => n.id))
  collections.value.forEach((collection) => {
    if (documentIdsInGraph.has(collection.documentId) && !nodeIds.has(collection.id)) {
      nodes.push({
        id: collection.id,
        type: 'collection',
        label: collection.name,
        data: collection,
      })
      nodeIds.add(collection.id)
    }
  })

  // Add tag nodes for documents in this graph
  const tagsInGraph = new Set<string>()
  tagDocuments.value.forEach((docInfo) => {
    if (documentIdsInGraph.has(docInfo.documentId)) {
      docInfo.tags.forEach((tag) => tagsInGraph.add(tag))
    }
  })
  tagsInGraph.forEach((tag) => {
    const tagNodeId = `tag:${tag}`
    if (!nodeIds.has(tagNodeId)) {
      nodes.push({
        id: tagNodeId,
        type: 'tag',
        label: `#${tag}`,
        data: { tag },
      })
      nodeIds.add(tagNodeId)
    }
  })

  return nodes
})

// Computed graph links for FOLDER mode
const graphLinksForFolder = computed<GraphLink[]>(() => {
  if (!rootId.value) return []

  const links: GraphLink[] = []
  const nodeIds = new Set(graphNodesForFolder.value.map((n) => n.id))

  // Folder hierarchy links
  const addFolderLinks = (folder: CraftFolder) => {
    if (folder.folders) {
      folder.folders.forEach((subfolder) => {
        if (nodeIds.has(folder.id) && nodeIds.has(subfolder.id)) {
          links.push({ source: folder.id, target: subfolder.id, type: 'contains' })
        }
        addFolderLinks(subfolder)
      })
    }
  }
  const { folder: rootFolder } = findFolderWithDescendants(folders.value, rootId.value)
  if (rootFolder) addFolderLinks(rootFolder)

  // Folder -> Document links
  documents.value.forEach((doc) => {
    if (doc.folderId && nodeIds.has(doc.folderId) && nodeIds.has(doc.id)) {
      links.push({ source: doc.folderId, target: doc.id, type: 'contains' })
    }
  })

  // Document -> Collection links
  collections.value.forEach((collection) => {
    if (nodeIds.has(collection.documentId) && nodeIds.has(collection.id)) {
      links.push({ source: collection.documentId, target: collection.id, type: 'hasCollection' })
    }
  })

  // Document -> Tag links
  tagDocuments.value.forEach((docInfo) => {
    if (nodeIds.has(docInfo.documentId)) {
      docInfo.tags.forEach((tag) => {
        const tagNodeId = `tag:${tag}`
        if (nodeIds.has(tagNodeId)) {
          links.push({ source: docInfo.documentId, target: tagNodeId, type: 'hasTag' })
        }
      })
    }
  })

  return links
})

// Computed graph nodes for TAG mode
const graphNodesForTag = computed<GraphNode[]>(() => {
  if (!selectedTagName.value) return []

  const nodes: GraphNode[] = []
  const nodeIds = new Set<string>()

  // Add the selected tag as the central node
  const tagNodeId = `tag:${selectedTagName.value}`
  nodes.push({
    id: tagNodeId,
    type: 'tag',
    label: `#${selectedTagName.value}`,
    data: { tag: selectedTagName.value },
  })
  nodeIds.add(tagNodeId)

  // Add all documents that have this tag
  tagDocuments.value.forEach((docInfo) => {
    if (docInfo.tags.includes(selectedTagName.value!) && !nodeIds.has(docInfo.documentId)) {
      // Get full document info for dailyNoteDate
      const fullDoc = documents.value.find((d) => d.id === docInfo.documentId)
      const dailyNoteDate = docInfo.dailyNoteDate || fullDoc?.dailyNoteDate
      const title = fullDoc?.title || docInfo.title
      const label = dailyNoteDate ? formatDailyNoteLabel(dailyNoteDate) : title

      nodes.push({
        id: docInfo.documentId,
        type: dailyNoteDate ? 'dailyNote' : 'document',
        label: label,
        data: fullDoc || { id: docInfo.documentId, title },
      })
      nodeIds.add(docInfo.documentId)
    }
  })

  // Add other tags that appear in these documents
  const documentIdsInGraph = new Set(nodes.filter((n) => n.type === 'document').map((n) => n.id))
  tagDocuments.value.forEach((docInfo) => {
    if (documentIdsInGraph.has(docInfo.documentId)) {
      docInfo.tags.forEach((tag) => {
        if (tag !== selectedTagName.value) {
          const otherTagNodeId = `tag:${tag}`
          if (!nodeIds.has(otherTagNodeId)) {
            nodes.push({
              id: otherTagNodeId,
              type: 'tag',
              label: `#${tag}`,
              data: { tag },
            })
            nodeIds.add(otherTagNodeId)
          }
        }
      })
    }
  })

  return nodes
})

// Computed graph links for TAG mode
const graphLinksForTag = computed<GraphLink[]>(() => {
  if (!selectedTagName.value) return []

  const links: GraphLink[] = []
  const nodeIds = new Set(graphNodesForTag.value.map((n) => n.id))

  tagDocuments.value.forEach((docInfo) => {
    if (nodeIds.has(docInfo.documentId)) {
      docInfo.tags.forEach((tag) => {
        const tagNodeId = `tag:${tag}`
        if (nodeIds.has(tagNodeId)) {
          links.push({ source: docInfo.documentId, target: tagNodeId, type: 'hasTag' })
        }
      })
    }
  })

  return links
})

// Final computed nodes and links based on mode
const graphNodes = computed<GraphNode[]>(() => {
  if (widgetMode.value === 'tag') return graphNodesForTag.value
  if (widgetMode.value === 'folder') return graphNodesForFolder.value
  return []
})

const graphLinks = computed<GraphLink[]>(() => {
  if (widgetMode.value === 'tag') return graphLinksForTag.value
  if (widgetMode.value === 'folder') return graphLinksForFolder.value
  return []
})

// D3 rendering
const svgRef = ref<SVGSVGElement | null>(null)
let simulation: d3.Simulation<any, any> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

// Color constants from GraphView
import { HEADER_COLORS } from '../../constants/colors'

function extractColor(gradient: string): string {
  const match = gradient.match(/#[0-9a-fA-F]{6}/)
  return match ? match[0] : '#6366f1'
}

const nodeColors = {
  document: extractColor(HEADER_COLORS[0]!.gradient),
  folder: extractColor(HEADER_COLORS[1]!.gradient),
  collection: extractColor(HEADER_COLORS[6]!.gradient),
  dailyNote: extractColor(HEADER_COLORS[4]!.gradient),
  tag: extractColor(HEADER_COLORS[8]!.gradient),
  root: extractColor(HEADER_COLORS[1]!.gradient),
}

function renderGraph() {
  if (!svgRef.value || graphNodes.value.length === 0 || !d3Available) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const width = svgRef.value.clientWidth || 400
  const height = svgRef.value.clientHeight || 300

  const g = svg.append('g')

  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoomBehavior)

  const nodes = graphNodes.value.map((n) => ({ ...n }))
  const links = graphLinks.value.map((l) => ({
    source: typeof l.source === 'string' ? l.source : l.source,
    target: typeof l.target === 'string' ? l.target : l.target,
    type: l.type,
  }))

  simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: any) => d.id)
        .distance(60),
    )
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(25))

  const link = g
    .append('g')
    .attr('stroke', 'var(--border-secondary)')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke-width', 1.5)

  const nodeGroup = g
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'pointer')
    .call(
      d3
        .drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0)
          d.fx = null
          d.fy = null
        }) as any,
    )

  nodeGroup.each(function (d: any) {
    const group = d3.select(this)
    const isRoot = d.id === rootId.value || d.id === `tag:${selectedTagName.value}`
    const color = nodeColors[d.type as keyof typeof nodeColors] || '#6b7280'

    const radiusMap: Record<string, number> = {
      document: 8,
      folder: 10,
      collection: 9,
      dailyNote: 8,
      tag: 7,
    }
    const radius = isRoot ? 12 : radiusMap[d.type] || 8

    group
      .append('circle')
      .attr('r', radius)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', isRoot ? 3 : 2)

    if (showLabels.value) {
      group
        .append('text')
        .text(d.label)
        .attr('x', 0)
        .attr('y', radius + 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('fill', 'var(--text-secondary)')
        .style('pointer-events', 'none')
    }
  })

  nodeGroup.on('click', async (_event, d: any) => {
    // Show modal for the clicked node
    const clickedNode = graphNodes.value.find((n) => n.id === d.id)
    if (clickedNode) {
      selectedNode.value = clickedNode
    }
  })

  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)

    nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
  })

  // Initial zoom to fit
  setTimeout(() => fitAll(), 100)
}

function centerGraph() {
  if (!svgRef.value || !zoomBehavior) return
  const svg = d3.select(svgRef.value)
  const width = svgRef.value.clientWidth || 400
  const height = svgRef.value.clientHeight || 300
  svg
    .transition()
    .duration(300)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2))
}

function fitAll() {
  if (!svgRef.value || !zoomBehavior || graphNodes.value.length === 0) return
  const svg = d3.select(svgRef.value)
  const width = svgRef.value.clientWidth || 400
  const height = svgRef.value.clientHeight || 300

  const nodes = graphNodes.value
  if (nodes.length === 0) return

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  nodes.forEach((n: any) => {
    if (n.x !== undefined && n.y !== undefined) {
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y)
      maxY = Math.max(maxY, n.y)
    }
  })

  if (minX === Infinity) return

  const padding = 50
  const graphWidth = maxX - minX + padding * 2
  const graphHeight = maxY - minY + padding * 2
  const scale = Math.min(width / graphWidth, height / graphHeight, 1.5)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  svg
    .transition()
    .duration(300)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity
        .translate(width / 2 - centerX * scale, height / 2 - centerY * scale)
        .scale(scale),
    )
}

// Flatten folders for selection list
const allFoldersList = computed(() => {
  const flattenFolders = (
    folderList: CraftFolder[],
    depth = 0,
  ): Array<{ id: string; name: string; depth: number }> => {
    const result: Array<{ id: string; name: string; depth: number }> = []
    folderList.forEach((folder) => {
      result.push({ id: folder.id, name: folder.name, depth })
      if (folder.folders && folder.folders.length > 0) {
        result.push(...flattenFolders(folder.folders, depth + 1))
      }
    })
    return result
  }
  return flattenFolders(folders.value)
})

// Load all data (shared with GraphView)
const loadAllData = async (forceRefresh = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  try {
    await Promise.all([
      graphApiStore.initializeGraph(forceRefresh),
      graphApiStore.fetchTagRelations(forceRefresh),
    ])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch data'
    console.error('Error fetching data:', e)
  }
}

// Mode selection
const selectMode = (mode: 'folder' | 'tag') => {
  emit('update:data', { ...props.widget.data, mode })
  configStep.value = 'select'
}

// Folder selection
const selectRoot = async (folder: { id: string; name: string }) => {
  emit('update:data', { mode: 'folder', rootId: folder.id, rootTitle: folder.name })
  emit('update:title', folder.name)
  isConfiguring.value = false
  configStep.value = 'mode'

  await nextTick()
  setTimeout(() => {
    if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
      renderGraph()
    }
  }, 100)
}

// Tag selection
const selectTag = async (tag: string) => {
  emit('update:data', { mode: 'tag', tagName: tag })
  emit('update:title', `#${tag}`)
  isConfiguring.value = false
  configStep.value = 'mode'

  await nextTick()
  setTimeout(() => {
    if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
      renderGraph()
    }
  }, 100)
}

const reconfigure = () => {
  isConfiguring.value = true
  configStep.value = 'mode'
}

const refresh = async () => {
  await loadAllData(true)
  await nextTick()
  if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
    renderGraph()
  }
}

// Watch for graph changes to re-render
watch(
  () => [graphNodes.value.length, isConfigured.value],
  () => {
    if (d3Available && graphNodes.value.length > 0 && svgRef.value && !isConfiguring.value) {
      nextTick(() => {
        setTimeout(() => {
          if (svgRef.value && graphNodes.value.length > 0) {
            renderGraph()
          }
        }, 50)
      })
    }
  },
)

watch(showLabels, () => {
  if (d3Available && graphNodes.value.length > 0) {
    renderGraph()
  }
})

watch(isConfiguring, (newVal) => {
  if (!newVal && isConfigured.value && d3Available) {
    nextTick(() => {
      setTimeout(() => {
        if (svgRef.value && graphNodes.value.length > 0) {
          renderGraph()
        }
      }, 100)
    })
  }
})

onMounted(async () => {
  // Always load data (uses shared cache)
  if (hasApiConfig.value) {
    await loadAllData()
  }

  if (!isConfigured.value) {
    isConfiguring.value = true
    configStep.value = 'mode'
  } else {
    // Render graph after data loads
    await nextTick()
    if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
      setTimeout(() => {
        if (svgRef.value) {
          renderGraph()
        }
      }, 50)
    }
  }
})
</script>

<template>
  <div class="graph-widget">
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="isConfiguring" class="config-view">
      <!-- Step 1: Mode selection -->
      <template v-if="configStep === 'mode'">
        <div class="config-header">
          <h3>Select Graph Type</h3>
          <p class="config-description">Choose what to visualize</p>
        </div>

        <div v-if="isLoading" class="loading-state">
          <ProgressIndicator
            :completed="completedApiCalls"
            :total="totalApiCalls"
            message="Loading data"
          />
        </div>

        <div v-else class="mode-selection">
          <div class="mode-item" @click="selectMode('folder')">
            <div class="mode-icon">📁</div>
            <div class="mode-info">
              <div class="mode-name">Folder</div>
              <div class="mode-description">Visualize documents in a folder</div>
            </div>
          </div>
          <div
            class="mode-item"
            :class="{ disabled: availableTags.length === 0 }"
            @click="availableTags.length > 0 && selectMode('tag')"
          >
            <div class="mode-icon">#</div>
            <div class="mode-info">
              <div class="mode-name">Tag</div>
              <div class="mode-description">
                {{ availableTags.length > 0 ? 'Visualize documents by tag' : 'No tags configured' }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 2: Folder selection -->
      <template v-else-if="configStep === 'select' && widgetMode === 'folder'">
        <div class="config-header">
          <h3>Select Folder</h3>
          <p class="config-description">Choose a folder to visualize</p>
          <button class="back-button" @click="configStep = 'mode'">Back</button>
        </div>

        <div v-if="isLoading" class="loading-state">
          <ProgressIndicator
            :completed="completedApiCalls"
            :total="totalApiCalls"
            message="Loading folders"
          />
        </div>

        <div v-else-if="allFoldersList.length > 0" class="folders-list">
          <div
            v-for="folder in allFoldersList"
            :key="folder.id"
            class="folder-item"
            :style="{ paddingLeft: `${12 + folder.depth * 16}px` }"
            @click="selectRoot(folder)"
          >
            <div class="folder-icon">📁</div>
            <div class="folder-name">{{ folder.name }}</div>
          </div>
        </div>

        <div v-else class="no-items">
          <p>No folders available</p>
        </div>
      </template>

      <!-- Step 2: Tag selection -->
      <template v-else-if="configStep === 'select' && widgetMode === 'tag'">
        <div class="config-header">
          <h3>Select Tag</h3>
          <p class="config-description">Choose a tag to visualize</p>
          <button class="back-button" @click="configStep = 'mode'">Back</button>
        </div>

        <div v-if="isLoading" class="loading-state">
          <ProgressIndicator
            :completed="completedApiCalls"
            :total="totalApiCalls"
            message="Loading tags"
          />
        </div>

        <div v-else-if="availableTags.length > 0" class="tags-list">
          <div v-for="tag in availableTags" :key="tag" class="tag-item" @click="selectTag(tag)">
            <div class="tag-icon">#</div>
            <div class="tag-name">{{ tag }}</div>
          </div>
        </div>

        <div v-else class="no-items">
          <p>No tags configured</p>
          <p class="hint">Add tags in the Tags view first</p>
        </div>
      </template>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading graph"
      />
    </div>

    <div v-else-if="!isConfigured" class="empty-state">
      <p>Please configure the widget</p>
    </div>

    <div v-else class="graph-content-wrapper">
      <svg ref="svgRef" class="graph-svg"></svg>

      <div v-if="graphNodes.length === 0" class="empty-graph">
        <p>No nodes to display</p>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="isConfigured && !isLoading && !isCompactView" class="widget-footer">
      <label class="toggle-label">
        <input v-model="showLabels" type="checkbox" />
        <span>Labels</span>
      </label>
      <button
        @click="centerGraph"
        class="footer-button"
        title="Center View"
        :disabled="!d3Available || graphNodes.length === 0"
      >
        <Move :size="16" />
      </button>
      <button
        @click="fitAll"
        class="footer-button"
        title="Fit All"
        :disabled="!d3Available || graphNodes.length === 0"
      >
        <Maximize2 :size="16" />
      </button>
      <button @click="refresh" class="footer-button" title="Refresh data" :disabled="isLoading">
        <RefreshCw :size="16" :class="{ spinning: isLoading }" />
      </button>
      <button @click="reconfigure" class="footer-button" title="Change configuration">
        <Settings :size="16" />
      </button>
    </div>

    <!-- Node Modal -->
    <GraphNodeModal
      :node="selectedNode"
      :nodes="graphNodes"
      :links="graphLinks"
      :node-colors="nodeColors"
      @close="selectedNode = null"
      @node-click="(node) => (selectedNode = node)"
    />
  </div>
</template>

<style scoped>
.graph-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.error-message {
  padding: 16px;
  color: var(--btn-danger-bg);
  text-align: center;
  font-size: 13px;
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
  flex: 1;
}

.config-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
}

.config-header h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-description {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Mode selection */
.mode-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-item:hover:not(.disabled) {
  background-color: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
}

.mode-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-icon {
  font-size: 24px;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

.mode-info {
  flex: 1;
  min-width: 0;
}

.mode-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.mode-description {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Back button */
.back-button {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  width: fit-content;
}

.back-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

/* Folders list */
.folders-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.folder-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
}

.folder-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.folder-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tags list */
.tags-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
}

.tag-icon {
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.tag-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}

.no-items {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.no-items .hint {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.graph-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 38px;
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

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 4px;
}

.toggle-label input[type='checkbox'] {
  cursor: pointer;
  accent-color: var(--btn-primary-bg);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.graph-svg {
  flex: 1;
  width: 100%;
  height: 100%;
  background-color: var(--bg-primary);
}

.empty-graph {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
