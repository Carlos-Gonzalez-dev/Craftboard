<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { Settings, RefreshCw, Loader, Move, Maximize2 } from 'lucide-vue-next'
import type { Widget } from '../../types/widget'
import { useWidgetView } from '../../composables/useWidgetView'
import { useGraphApiStore } from '../../stores/graphApi'
import {
  getApiUrl,
  fetchDocuments,
  listCollections,
  openCraftLink,
  buildCraftAppLink,
  buildCraftWebLink,
  getCraftLinkPreference,
  getSpaceId,
  getCacheExpiryMs,
  type CraftDocument,
  type CraftFolder,
} from '../../utils/craftApi'
import ProgressIndicator from '../ProgressIndicator.vue'
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

// Cache keys for folder-specific data (documents/subfolders/collections within a folder)
const FOLDER_DATA_CACHE_PREFIX = 'graph-widget-folder-'
const FOLDERS_CACHE_KEY = 'graph-widget-folders'

// Get data from store
const documents = computed(() => graphApiStore.documents)
const folders = computed(() => graphApiStore.folders)
const collections = computed(() => graphApiStore.collections)

// Cache helpers for folder data (documents, subfolders, collections) - widget-specific cache
function getCachedFolderData(folderId: string) {
  try {
    const cached = localStorage.getItem(FOLDER_DATA_CACHE_PREFIX + folderId)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const cacheExpiryMs = getCacheExpiryMs()
    if (cacheExpiryMs === 0) return null

    const cacheAge = Date.now() - timestamp
    if (cacheAge > cacheExpiryMs) {
      localStorage.removeItem(FOLDER_DATA_CACHE_PREFIX + folderId)
      return null
    }

    return data
  } catch {
    return null
  }
}

function setCachedFolderData(
  folderId: string,
  data: {
    documents: CraftDocument[]
    subfolders: CraftFolder[]
    collections: Array<{ id: string; name: string; documentId: string }>
  },
) {
  try {
    localStorage.setItem(
      FOLDER_DATA_CACHE_PREFIX + folderId,
      JSON.stringify({ data, timestamp: Date.now() }),
    )
  } catch {
    // Ignore cache errors
  }
}

function clearCache() {
  localStorage.removeItem(FOLDERS_CACHE_KEY)
  // Clear all folder data caches
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(FOLDER_DATA_CACHE_PREFIX)) {
      localStorage.removeItem(key)
    }
  })
}

// State
const selectedFolderData = ref<{
  documents: CraftDocument[]
  subfolders: CraftFolder[]
  collections: Array<{ id: string; name: string; documentId: string }>
}>({
  documents: [],
  subfolders: [],
  collections: [],
})
const isLoading = ref(false)
const error = ref<string | null>(null)
const isConfiguring = ref(false)
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

const hasApiConfig = computed(() => !!getApiUrl())
const isConfigured = computed(() => !!props.widget.data?.rootId)

// Root selection
const rootId = computed(() => props.widget.data?.rootId)
const rootType = computed(() => 'folder' as const)
const rootTitle = computed(() => props.widget.data?.rootTitle || '')

// Graph types
interface GraphNode {
  id: string
  type: 'document' | 'folder' | 'collection'
  label: string
  data: CraftDocument | CraftFolder | any
}

interface GraphLink {
  source: string
  target: string
  type: string
}

// Find root folder in the folders list
const findRootFolder = (folderList: CraftFolder[]): CraftFolder | null => {
  if (!rootId.value) return null
  for (const folder of folderList) {
    if (folder.id === rootId.value) return folder
    if (folder.folders) {
      const found = findRootFolder(folder.folders)
      if (found) return found
    }
  }
  return null
}

