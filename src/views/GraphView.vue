<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onActivated, onUnmounted, inject, h } from 'vue'
import {
  getApiUrl,
  getSpaceId,
  getCraftLinkPreference,
  buildCraftAppLink,
  buildCraftWebLink,
} from '../utils/craftApi'
import type { CraftDocument, CraftFolder } from '../utils/craftApi'
import * as d3 from 'd3'
import { useRoute } from 'vue-router'
import { RefreshCw, Maximize2, Move, Settings, X, Network, PanelRightOpen } from 'lucide-vue-next'
import ViewSubheader from '../components/ViewSubheader.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'
import { useGraphApiStore } from '../stores/graphApi'

const route = useRoute()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

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

// Store computed properties
const documents = computed(() => graphApiStore.documents)
const folders = computed(() => graphApiStore.folders)
const collections = computed(() => graphApiStore.collections)
const isLoading = computed(() => graphApiStore.isLoading)
const totalApiCalls = computed(() => graphApiStore.totalApiCalls)
const completedApiCalls = computed(() => graphApiStore.completedApiCalls)

// UI State
const error = ref<string | null>(null)
const lastFetchedAt = ref<Date | null>(null)

// Filters
const showDocuments = ref(true)
const showFolders = ref(true)
const showCollections = ref(true)
const showDailyNotes = ref(true)
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
  type: 'document' | 'folder' | 'collection' | 'dailyNote'
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
  type: 'contains' | 'hasCollection'
}

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

