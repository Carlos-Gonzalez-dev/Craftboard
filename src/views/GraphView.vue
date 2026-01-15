<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onActivated, onUnmounted, inject, h } from 'vue'
import { getApiUrl } from '../utils/craftApi'
import type { CraftDocument, CraftFolder } from '../utils/craftApi'
import * as d3 from 'd3'
import { useRoute } from 'vue-router'
import { RefreshCw, Maximize2, Move, Settings, X, Network, PanelRightOpen } from 'lucide-vue-next'
import SubheaderButton from '../components/SubheaderButton.vue'
import GraphNodeModal from '../components/GraphNodeModal.vue'
import { useGraphApiStore } from '../stores/graphApi'
import { useGlobalLoadingStore } from '../stores/globalLoading'

const route = useRoute()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

const graphApiStore = useGraphApiStore()
const globalLoadingStore = useGlobalLoadingStore()

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

// Store computed properties
const documents = computed(() => graphApiStore.documents)
const folders = computed(() => graphApiStore.folders)
const collections = computed(() => graphApiStore.collections)
const tagDocuments = computed(() => graphApiStore.tagDocuments)
const userTags = computed(() => graphApiStore.userTags)
const isLoading = computed(() => graphApiStore.isLoading || graphApiStore.isLoadingTags)
const totalApiCalls = computed(() => graphApiStore.totalApiCalls)
const completedApiCalls = computed(() => graphApiStore.completedApiCalls)

// Check if we have data loaded
const hasLoadedData = computed(() => documents.value.length > 0 || folders.value.length > 0)
const showInitialSkeleton = computed(() => isLoading.value && !hasLoadedData.value)

// UI State
const error = ref<string | null>(null)
const lastFetchedAt = ref<Date | null>(null)

// Filters
const showDocuments = ref(true)
const showFolders = ref(true)
const showCollections = ref(true)
const showDailyNotes = ref(true)
const showTags = ref(true)
const searchQuery = ref('')
const currentSearchIndex = ref(0)
const showLabels = ref(true)
const showRootNode = ref(false)
const showOrphanNodes = ref(false)
const visualizationType = ref<'force' | 'tree'>('force')