// Computed graph nodes and links filtered by root
const graphNodes = computed<GraphNode[]>(() => {
  if (!rootId.value) return []

  const nodes: GraphNode[] = []
  const nodeIds = new Set<string>()

  // Find root folder in the main folders list
  const rootFolder = findRootFolder(folders.value)
  if (!rootFolder) return []

  // Add root folder
  nodes.push({
    id: rootFolder.id,
    type: 'folder',
    label: rootFolder.name,
    data: rootFolder,
  })
  nodeIds.add(rootFolder.id)

  // Add subfolders from selectedFolderData
  const addSubfolders = (subfolders: CraftFolder[]) => {
    subfolders.forEach((subfolder) => {
      if (!nodeIds.has(subfolder.id)) {
        nodes.push({
          id: subfolder.id,
          type: 'folder',
          label: subfolder.name,
          data: subfolder,
        })
        nodeIds.add(subfolder.id)
        // Recursively add nested subfolders if they exist
        if (subfolder.folders && subfolder.folders.length > 0) {
          addSubfolders(subfolder.folders)
        }
      }
    })
  }
  addSubfolders(selectedFolderData.value.subfolders)

  // Add documents from selectedFolderData
  selectedFolderData.value.documents
    .filter((doc) => !doc.dailyNoteDate)
    .forEach((doc) => {
      if (!nodeIds.has(doc.id)) {
        nodes.push({
          id: doc.id,
          type: 'document',
          label: doc.title,
          data: doc,
        })
        nodeIds.add(doc.id)
      }
    })

  // Add collections from selectedFolderData
  const documentIdsInGraph = new Set(nodes.filter((n) => n.type === 'document').map((n) => n.id))

  selectedFolderData.value.collections.forEach((collection) => {
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

  return nodes
})

const graphLinks = computed<GraphLink[]>(() => {
  if (!rootId.value) return []

  const links: GraphLink[] = []
  const nodeIds = new Set(graphNodes.value.map((n) => n.id))

  // Add folder-document links
  graphNodes.value.forEach((node) => {
    if (node.type === 'document') {
      const doc = node.data as CraftDocument
      if (doc.folderId && nodeIds.has(doc.folderId)) {
        links.push({
          source: doc.folderId,
          target: doc.id,
          type: 'contains',
        })
      }
    } else if (node.type === 'folder') {
      const folder = node.data as CraftFolder
      // Check subfolders from selectedFolderData
      if (folder.folders) {
        folder.folders.forEach((subfolder) => {
          if (nodeIds.has(subfolder.id)) {
            links.push({
              source: folder.id,
              target: subfolder.id,
              type: 'contains',
            })
          }
        })
      }
    }
  })

  // Add document-collection links
  graphNodes.value.forEach((node) => {
    if (node.type === 'collection') {
      const collection = node.data as { id: string; name: string; documentId: string }
      if (
        collection.documentId &&
        nodeIds.has(collection.documentId) &&
        nodeIds.has(collection.id)
      ) {
        links.push({
          source: collection.documentId,
          target: collection.id,
          type: 'hasCollection',
        })
      }
    }
  })

  return links
})

// D3 rendering
const svgRef = ref<SVGSVGElement | null>(null)
let simulation: d3.Simulation<D3Node, D3Link> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

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

function renderGraph() {
  if (!svgRef.value || graphNodes.value.length === 0 || !d3Available) return

  const width = svgRef.value.clientWidth || 400
  const height = svgRef.value.clientHeight || 300

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
        .distance(70),
    )
    .force('charge', d3.forceManyBody<D3Node>().strength(-120))
    .force('center', d3.forceCenter<D3Node>(width / 2, height / 2))
    .force('collision', d3.forceCollide<D3Node>().radius(24))

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
    .on('click', async (event, d) => {
      event.stopPropagation()
      await handleNodeClick(d)
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
    const isRoot = d.id === rootId.value
    const nodeType = d.type as keyof typeof nodeColors
    const color = isRoot ? nodeColors.root : nodeColors[nodeType] || '#6b7280'

    const radiusMap: Record<string, number> = {
      document: 8,
      folder: 10,
      collection: 9,
    }
    const radius = isRoot ? 12 : radiusMap[d.type] || 8

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
      .attr('stroke-width', isRoot ? 3 : 2)

    if (showLabels.value) {
      g.append('text')
        .text(d.label)
        .attr('dy', radius + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', '10px')
        .attr('pointer-events', 'none')
    }
  })

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => (d.source as D3Node).x || 0)
      .attr('y1', (d) => (d.source as D3Node).y || 0)
      .attr('x2', (d) => (d.target as D3Node).x || 0)
      .attr('y2', (d) => (d.target as D3Node).y || 0)

    node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`)
  })
}

function dragstarted(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  if (!event.active && simulation) simulation.alphaTarget(0.3).restart()
  event.subject.fx = event.subject.x
  event.subject.fy = event.subject.y
}

function dragged(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  event.subject.fx = event.x
  event.subject.fy = event.y
}

function dragended(event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>) {
  if (!event.active && simulation) simulation.alphaTarget(0)
  event.subject.fx = null
  event.subject.fy = null
}

async function handleNodeClick(node: D3Node) {
  const spaceId = getSpaceId()
  if (!spaceId) {
    alert('Could not retrieve Space ID. Please configure it manually in Settings.')
    return
  }

  const preference = getCraftLinkPreference()

  switch (node.type) {
    case 'document': {
      const doc = node.data as CraftDocument
      if (preference === 'web') {
        // Use clickableLink if available (contains correct document ID and share token)
        if (doc.clickableLink) {
          window.open(doc.clickableLink, '_blank')
          return
        }
        // Fallback to constructing web link
        const webLink = buildCraftWebLink(node.id, spaceId)
        if (webLink) {
          window.open(webLink, '_blank')
          return
        }
      }
      // Fallback to app link
      await openCraftLink(node.id, node.id)
      break
    }
    case 'folder': {
      // Folders only support app links
      const folderLink = `craftdocs://openfolder?folderId=${node.id}&spaceId=${spaceId}&title=${encodeURIComponent(node.label)}`
      window.location.href = folderLink
      break
    }
    case 'collection': {
      const collection = node.data as { documentId?: string }
      if (collection.documentId) {
        // Find the document to get its clickableLink
        const doc = selectedFolderData.value.documents.find((d) => d.id === collection.documentId)
        if (preference === 'web') {
          // Use clickableLink if available
          if (doc?.clickableLink) {
            window.open(doc.clickableLink, '_blank')
            return
          }
          // Fallback to constructing web link
          const webLink = buildCraftWebLink(collection.documentId, spaceId)
          if (webLink) {
            window.open(webLink, '_blank')
            return
          }
        }
        // Fallback to app link
        await openCraftLink(collection.documentId, collection.documentId)
      }
      break
    }
  }
}