// Use widget header colors - extract solid colors from gradients
const HEADER_COLORS = [
  { name: 'Indigo', gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' },
  { name: 'Purple', gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' },
  { name: 'Pink', gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' },
  { name: 'Rose', gradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)' },
  { name: 'Orange', gradient: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' },
  { name: 'Amber', gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' },
  { name: 'Green', gradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)' },
  { name: 'Teal', gradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)' },
  { name: 'Cyan', gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)' },
  { name: 'Blue', gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
  { name: 'Violet', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' },
  { name: 'Fuchsia', gradient: 'linear-gradient(135deg, #d946ef 0%, #a21caf 100%)' },
]

// Extract first color from gradient
const extractColor = (gradient: string): string => {
  const match = gradient.match(/#[0-9a-fA-F]{6}/)
  return match ? match[0] : '#6366f1'
}

const nodeColors = {
  document: extractColor(HEADER_COLORS[0].gradient), // Indigo
  folder: extractColor(HEADER_COLORS[1].gradient), // Purple
  collection: extractColor(HEADER_COLORS[6].gradient), // Green
  dailyNote: extractColor(HEADER_COLORS[4].gradient), // Orange
  root: extractColor(HEADER_COLORS[1].gradient), // Purple
}

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

  // Filter orphan nodes if option is disabled
  if (!showOrphanNodes.value) {
    const tempLinks: GraphLink[] = []
    const nodeIds = new Set(nodes.map((n) => n.id))

    const addFolderLinks = (parentFolder: CraftFolder) => {
      if (parentFolder.folders && parentFolder.folders.length > 0) {
        parentFolder.folders.forEach((subfolder) => {
          if (nodeIds.has(parentFolder.id) && nodeIds.has(subfolder.id)) {
            tempLinks.push({ source: parentFolder.id, target: subfolder.id, type: 'contains' })
          }
          addFolderLinks(subfolder)
        })
      }
    }
    folders.value.forEach(addFolderLinks)

    documents.value.forEach((doc) => {
      if (!doc.dailyNoteDate && doc.folderId && nodeIds.has(doc.folderId) && nodeIds.has(doc.id)) {
        tempLinks.push({ source: doc.folderId, target: doc.id, type: 'contains' })
      }
    })

    collections.value.forEach((collection) => {
      if (nodeIds.has(collection.documentId) && nodeIds.has(collection.id)) {
        tempLinks.push({
          source: collection.documentId,
          target: collection.id,
          type: 'hasCollection',
        })
      }
    })

    const connectedNodeIds = new Set<string>()
    tempLinks.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      if (sourceId !== '__root__' && targetId !== '__root__') {
        connectedNodeIds.add(sourceId)
        connectedNodeIds.add(targetId)
      }
    })

    // Always include root node if it exists and showRootNode is enabled
    if (showRootNode.value && nodeIds.has('__root__')) {
      connectedNodeIds.add('__root__')
    }

    return nodes.filter((node) => connectedNodeIds.has(node.id))
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

  try {
    await graphApiStore.initializeGraph(forceRefresh)
    lastFetchedAt.value = new Date()

    // Trigger graph render after data loads
    await nextTick()
    if (visualizationType.value === 'force' && d3Available && graphNodes.value.length > 0) {
      renderGraph()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch data'
    console.error('Error fetching data:', e)
  }
}

const refreshData = async () => {
  await graphApiStore.refreshGraph()
  lastFetchedAt.value = new Date()

  // Trigger graph render after refresh
  await nextTick()
  if (visualizationType.value === 'force' && d3Available && graphNodes.value.length > 0) {
    renderGraph()
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

function getNodeColor(node: GraphNode): string {
  const isRootNode = node.id === '__root__'
  const nodeType = node.type as keyof typeof nodeColors
  return isRootNode ? nodeColors.root : nodeColors[nodeType] || '#6b7280'
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
  // Get all links where this node is the target
  const backlinks: { node: GraphNode; type: string }[] = []

  graphLinks.value.forEach((link) => {
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id

    if (targetId === node.id) {
      const sourceNode = graphNodes.value.find((n) => n.id === sourceId)
      if (sourceNode) {
        backlinks.push({ node: sourceNode, type: link.type })
      }
    }
  })

  return backlinks
}

function getExternalLinks(node: GraphNode): { node: GraphNode; type: string }[] {
  // Get all links where this node is the source
  const externalLinks: { node: GraphNode; type: string }[] = []

  graphLinks.value.forEach((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id

    if (sourceId === node.id) {
      const targetNode = graphNodes.value.find((n) => n.id === targetId)
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
        // Use clickableLink if available (contains correct document ID and share token)
        if (doc.clickableLink) {
          return doc.clickableLink
        }
        return buildCraftWebLink(node.id, spaceId)
      }
      return buildCraftAppLink(node.id, spaceId)
    }
    case 'folder':
      // Folders only support app links
      return `craftdocs://openfolder?folderId=${node.id}&spaceId=${spaceId}&title=${encodeURIComponent(node.label)}`
    case 'collection': {
      // Use collection's own ID (block ID) for links
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
        // Use clickableLink if available (contains correct document ID and share token)
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
      // Fallback to app link
      const appLink = buildCraftAppLink(node.id, spaceId)
      if (appLink) {
        window.location.href = appLink
      }
      break
    }
    case 'folder':
      // Folders only support app links
      const folderLink = `craftdocs://openfolder?folderId=${node.id}&spaceId=${spaceId}&title=${encodeURIComponent(node.label)}`
      window.location.href = folderLink
      break
    case 'collection': {
      // Use collection's own ID (block ID) for links
      if (preference === 'web') {
        const webLink = buildCraftWebLink(node.id, spaceId)
        if (webLink) {
          window.open(webLink, '_blank')
          return
        }
      }
      // Fallback to app link
      const appLink = buildCraftAppLink(node.id, spaceId)
      if (appLink) {
        window.location.href = appLink
      }
      break
    }
  }
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
            disabled: !d3Available.value,
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
            disabled: !d3Available.value,
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
            disabled: !d3Available.value,
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
            disabled: !d3Available.value,
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

    <div v-else-if="isLoading" class="loading-message">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading data"
      />
    </div>

    <div v-else-if="graphNodes.length === 0" class="empty-message">
      <p>No data to display</p>
      <p class="empty-hint">Check your API URL and filters</p>
    </div>

    <div v-else class="graph-content-wrapper">
      <div class="graph-container">
        <svg ref="svgRef" class="graph-svg"></svg>
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

      <!-- Sidebar - Right side -->
      <Transition name="slide-right">
        <aside v-show="showSidebar && !error" class="sidebar">
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

    <!-- Node Details Modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="selectedNode" class="node-modal-overlay" @click.self="selectedNode = null">
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div v-if="selectedNode" class="node-modal">
            <!-- Modal Header with Accent Bar -->
            <div
              class="node-modal-accent"
              :style="{ backgroundColor: getNodeColor(selectedNode) }"
            ></div>

            <div class="node-modal-header">
              <div class="node-modal-title-section">
                <div
                  class="node-modal-icon"
                  :style="{ backgroundColor: getNodeColor(selectedNode) }"
                >
                  <!-- Document Icon -->
                  <svg
                    v-if="selectedNode.type === 'document' || selectedNode.type === 'dailyNote'"
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
                    v-else-if="selectedNode.type === 'folder'"
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
                    v-else-if="selectedNode.type === 'collection'"
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
                </div>
                <div class="node-modal-title-content">
                  <h2 class="node-modal-title">{{ selectedNode.label }}</h2>
                  <div class="node-modal-badge-container">
                    <span
                      class="node-modal-badge"
                      :style="{
                        backgroundColor: getNodeColor(selectedNode) + '20',
                        color: getNodeColor(selectedNode),
                      }"
                    >
                      {{ selectedNode.type }}
                    </span>
                  </div>
                </div>
              </div>
              <button @click="selectedNode = null" class="node-modal-close">
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
              <div v-if="getNodeDates(selectedNode).length > 0" class="node-modal-section">
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
                    v-for="date in getNodeDates(selectedNode)"
                    :key="date.label"
                    class="node-modal-date-item"
                  >
                    <span class="node-modal-date-label">{{ date.label }}</span>
                    <span class="node-modal-date-value">{{ date.value }}</span>
                  </div>
                </div>
              </div>

              <!-- Backlinks Section -->
              <div v-if="getBacklinks(selectedNode).length > 0" class="node-modal-section">
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
                  <span class="node-modal-section-count">{{
                    getBacklinks(selectedNode).length
                  }}</span>
                </div>
                <div class="node-modal-links-list">
                  <button
                    v-for="link in getBacklinks(selectedNode)"
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
              <div v-if="getExternalLinks(selectedNode).length > 0" class="node-modal-section">
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
                  <span class="node-modal-section-count">{{
                    getExternalLinks(selectedNode).length
                  }}</span>
                </div>
                <div class="node-modal-links-list">
                  <button
                    v-for="link in getExternalLinks(selectedNode)"
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
              <div v-if="getCraftLink(selectedNode)" class="node-modal-actions">
                <button @click="openCraftLink(selectedNode)" class="node-modal-open-button">
                  <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Open in Craft
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
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