// Layout settings
const LAYOUT_PREFIX = 'graph-layout-'
function loadNumber(key: string, fallback: number) {
  const v = localStorage.getItem(LAYOUT_PREFIX + key)
  if (v === null || v === undefined) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const linkDistance = ref(loadNumber('linkDistance', 70))
const chargeStrength = ref(loadNumber('chargeStrength', -120))
const collisionRadius = ref(loadNumber('collisionRadius', 24))
const centerPull = ref(loadNumber('centerPull', 0.02))

// UI State
const showSidebar = ref(true)
const showOpenButton = ref(false)
const svgRef = ref<SVGSVGElement | null>(null)
const selectedNode = ref<GraphNode | null>(null)

// Watch showSidebar to delay button appearance until transition completes
watch(
  showSidebar,
  (newValue) => {
    if (!newValue) {
      // Wait for sidebar close transition (0.25s) before showing button
      setTimeout(() => {
        showOpenButton.value = true
      }, 250)
    } else {
      // Hide button immediately when sidebar opens
      showOpenButton.value = false
    }
  },
  { immediate: true },
)

// Graph types
interface GraphNode {
  id: string
  type: 'document' | 'folder' | 'collection' | 'dailyNote' | 'tag'
  label: string
  data: CraftDocument | CraftFolder | any
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'contains' | 'hasCollection' | 'hasTag'
}

import { HEADER_COLORS } from '../constants/colors'

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

// Extract first color from gradient
const extractColor = (gradient: string): string => {
  const match = gradient.match(/#[0-9a-fA-F]{6}/)
  return match ? match[0] : '#6366f1'
}

const nodeColors = {
  document: extractColor(HEADER_COLORS[0]!.gradient), // Indigo
  folder: extractColor(HEADER_COLORS[1]!.gradient), // Purple
  collection: extractColor(HEADER_COLORS[6]!.gradient), // Green
  dailyNote: extractColor(HEADER_COLORS[4]!.gradient), // Orange
  tag: extractColor(HEADER_COLORS[8]!.gradient), // Cyan
  root: extractColor(HEADER_COLORS[1]!.gradient), // Purple
}

// Compute globally connected nodes (independent of filters)
// This determines which nodes are "orphans" based on ALL data, not filtered data
const globallyConnectedNodes = computed<Set<string>>(() => {
  const connectedIds = new Set<string>()

  // Add folder hierarchy links
  const addFolderLinks = (parentFolder: CraftFolder) => {
    if (parentFolder.folders && parentFolder.folders.length > 0) {
      parentFolder.folders.forEach((subfolder) => {
        // Skip daily notes folders
        if (subfolder.id === 'daily_notes' || subfolder.id.startsWith('daily_notes_year_')) {
          return
        }
        connectedIds.add(parentFolder.id)
        connectedIds.add(subfolder.id)
        addFolderLinks(subfolder)
      })
    }
  }
  folders.value.forEach(addFolderLinks)

  // Add document-folder links (exclude daily notes folders)
  documents.value.forEach((doc) => {
    if (
      doc.folderId &&
      doc.folderId !== 'daily_notes' &&
      !doc.folderId.startsWith('daily_notes_year_')
    ) {
      connectedIds.add(doc.folderId)
      connectedIds.add(doc.id)
    }
  })

  // Add collection-document links
  collections.value.forEach((collection) => {
    connectedIds.add(collection.documentId)
    connectedIds.add(collection.id)
  })

  // Add tag-document links
  tagDocuments.value.forEach((docInfo) => {
    if (docInfo.tags.length > 0) {
      connectedIds.add(docInfo.documentId)
      docInfo.tags.forEach((tag) => {
        connectedIds.add(`tag:${tag}`)
      })
    }
  })

  return connectedIds
})

// Computed
const graphNodes = computed<GraphNode[]>(() => {
  const nodes: GraphNode[] = []

  if (showRootNode.value) {
    nodes.push({
      id: '__root__',
      type: 'folder',
      label: 'Root',
      data: { id: '__root__', name: 'Root', documentCount: 0 } as CraftFolder,
    })
  }

  if (showDocuments.value) {
    const docs = documents.value.filter((doc) => !doc.dailyNoteDate)
    docs.forEach((doc) => {
      nodes.push({
        id: doc.id,
        type: 'document',
        label: doc.title,
        data: doc,
      })
    })
  }

  if (showDailyNotes.value) {
    const dailyNotes = documents.value.filter((doc) => doc.dailyNoteDate)
    dailyNotes.forEach((doc) => {
      let label = doc.title
      if (doc.dailyNoteDate) {
        const date = new Date(doc.dailyNoteDate)
        label = date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      }
      nodes.push({
        id: doc.id,
        type: 'dailyNote',
        label: label,
        data: doc,
      })
    })
  }

  if (showFolders.value) {
    const foldersList: CraftFolder[] = []
    const addFolderNodes = (folder: CraftFolder) => {
      if (folder.id === 'daily_notes' || folder.id.startsWith('daily_notes_year_')) {
        return
      }
      foldersList.push(folder)
      folder.folders?.forEach(addFolderNodes)
    }
    folders.value.forEach(addFolderNodes)

    foldersList.forEach((folder) => {
      nodes.push({
        id: folder.id,
        type: 'folder',
        label: folder.name,
        data: folder,
      })
    })
  }

  if (showCollections.value) {
    collections.value.forEach((collection) => {
      nodes.push({
        id: collection.id,
        type: 'collection',
        label: collection.name,
        data: collection,
      })
    })
  }

  // Add tag nodes
  if (showTags.value && userTags.value.length > 0) {
    userTags.value.forEach((tag) => {
      nodes.push({
        id: `tag:${tag}`,
        type: 'tag',
        label: `#${tag}`,
        data: { tag },
      })
    })
  }

  // Filter orphan nodes if option is disabled
  // Use globally connected nodes (independent of current filters)
  if (!showOrphanNodes.value) {
    return nodes.filter((node) => {
      // Always include root node if enabled
      if (node.id === '__root__') return true
      // Check if node is connected in the global graph (before filters)
      return globallyConnectedNodes.value.has(node.id)
    })
  }

  return nodes
})

const graphLinks = computed<GraphLink[]>(() => {
  const links: GraphLink[] = []
  const visibleNodeIds = new Set(graphNodes.value.map((node) => node.id))

  if (showFolders.value) {
    const addFolderLinks = (parentFolder: CraftFolder) => {
      if (parentFolder.folders && parentFolder.folders.length > 0) {
        parentFolder.folders.forEach((subfolder) => {
          if (visibleNodeIds.has(parentFolder.id) && visibleNodeIds.has(subfolder.id)) {
            links.push({
              source: parentFolder.id,
              target: subfolder.id,
              type: 'contains',
            })
          }
          addFolderLinks(subfolder)
        })
      }
    }
    folders.value.forEach(addFolderLinks)
  }

  if (showFolders.value && showDocuments.value) {
    documents.value.forEach((doc) => {
      if (
        !doc.dailyNoteDate &&
        doc.folderId &&
        visibleNodeIds.has(doc.folderId) &&
        visibleNodeIds.has(doc.id)
      ) {
        links.push({
          source: doc.folderId,
          target: doc.id,
          type: 'contains',
        })
      }
    })
  }

  if (showCollections.value) {
    collections.value.forEach((collection) => {
      const doc = documents.value.find((d) => d.id === collection.documentId)
      if (!doc) return

      const isDailyNote = !!doc.dailyNoteDate
      const shouldShowDocument = isDailyNote ? showDailyNotes.value : showDocuments.value

      if (
        shouldShowDocument &&
        visibleNodeIds.has(collection.documentId) &&
        visibleNodeIds.has(collection.id)
      ) {
        links.push({
          source: collection.documentId,
          target: collection.id,
          type: 'hasCollection',
        })
      }
    })
  }

  // Add tag links (document -> tag)
  if (showTags.value) {
    tagDocuments.value.forEach((docInfo) => {
      // Check if the document node is visible
      if (!visibleNodeIds.has(docInfo.documentId)) return

      docInfo.tags.forEach((tag) => {
        const tagNodeId = `tag:${tag}`
        if (visibleNodeIds.has(tagNodeId)) {
          links.push({
            source: docInfo.documentId,
            target: tagNodeId,
            type: 'hasTag',
          })
        }
      })
    })
  }

  if (showRootNode.value && visibleNodeIds.has('__root__')) {
    const nodesWithIncomingLinks = new Set<string>()
    links.forEach((link) => {
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      nodesWithIncomingLinks.add(targetId)
    })

    graphNodes.value.forEach((node) => {
      if (node.id !== '__root__' && !nodesWithIncomingLinks.has(node.id)) {
        links.push({
          source: '__root__',
          target: node.id,
          type: 'contains',
        })
      }
    })
  }

  return links
})

const searchResults = computed(() => {
  const search = searchQuery.value.toLowerCase().trim()
  if (!search) return []
  return graphNodes.value.filter((node) => node.label.toLowerCase().includes(search))
})

const totalNodesCount = computed(() => {
  let count = 0
  if (showDocuments.value) {
    count += documents.value.filter((doc) => !doc.dailyNoteDate).length
  }
  if (showDailyNotes.value) {
    count += documents.value.filter((doc) => doc.dailyNoteDate).length
  }
  if (showFolders.value) {
    const countFolders = (folder: CraftFolder): number => {
      let c = 1
      folder.folders?.forEach((f) => {
        c += countFolders(f)
      })
      return c
    }
    folders.value.forEach((f) => {
      count += countFolders(f)
    })
  }
  if (showCollections.value) count += collections.value.length
  return count
})

const dailyNotesCount = computed(() => {
  return documents.value.filter((doc) => doc.dailyNoteDate).length
})

const timeAgo = computed(() => {
  if (!lastFetchedAt.value) return 'never'
  const seconds = Math.floor((Date.now() - lastFetchedAt.value.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
})

// Functions
const fetchAllData = async (forceRefresh = false) => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    error.value = 'Craft API URL not configured. Please configure it in Settings.'
    return
  }

  globalLoadingStore.startLoading('graph-view')
  try {
    // Fetch graph data and tag relations in parallel
    await Promise.all([
      graphApiStore.initializeGraph(forceRefresh),
      graphApiStore.fetchTagRelations(forceRefresh),
    ])
    lastFetchedAt.value = new Date()

    // Trigger graph render after data loads
    await nextTick()
    if (visualizationType.value === 'force' && d3Available && graphNodes.value.length > 0) {
      renderGraph()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch data'
    console.error('Error fetching data:', e)
  } finally {
    globalLoadingStore.stopLoading('graph-view')
  }
}

const refreshData = async () => {
  globalLoadingStore.startLoading('graph-view')
  try {
    // Refresh graph data and tag relations in parallel
    await Promise.all([graphApiStore.refreshGraph(), graphApiStore.refreshTagRelations()])
    lastFetchedAt.value = new Date()

    // Trigger graph render after refresh
    await nextTick()
    if (visualizationType.value === 'force' && d3Available && graphNodes.value.length > 0) {
      renderGraph()
    }
  } finally {
    globalLoadingStore.stopLoading('graph-view')
  }
}

// D3 rendering functions
interface D3Node extends GraphNode {
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: D3Node | string
  target: D3Node | string
  type: string
}

function renderGraph() {
  if (!svgRef.value || graphNodes.value.length === 0 || !d3Available) return

  const width = svgRef.value.clientWidth || window.innerWidth
  const height = svgRef.value.clientHeight || window.innerHeight

  // Get text color from CSS variable
  const textColor =
    getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() ||
    '#0f172a'

  const svg = d3.select(svgRef.value)

  // Save current zoom transform before clearing
  let currentTransform: d3.ZoomTransform | null = null
  if (zoomBehavior) {
    currentTransform = d3.zoomTransform(svgRef.value)
  }

  svg.selectAll('*').remove()

  const nodes: D3Node[] = [...graphNodes.value]
  const links: D3Link[] = graphLinks.value.map((link) => ({ ...link, type: link.type }))

  const g = svg.append('g').attr('class', 'graph-content')

  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoomBehavior)

  // Restore previous zoom transform if it existed and was modified
  if (currentTransform) {
    const isIdentity =
      currentTransform.k === 1 && currentTransform.x === 0 && currentTransform.y === 0
    if (!isIdentity) {
      svg.call(zoomBehavior.transform, currentTransform)
    }
  }

  simulation = d3
    .forceSimulation<D3Node, D3Link>(nodes)
    .force(
      'link',
      d3
        .forceLink<D3Node, D3Link>(links)
        .id((d) => d.id)
        .distance(linkDistance.value),
    )
    .force('charge', d3.forceManyBody<D3Node>().strength(chargeStrength.value))
    .force('center', d3.forceCenter<D3Node>(width / 2, height / 2))
    .force('collision', d3.forceCollide<D3Node>().radius(collisionRadius.value))
    .force('x', d3.forceX<D3Node>(width / 2).strength(centerPull.value))
    .force('y', d3.forceY<D3Node>(height / 2).strength(centerPull.value))

  const link = g
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', '#6b7280')
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.6)

  const node = g
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation()
      handleNodeClick(d)
    })
    .call(
      d3
        .drag<SVGGElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended),
    )

  node.each(function (d: D3Node) {
    const g = d3.select(this as SVGGElement)
    const isRootNode = d.id === '__root__'
    const nodeType = d.type as keyof typeof nodeColors
    const color = isRootNode ? nodeColors.root : nodeColors[nodeType] || '#6b7280'

    const radiusMap: Record<string, number> = {
      document: 8,
      folder: 10,
      collection: 9,
      dailyNote: 8,
      tag: 7,
    }
    const radius = isRootNode ? 14 : radiusMap[d.type] || 8

    // Extract stroke color from the fill color (lighter version)
    const strokeColor = color.replace('#', '')
    const r = parseInt(strokeColor.substring(0, 2), 16)
    const gVal = parseInt(strokeColor.substring(2, 4), 16)
    const b = parseInt(strokeColor.substring(4, 6), 16)
    const lighterColor = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, gVal + 40)}, ${Math.min(255, b + 40)}, 0.5)`

    g.append('circle')
      .attr('r', radius)
      .attr('fill', color)
      .attr('stroke', lighterColor)
      .attr('stroke-width', isRootNode ? 3 : 2)
  })

  if (showLabels.value) {
    node
      .append('text')
      .text((d: D3Node) => {
        const label = d.label
        const maxLength = d.type === 'dailyNote' || d.type === 'folder' ? 50 : 30
        return label.length > maxLength ? label.substring(0, maxLength) + '...' : label
      })
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', textColor)
  }

  node.append('title').text((d: D3Node) => d.label)

  simulation.on('tick', () => {
    link
      .attr('x1', (d: D3Link) => (d.source as D3Node).x || 0)
      .attr('y1', (d: D3Link) => (d.source as D3Node).y || 0)
      .attr('x2', (d: D3Link) => (d.target as D3Node).x || 0)
      .attr('y2', (d: D3Link) => (d.target as D3Node).y || 0)

    node.attr('transform', (d: D3Node) => `translate(${d.x || 0},${d.y || 0})`)
  })
}

function dragstarted(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  if (!event.active && simulation) simulation.alphaTarget(0.3).restart()
  if (event.subject) {
    event.subject.fx = event.subject.x
    event.subject.fy = event.subject.y
  }
}

function dragged(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  if (event.subject) {
    event.subject.fx = event.x
    event.subject.fy = event.y
  }
}

function dragended(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  if (!event.active && simulation) simulation.alphaTarget(0)
  if (event.subject) {
    event.subject.fx = null
    event.subject.fy = null
  }
}

function centerGraph() {
  if (!svgRef.value || !zoomBehavior) return
  const svg = d3.select(svgRef.value)
  svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity)
}

function fitAll() {
  if (!svgRef.value || !zoomBehavior || !simulation) return

  const svg = d3.select(svgRef.value)
  const simulationNodes = simulation.nodes()

  if (simulationNodes.length === 0) return

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity

  simulationNodes.forEach((d) => {
    if (d.x !== undefined && d.y !== undefined) {
      minX = Math.min(minX, d.x)
      maxX = Math.max(maxX, d.x)
      minY = Math.min(minY, d.y)
      maxY = Math.max(maxY, d.y)
    }
  })

  if (!isFinite(minX)) return

  const width = svgRef.value.clientWidth || window.innerWidth
  const height = svgRef.value.clientHeight || window.innerHeight

  const padding = 50
  const graphWidth = maxX - minX + padding * 2
  const graphHeight = maxY - minY + padding * 2

  const scale = Math.min(width / graphWidth, height / graphHeight, 4)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const transform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(scale)
    .translate(-centerX, -centerY)

  svg.transition().duration(750).call(zoomBehavior.transform, transform)
}

function handleNodeClick(node: GraphNode) {
  selectedNode.value = node
}
// Watch for theme changes and re-render graph
watch(
  () => document.documentElement.getAttribute('data-theme'),
  () => {
    if (visualizationType.value === 'force' && d3Available && graphNodes.value.length > 0) {
      nextTick(() => {
        renderGraph()
      })
    }
  },
)

onMounted(() => {
  fetchAllData()
  if (registerRefresh) {
    registerRefresh(String(route.name), refreshData)
  }

  // Register subheader
  if (setSubheader && !error.value) {
    setSubheader({
      right: () => [
        h(
          SubheaderButton,
          {
            disabled: !d3Available,
            title: 'Center view',
            onClick: centerGraph,
          },
          {
            default: () => h(Move, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            disabled: !d3Available,
            title: 'Fit all',
            onClick: fitAll,
          },
          {
            default: () => h(Maximize2, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            title: 'Settings',
            onClick: () => {
              showSidebar.value = true
            },
          },
          {
            default: () => h(Settings, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            title: 'Refresh',
            disabled: isLoading.value,
            onClick: refreshData,
          },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

onUnmounted(() => {
  if (setSubheader) {
    setSubheader(null)
  }
})

onActivated(() => {
  if (documents.value.length === 0) {
    fetchAllData()
  }
  // Re-register subheader
  if (setSubheader && !error.value) {
    setSubheader({
      right: () => [
        h(
          SubheaderButton,
          {
            disabled: !d3Available,
            title: 'Center view',
            onClick: centerGraph,
          },
          {
            default: () => h(Move, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            disabled: !d3Available,
            title: 'Fit all',
            onClick: fitAll,
          },
          {
            default: () => h(Maximize2, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            title: 'Settings',
            onClick: () => {
              showSidebar.value = true
            },
          },
          {
            default: () => h(Settings, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          {
            title: 'Refresh',
            disabled: isLoading.value,
            onClick: refreshData,
          },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

// Watch for data changes and re-render
watch(
  () => [graphNodes.value.length, isLoading.value],
  () => {
    if (!isLoading.value && graphNodes.value.length > 0) {
      nextTick(() => {
        if (visualizationType.value === 'force' && d3Available) {
          renderGraph()
        }
      })
    }
  },
  { immediate: true },
)

watch(
  () => visualizationType.value,
  () => {
    nextTick(() => {
      if (visualizationType.value === 'force') {
        renderGraph()
      }
    })
  },
)

watch(
  () => [linkDistance.value, chargeStrength.value, collisionRadius.value, centerPull.value],
  () => {
    nextTick(() => {
      if (visualizationType.value === 'force') {
        renderGraph()
      }
    })
  },
)

watch(
  () => showLabels.value,
  () => {
    nextTick(() => {
      if (visualizationType.value === 'force') {
        renderGraph()
      }
    })
  },
)

// Enable layout persistence
watch([linkDistance, chargeStrength, collisionRadius, centerPull], ([ld, cs, cr, cp]) => {
  localStorage.setItem(LAYOUT_PREFIX + 'linkDistance', String(ld))
  localStorage.setItem(LAYOUT_PREFIX + 'chargeStrength', String(cs))
  localStorage.setItem(LAYOUT_PREFIX + 'collisionRadius', String(cr))
  localStorage.setItem(LAYOUT_PREFIX + 'centerPull', String(cp))
})

// Expose controls
defineExpose({ centerGraph, fitAll })
</script>

<template>
  <div class="graph-view">
    <div v-if="error" class="error-container">
      <Network :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ error }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <div v-else class="graph-content-wrapper">
      <div class="graph-container">
        <!-- Initial Loading Skeleton -->
        <div v-if="showInitialSkeleton" class="loading-message">
          <div class="skeleton-graph">
            <Network :size="48" class="skeleton-icon" />
            <p>Loading graph data...</p>
          </div>
        </div>

        <div v-else-if="graphNodes.length === 0 && !isLoading" class="empty-message">
          <p>No data to display</p>
          <p class="empty-hint">Check your API URL and filters</p>
        </div>

        <svg v-else ref="svgRef" class="graph-svg"></svg>

        <!-- Open sidebar button - appears when sidebar is closed -->
        <Transition name="fade">
          <button
            v-if="showOpenButton && !error"
            @click="showSidebar = true"
            class="open-sidebar-button"
            title="Open sidebar"
          >
            <PanelRightOpen :size="20" />
          </button>
        </Transition>
      </div>

      <!-- Sidebar - Right side (always available when not in error state) -->
      <Transition name="slide-right">
        <aside v-show="showSidebar" class="sidebar">
          <div class="sidebar-header">
            <h3>Graph Settings</h3>
            <button @click="showSidebar = false" class="close-button" title="Close sidebar">
              <X :size="20" />
            </button>
          </div>
          <div class="sidebar-content">
            <!-- Filters -->
            <div class="sidebar-section">
              <h4 class="section-title">Filters</h4>
              <div class="filter-group">
                <label class="filter-checkbox">
                  <input v-model="showDocuments" type="checkbox" />
                  <span>Documents ({{ documents.filter((d) => !d.dailyNoteDate).length }})</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showFolders" type="checkbox" />
                  <span>Folders ({{ folders.length }})</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showCollections" type="checkbox" />
                  <span>Collections ({{ collections.length }})</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showDailyNotes" type="checkbox" />
                  <span>Daily Notes ({{ dailyNotesCount }})</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showTags" type="checkbox" />
                  <span>Tags ({{ userTags.length }})</span>
                </label>
              </div>
            </div>

            <!-- Display Options -->
            <div class="sidebar-section">
              <h4 class="section-title">Display</h4>
              <div class="filter-group">
                <label class="filter-checkbox">
                  <input v-model="showLabels" type="checkbox" />
                  <span>Show Labels</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showRootNode" type="checkbox" />
                  <span>Show Root Node</span>
                </label>
                <label class="filter-checkbox">
                  <input v-model="showOrphanNodes" type="checkbox" />
                  <span>Show Orphan Nodes</span>
                </label>
              </div>
            </div>

            <!-- Stats -->
            <div class="sidebar-section">
              <h4 class="section-title">Statistics</h4>
              <div class="stats-group">
                <div class="stat-item">
                  <span class="stat-label">Visible Nodes:</span>
                  <span class="stat-value">{{ graphNodes.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Nodes:</span>
                  <span class="stat-value">{{ totalNodesCount }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Links:</span>
                  <span class="stat-value">{{ graphLinks.length }}</span>
                </div>
                <div v-if="lastFetchedAt" class="stat-item">
                  <span class="stat-label">Updated:</span>
                  <span class="stat-value">{{ timeAgo }}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </Transition>
    </div>

    <!-- Node Modal -->
    <GraphNodeModal
      :node="selectedNode"
      :nodes="graphNodes"
      :links="graphLinks"
      :node-colors="nodeColors"
      @close="selectedNode = null"
      @node-click="handleNodeClick"
    />
  </div>
</template>

<style scoped>
.graph-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: var(--bg-primary);
  background-image:
    linear-gradient(var(--bg-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px);
  background-size: 40px 40px;
  overflow: hidden;
}

.error-container,
.loading-message,
.empty-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

.error-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.error-container h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.error-container p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.settings-link {
  margin-top: 8px;
  padding: 8px 16px;
  background: var(--btn-primary-bg);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s ease;
}

.settings-link:hover {
  background: var(--btn-primary-hover);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}

.skeleton-graph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--text-tertiary);
}

.skeleton-icon {
  opacity: 0.5;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.3; }
}

.graph-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  width: 100%;
  position: relative;
}

.graph-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  position: relative;
}

.graph-svg {
  width: 100%;
  height: 100%;
}

.sidebar {
  position: relative;
  width: 320px;
  min-width: 320px;
  background-color: var(--bg-secondary);
  border-left: 1px solid var(--border-primary);
  z-index: 40;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 280px;
    min-width: 280px;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
  }
}

.sidebar-content {
  padding: 0;
  color: var(--text-primary);
  flex: 1;
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-primary);
  background-color: var(--bg-tertiary);
  flex-shrink: 0;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-button {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.open-sidebar-button {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.open-sidebar-button:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--btn-primary-bg);
}

.close-button .icon {
  width: 20px;
  height: 20px;
}

.sidebar-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-primary);
}

.sidebar-section:last-child {
  border-bottom: none;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button:hover:not(:disabled) {
  background-color: var(--btn-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.refresh-button {
  background-color: var(--btn-secondary-bg);
}

.action-button.refresh-button:hover:not(:disabled) {
  background-color: var(--btn-secondary-hover);
}

.action-button .icon {
  width: 16px;
  height: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-primary);
  transition: color 0.2s ease;
}

.filter-checkbox:hover {
  color: var(--text-secondary);
}

.filter-checkbox input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--btn-primary-bg);
}

.stats-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}

.stat-label {
  color: var(--text-secondary);
}

.stat-value {
  color: var(--text-primary);
  font-weight: 600;
}

.slide-right-enter-active {
  transition: transform 0.3s ease;
}

.slide-right-leave-active {
  transition: transform 0.25s ease;
}

.slide-right-enter-from {
  transform: translateX(100%);
}

.slide-right-leave-to {
  transform: translateX(100%);
}

/* Fade transition for open sidebar button */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Node Modal Styles */
.node-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 16px;
}

.node-modal {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  border-radius: 16px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.3),
    0 10px 10px -5px rgba(0, 0, 0, 0.2);
  max-width: 48rem;
  width: 100%;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-primary);
}

.node-modal-accent {
  height: 6px;
  width: 100%;
}

.node-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px;
  padding-bottom: 16px;
}

.node-modal-title-section {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.node-modal-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(0, 0, 0, 0.2);
}

.icon-large {
  width: 24px;
  height: 24px;
  color: white;
}

.node-modal-title-content {
  flex: 1;
}

.node-modal-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  line-height: 1.2;
}

.node-modal-badge-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-modal-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.node-modal-close {
  padding: 10px;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-modal-close:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  transform: rotate(90deg);
}

.node-modal-close .icon {
  width: 20px;
  height: 20px;
}

.node-modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.node-modal-section {
  background-color: var(--bg-tertiary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-primary);
}

.node-modal-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.icon-small {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

.node-modal-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.node-modal-section-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
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
  font-size: 14px;
  padding: 6px 0;
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
  gap: 6px;
}

.node-modal-link-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--bg-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.node-modal-link-item:hover {
  background-color: var(--bg-secondary);
  transform: translateX(4px);
}

.node-modal-link-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid var(--border-primary);
}

.node-modal-link-content {
  flex: 1;
  min-width: 0;
}

.node-modal-link-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-modal-link-type {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.node-modal-link-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.node-modal-link-item:hover .node-modal-link-arrow {
  color: var(--text-primary);
  transform: translateX(4px);
}

.node-modal-actions {
  padding-top: 8px;
}

.node-modal-open-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);
}

.node-modal-open-button:hover {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  box-shadow: 0 6px 12px rgba(37, 99, 235, 0.4);
  transform: scale(1.02);
}

.node-modal-open-button:active {
  transform: scale(0.98);
}

.node-modal-open-button .icon {
  width: 20px;
  height: 20px;
}
</style>