const showLabels = ref(true)

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

  const width = svgRef.value.clientWidth || 400
  const height = svgRef.value.clientHeight || 300

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

// Flatten all folders recursively and sort alphabetically
const allFoldersList = computed(() => {
  const flattenFolders = (folderList: CraftFolder[]): Array<{ id: string; name: string }> => {
    const result: Array<{ id: string; name: string }> = []

    const traverse = (folders: CraftFolder[]) => {
      folders.forEach((folder) => {
        result.push({ id: folder.id, name: folder.name })
        if (folder.folders && folder.folders.length > 0) {
          traverse(folder.folders)
        }
      })
    }

    traverse(folderList)
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  return flattenFolders(folders.value)
})

const selectRoot = async (folder: { id: string; name: string }) => {
  emit('update:data', {
    rootId: folder.id,
    rootType: 'folder',
    rootTitle: folder.name,
  })
  emit('update:title', folder.name)
  isConfiguring.value = false

  // Load folder data after selection
  await loadFolderData(folder.id)

  // Force render after a short delay to ensure DOM is ready
  await nextTick()
  setTimeout(() => {
    if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
      renderGraph()
    }
  }, 100)
}

const reconfigure = async () => {
  isConfiguring.value = true
  // Always fetch folders fresh when reconfiguring
  if (hasApiConfig.value) {
    await loadFolders(true)
  }
}

const refresh = async () => {
  if (rootId.value) {
    // Clear cache for current folder
    localStorage.removeItem(FOLDER_DATA_CACHE_PREFIX + rootId.value)
    await loadFolderData(rootId.value, true)
  } else {
    // Clear folders cache and reload
    localStorage.removeItem(FOLDERS_CACHE_KEY)
    await loadFolders(true)
  }
}

// Load folders list (for selection/search)
const loadFolders = async (forceRefresh = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }

  isLoading.value = true
  totalApiCalls.value = 1
  completedApiCalls.value = 0
  try {
    await graphApiStore.initializeGraph(forceRefresh)
    completedApiCalls.value++
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch folders'
    console.error('Error fetching folders:', e)
    completedApiCalls.value++
  } finally {
    isLoading.value = false
  }
}

// Load data for a specific folder (documents, subfolders, collections)
const loadFolderData = async (folderId: string, forceRefresh = false) => {
  if (!hasApiConfig.value) {
    error.value = 'Please configure your API URL in Settings'
    return
  }
  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cached = getCachedFolderData(folderId)
    if (cached) {
      selectedFolderData.value = cached
      await nextTick()
      await nextTick() // Double nextTick for computed updates
      if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
        setTimeout(() => {
          if (svgRef.value) {
            renderGraph()
          }
        }, 50)
      }
      return
    }
  }

  isLoading.value = true
  error.value = null

  // Find the folder in the folders list
  const findFolder = (folderList: CraftFolder[]): CraftFolder | null => {
    for (const folder of folderList) {
      if (folder.id === folderId) return folder
      if (folder.folders) {
        const found = findFolder(folder.folders)
        if (found) return found
      }
    }
    return null
  }

  const targetFolder = findFolder(folders.value)
  if (!targetFolder) {
    error.value = 'Folder not found'
    isLoading.value = false
    return
  }

  // Count API calls needed (documents + collections + subfolders)
  const countSubfolders = (folder: CraftFolder): number => {
    if (!folder.folders || folder.folders.length === 0) return 0
    let count = folder.folders.length
    folder.folders.forEach((subfolder) => {
      count += countSubfolders(subfolder)
    })
    return count
  }

  const subfolderCount = countSubfolders(targetFolder)
  totalApiCalls.value = 1 + (subfolderCount > 0 ? subfolderCount : 0) + 1 // documents + subfolders + collections
  completedApiCalls.value = 0

  try {
    const specialLocations: Record<string, 'unsorted' | 'trash' | 'templates' | 'daily_notes'> = {
      unsorted: 'unsorted',
      trash: 'trash',
      templates: 'templates',
      daily_notes: 'daily_notes',
    }

    const location = specialLocations[folderId]

    // Fetch documents for this folder
    const documentsResult = await fetchDocuments(
      location ? { location, fetchMetadata: true } : { folderId: folderId, fetchMetadata: true },
    )
    completedApiCalls.value++

    const allDocuments: CraftDocument[] = []
    documentsResult.items.forEach((doc) => {
      allDocuments.push({ ...doc, folderId: folderId })
    })

    // Recursively fetch documents for subfolders
    // The API already returns nested folder structure, we just need to fetch documents
    const fetchSubfolderDocuments = async (folder: CraftFolder) => {
      if (!folder.folders || folder.folders.length === 0) {
        return
      }

      for (const subfolder of folder.folders) {
        // Fetch documents for this subfolder
        const subfolderDocs = await fetchDocuments({
          folderId: subfolder.id,
          fetchMetadata: true,
        })
        completedApiCalls.value++
        subfolderDocs.items.forEach((doc) => {
          allDocuments.push({ ...doc, folderId: subfolder.id })
        })

        // Recursively fetch documents for nested subfolders
        if (subfolder.folders && subfolder.folders.length > 0) {
          await fetchSubfolderDocuments(subfolder)
        }
      }
    }

    // The API already returns nested folder structure in targetFolder.folders
    // We just need to fetch documents for all subfolders
    if (!location && targetFolder.folders && targetFolder.folders.length > 0) {
      await fetchSubfolderDocuments(targetFolder)
    }

    // Use the nested structure from the API
    const allSubfolders = targetFolder.folders || []

    // Fetch collections for documents in this folder tree
    const allCollections: Array<{ id: string; name: string; documentId: string }> = []
    const documentIds = new Set(allDocuments.map((d) => d.id))

    if (documentIds.size > 0) {
      try {
        const collectionsList = await listCollections()
        completedApiCalls.value++
        collectionsList.forEach((collection) => {
          if (documentIds.has(collection.documentId)) {
            allCollections.push({
              id: collection.id,
              name: collection.name,
              documentId: collection.documentId,
            })
          }
        })
      } catch (e) {
        console.error('Error fetching collections:', e)
        completedApiCalls.value++
        // Continue without collections
      }
    }

    selectedFolderData.value = {
      documents: allDocuments,
      subfolders: allSubfolders,
      collections: allCollections,
    }

    // Cache the folder data
    setCachedFolderData(folderId, selectedFolderData.value)

    // Wait for reactive updates and DOM
    await nextTick()
    await nextTick() // Double nextTick to ensure computed properties have updated

    // Render graph after ensuring DOM is ready
    if (d3Available && graphNodes.value.length > 0) {
      // Use setTimeout to ensure SVG element is fully rendered
      setTimeout(() => {
        if (svgRef.value) {
          renderGraph()
        }
      }, 50)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch folder data'
    console.error('Error fetching folder data:', e)
    completedApiCalls.value = totalApiCalls.value // Mark all as completed on error
  } finally {
    isLoading.value = false
  }
}

// Watch for graph nodes changes to re-render
watch(
  () => [graphNodes.value.length, rootId.value],
  () => {
    if (d3Available && graphNodes.value.length > 0 && svgRef.value) {
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

// Watch for when configuration is done and graph view is shown
watch(isConfiguring, (newVal) => {
  if (!newVal && rootId.value && d3Available) {
    // Wait for DOM to update and SVG to be mounted
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
  if (!isConfigured.value) {
    isConfiguring.value = true
    // Always fetch folders when not configured (force refresh)
    if (hasApiConfig.value) {
      await loadFolders(true)
    }
  } else {
    // Load folders first, then folder data if already configured
    if (hasApiConfig.value) {
      await loadFolders()
    }
    await loadFolderData(rootId.value)
  }
})
</script>

<template>
  <div class="graph-widget">
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="isConfiguring" class="config-view">
      <div class="config-header">
        <h3>Select Root Folder</h3>
        <p class="config-description">Choose a folder to visualize</p>
      </div>

      <div v-if="isLoading" class="folders-loading">
        <Loader class="loader-icon" :size="16" />
        <span>Loading folders...</span>
      </div>

      <div v-else-if="allFoldersList.length > 0" class="folders-list">
        <div
          v-for="folder in allFoldersList"
          :key="folder.id"
          class="folder-item"
          @click="selectRoot(folder)"
        >
          <div class="folder-icon">
            <span>📁</span>
          </div>
          <div class="folder-name">{{ folder.name }}</div>
        </div>
      </div>

      <div v-else class="no-folders">
        <p>No folders available</p>
      </div>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading graph"
      />
    </div>

    <div v-else-if="!rootId" class="empty-state">
      <p>Please select a root element</p>
    </div>

    <div v-else class="graph-content-wrapper">
      <svg ref="svgRef" class="graph-svg"></svg>

      <div v-if="graphNodes.length === 0" class="empty-graph">
        <p>No nodes to display</p>
      </div>
    </div>

    <!-- Footer with action buttons (only show when graph is configured) -->
    <div v-if="rootId && !isLoading && !isCompactView" class="widget-footer">
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
      <button @click="reconfigure" class="footer-button" title="Change root">
        <Settings :size="16" />
      </button>
    </div>
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
}

.loader-icon {
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

.folders-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 13px;
}

.folders-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
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
  font-size: 18px;
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

.no-folders {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.graph-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 38px; /* Space for footer buttons */
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
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
