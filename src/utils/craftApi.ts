export interface CollectionItem {
  id: string
  title: string
  properties: Record<string, any>
  content?: any[]
}

export interface CollectionProperty {
  key: string
  name: string
  type: string
  description?: string
  options?: string[]
  isRelation?: boolean
}

export interface CollectionSchema {
  properties: CollectionProperty[]
}

export interface Collection {
  id: string
  name: string
  itemCount: number
  documentId: string
}

export interface CraftDocument {
  id: string
  title: string
  folderId?: string
  dailyNoteDate?: string
  clickableLink?: string
  lastModifiedAt?: string
  createdAt?: string
}

export interface CraftFolder {
  id: string
  name: string
  documentCount?: number
  folders?: CraftFolder[]
}

let apiToken: string | null = null

export const setApiToken = (token: string) => {
  apiToken = token
  localStorage.setItem('craft-api-token', token)
}

export const getApiToken = () => {
  if (!apiToken) {
    apiToken = localStorage.getItem('craft-api-token')
  }
  return apiToken
}

const getHeaders = () => {
  const token = getApiToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export const getApiUrl = () => {
  return localStorage.getItem('craft-api-url') || ''
}

export const getSpaceId = () => {
  return localStorage.getItem('craft-space-id') || ''
}

export const setSpaceId = (spaceId: string) => {
  localStorage.setItem('craft-space-id', spaceId)
}

// Craft link preference: 'app' or 'web', default is 'app'
export const getCraftLinkPreference = (): 'app' | 'web' => {
  const preference = localStorage.getItem('craft-link-preference')
  return (preference === 'web' ? 'web' : 'app') as 'app' | 'web'
}

export const setCraftLinkPreference = (preference: 'app' | 'web') => {
  localStorage.setItem('craft-link-preference', preference)
}

// Cache expiry settings (in minutes, default 60)
export const getCacheExpiryMinutes = (): number => {
  const cached = localStorage.getItem('cache-expiry-minutes')
  if (cached) {
    const minutes = parseInt(cached, 10)
    if (!isNaN(minutes) && minutes >= 0) {
      return minutes
    }
  }
  // Migration: check for old hours-based setting and convert
  const oldCached = localStorage.getItem('cache-expiry-hours')
  if (oldCached) {
    const hours = parseInt(oldCached, 10)
    if (!isNaN(hours) && hours >= 0) {
      const minutes = hours * 60
      localStorage.setItem('cache-expiry-minutes', String(minutes))
      localStorage.removeItem('cache-expiry-hours')
      return minutes
    }
  }
  return 60 // default 60 minutes
}

export const setCacheExpiryMinutes = (minutes: number) => {
  localStorage.setItem('cache-expiry-minutes', String(minutes))
}

export const getCacheExpiryMs = (): number => {
  const minutes = getCacheExpiryMinutes()
  if (minutes === 0) {
    return 0 // Disable caching
  }
  return minutes * 60 * 1000
}

// Legacy function names for backwards compatibility
export const getCacheExpiryHours = (): number => {
  return Math.floor(getCacheExpiryMinutes() / 60)
}

export const setCacheExpiryHours = (hours: number) => {
  setCacheExpiryMinutes(hours * 60)
}

// Extract share token from API URL
export const getShareToken = (): string | null => {
  const apiUrl = getApiUrl()
  if (!apiUrl) return null

  const match = apiUrl.match(/\/links\/([^\/]+)\//)
  return match && match[1] ? match[1] : null
}

// Build Craft app link (craftdocs://open?blockId=...&spaceId=...)
export const buildCraftAppLink = (blockId: string, spaceId?: string): string | null => {
  const space = spaceId || getSpaceId()
  if (!space) return null
  return `craftdocs://open?blockId=${blockId}&spaceId=${space}`
}

// Build Craft app link for daily note (craftdocs://open?spaceId=...&date=...)
export const buildCraftAppLinkForDailyNote = (date: string, spaceId?: string): string | null => {
  const space = spaceId || getSpaceId()
  if (!space) return null
  return `craftdocs://open?spaceId=${space}&date=${date}`
}

// Build Craft web link (https://docs.craft.do/editor/d/{spaceId}/{documentId}?s={shareToken})
export const buildCraftWebLink = (
  documentId: string,
  spaceId?: string,
  shareToken?: string,
): string | null => {
  const space = spaceId || getSpaceId()
  if (!space || !documentId) return null

  const token = shareToken || getShareToken()
  if (token) {
    return `https://docs.craft.do/editor/d/${space}/${documentId}?s=${encodeURIComponent(token)}`
  } else {
    return `https://docs.craft.do/editor/d/${space}/${documentId}`
  }
}

// Open a Craft link based on user preference
export const openCraftLink = async (
  blockId: string,
  documentId?: string,
  clickableLink?: string,
) => {
  const preference = getCraftLinkPreference()
  const spaceId = getSpaceId() || (await fetchAndCacheSpaceId()) || ''

  if (!spaceId) {
    alert('Could not retrieve Space ID. Please configure it manually in Settings.')
    return
  }

  if (preference === 'web' && documentId) {
    // Use clickableLink if available (contains correct document ID and share token)
    if (clickableLink) {
      window.open(clickableLink, '_blank')
      return
    }
    const webLink = buildCraftWebLink(documentId, spaceId)
    if (webLink) {
      window.open(webLink, '_blank')
      return
    }
  }

  // Default to app link
  const appLink = buildCraftAppLink(blockId, spaceId)
  if (appLink) {
    window.location.href = appLink
  }
}

// Extract spaceId from a clickableLink URL
export const extractSpaceIdFromLink = (clickableLink: string): string | null => {
  try {
    const url = new URL(clickableLink)
    return url.searchParams.get('spaceId')
  } catch {
    return null
  }
}

// Fetch and cache the spaceId from the API
export const fetchAndCacheSpaceId = async (): Promise<string | null> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) return null

  try {
    // Try to get a document with metadata to extract spaceId
    const response = await fetch(`${apiUrl}/documents?fetchMetadata=true`, {
      method: 'GET',
      headers: getHeaders(),
    })

    if (!response.ok) return null

    const data = await response.json()
    const items = data.items || []

    // Find first document with a clickableLink
    for (const doc of items) {
      if (doc.clickableLink) {
        const spaceId = extractSpaceIdFromLink(doc.clickableLink)
        if (spaceId) {
          setSpaceId(spaceId)
          return spaceId
        }
      }
    }

    return null
  } catch (e) {
    console.error('Failed to fetch spaceId:', e)
    return null
  }
}

export const fetchDocuments = async (options?: {
  location?: 'unsorted' | 'trash' | 'templates' | 'daily_notes'
  folderId?: string
  fetchMetadata?: boolean
}): Promise<{ items: CraftDocument[] }> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const params = new URLSearchParams()
  if (options?.location) params.append('location', options.location)
  if (options?.folderId) params.append('folderId', options.folderId)
  if (options?.fetchMetadata) params.append('fetchMetadata', 'true')

  const response = await fetch(`${apiUrl}/documents?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`)
  }

  const data = await response.json()
  return { items: data.items || [] }
}

export const fetchFolders = async (): Promise<{ items: CraftFolder[] }> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/folders`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch folders: ${response.statusText}`)
  }

  const data = await response.json()
  return { items: data.items || [] }
}

export const listCollections = async (): Promise<Collection[]> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/collections`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.statusText}`)
  }

  const data = await response.json()
  return data.items || []
}

// Discover collections by "Craftboard" prefix
// Maps collection names to their expected types
export const discoverCraftboardCollections = async (): Promise<Collection[]> => {
  const allCollections = await listCollections()
  // Filter collections that start with "Craftboard" (case-insensitive)
  return allCollections.filter((col) => col.name.toLowerCase().startsWith('craftboard'))
}

// Helper to find a collection by partial name match (after "Craftboard" prefix)
// e.g., "Craftboard Playlists" -> "playlists", "Craftboard Artists" -> "artists"
export const findCollectionByName = (
  collections: Collection[],
  searchTerms: string[],
): Collection | null => {
  for (const collection of collections) {
    const nameLower = collection.name.toLowerCase()
    // Check if it starts with "craftboard"
    if (nameLower.startsWith('craftboard')) {
      // Extract the part after "Craftboard" (with or without space)
      const afterPrefix = nameLower.replace(/^craftboard\s*/i, '').trim()
      // Check if it matches any search term
      for (const term of searchTerms) {
        if (afterPrefix === term.toLowerCase() || afterPrefix.includes(term.toLowerCase())) {
          return collection
        }
      }
    }
  }
  return null
}

export const getCollectionSchema = async (collectionId: string): Promise<CollectionSchema> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/collections/${collectionId}/schema`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch collection schema: ${response.statusText}`)
  }

  const rawSchema = await response.json()

  // Parse the JSON Schema format to extract properties
  // The schema has structure: properties.items.items.properties.properties.properties[propertyKey]
  const properties: CollectionProperty[] = []

  if (rawSchema.properties?.items?.items?.properties?.properties?.properties) {
    const propsObject = rawSchema.properties.items.items.properties.properties.properties

    for (const [key, propDef] of Object.entries(propsObject as Record<string, any>)) {
      let type = propDef.type || 'string'
      let isRelation = false

      // Detect relation properties (they have a nested relations array)
      if (type === 'object' && propDef.properties?.relations) {
        type = 'relation'
        isRelation = true
      }

      // Handle array types
      if (type === 'array') {
        if (propDef.items?.type === 'string') {
          type = 'multiselect'
        }
      }

      // Extract options from description if available
      let options: string[] | undefined
      if (propDef.description) {
        const optionsMatch = propDef.description.match(/Existing options: (.+)/)
        if (optionsMatch) {
          options = optionsMatch[1]
            .split(',')
            .map((opt: string) => opt.trim().replace(/^"|"$/g, ''))
        }
      }

      properties.push({
        key,
        name: propDef.title || key,
        type,
        description: propDef.description,
        options,
        isRelation,
      })
    }
  }

  return { properties }
}

export const getCollectionItems = async (collectionId: string): Promise<CollectionItem[]> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/collections/${collectionId}/items`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch collection items: ${response.statusText}`)
  }

  const data = await response.json()
  return data.items || []
}

// Task interface
export interface CraftTask {
  id: string
  markdown: string
  taskInfo?: {
    state?: 'todo' | 'done' | 'canceled'
    scheduleDate?: string
    deadlineDate?: string
  }
  location?: {
    type?: 'inbox' | 'dailyNote' | 'document'
    date?: string
    title?: string
    documentId?: string
  }
  completedAt?: string
  canceledAt?: string
  repeat?: {
    type?: 'fixed' | 'flexible'
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval?: number
    startDate?: string
    weekly?: {
      days?: string[]
    }
    monthly?: {
      days?: number[]
    }
    yearly?: {
      months?: number[]
      days?: number[]
    }
    reminder?: {
      enabled?: boolean
      dateOffset?: number
    }
  }
}

// Fetch tasks from Craft API
export const fetchTasks = async (
  scope?: 'inbox' | 'active' | 'upcoming' | 'logbook' | 'document',
  documentId?: string,
): Promise<{ items: CraftTask[] }> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const params = new URLSearchParams()
  if (scope) {
    params.append('scope', scope)
  }
  if (documentId) {
    params.append('documentId', documentId)
  }

  const response = await fetch(`${apiUrl}/tasks?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${response.statusText}`)
  }

  const data = await response.json()
  return { items: data.items || [] }
}

// Get daily note document ID for a specific date
export const getDailyNoteDocumentId = async (date: string): Promise<string | null> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  try {
    // First, try to get the document ID from the blocks endpoint (root block ID = document ID)
    const response = await fetch(`${apiUrl}/blocks?date=${date}`, {
      method: 'GET',
      headers: getHeaders(),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    // The root block ID is the document ID
    return data.id || null
  } catch {
    // Fallback: try to get from documents endpoint
    try {
      const response = await fetch(
        `${apiUrl}/documents?location=daily_notes&dailyNoteDateGte=${date}&dailyNoteDateLte=${date}`,
        {
          method: 'GET',
          headers: getHeaders(),
        },
      )

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      const items = data.items || []
      if (items.length > 0) {
        return items[0].id || null
      }
    } catch {
      return null
    }
    return null
  }
}

// Get daily note markdown content for a specific date
export const getDailyNote = async (date: string): Promise<string> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/blocks?date=${date}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    if (response.status === 404) {
      // Daily note doesn't exist for this date
      return ''
    }
    throw new Error(`Failed to fetch daily note: ${response.statusText}`)
  }

  const data = await response.json()

  // Extract markdown from the response
  // The response has a structure with content array containing blocks with markdown properties
  const extractMarkdown = (block: any): string[] => {
    const lines: string[] = []

    // Add the block's own markdown if it exists and is meaningful
    if (block.markdown && block.type !== 'page') {
      lines.push(block.markdown)
    }

    // Recursively process nested content blocks
    if (block.content && Array.isArray(block.content)) {
      for (const child of block.content) {
        lines.push(...extractMarkdown(child))
      }
    }

    return lines
  }

  const markdownLines = extractMarkdown(data)
  let markdown = markdownLines.join('\n')

  // Clean up structural tags like <page></page> that might be in the markdown
  markdown = markdown.replace(/<page>([^<]*)<\/page>/gi, '$1')
  markdown = markdown.replace(/<page\/>/gi, '')

  return markdown
}

// Search documents across the space
export interface DocumentSearchResult {
  id: string
  title: string
  snippet?: string
  lastModifiedAt?: string
  createdAt?: string
}

// Extract title from markdown snippet
const extractTitleFromMarkdown = (markdown: string): string => {
  if (!markdown) return 'Untitled'

  // Remove markdown formatting and HTML tags
  let text = markdown
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim()

  // Try to find a title pattern (first line, or text before | or newline)
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    // If first line is short enough and doesn't start with ellipsis, use it
    if (firstLine.length < 100 && !firstLine.startsWith('...')) {
      return firstLine.substring(0, 80)
    }
  }

  // Extract first meaningful sentence
  const sentences = text.split(/[.!?]\s+/)
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim()
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return firstSentence.substring(0, 80)
    }
  }

  // Fallback: use first 60 characters
  return text.substring(0, 60).trim() || 'Untitled'
}

export const searchDocuments = async (query: string): Promise<DocumentSearchResult[]> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(
    `${apiUrl}/documents/search?include=${encodeURIComponent(query)}&fetchMetadata=true`,
    {
      method: 'GET',
      headers: getHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to search documents: ${response.statusText}`)
  }

  const data = await response.json()
  return (data.items || []).map((item: any) => {
    const documentId = item.documentId || item.id
    return {
      id: documentId,
      title: '', // Not used - we show full snippet instead
      snippet: item.markdown || '',
      lastModifiedAt: item.lastModifiedAt,
      createdAt: item.createdAt,
    }
  })
}

// Search within a document to find specific block IDs
export interface BlockSearchResult {
  blockId: string
  markdown: string
}

export const searchWithinDocument = async (
  documentId: string,
  query: string,
): Promise<BlockSearchResult[]> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  // Escape special regex characters for literal search
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const response = await fetch(
    `${apiUrl}/blocks/search?blockId=${documentId}&pattern=${encodeURIComponent(escapedQuery)}&caseSensitive=false`,
    {
      method: 'GET',
      headers: getHeaders(),
    },
  )

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return (data.items || []).map((item: any) => ({
    blockId: item.blockId,
    markdown: item.markdown || '',
  }))
}

// Get document content by ID
export interface BlockContent {
  id: string
  type: string
  markdown?: string
  content?: BlockContent[]
  url?: string
  [key: string]: any
}

export const getBlockContent = async (blockId: string): Promise<BlockContent | null> => {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error('Craft API URL not configured')
  }

  const response = await fetch(`${apiUrl}/blocks?id=${blockId}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    throw new Error(`Failed to fetch block: ${response.statusText}`)
  }

  return await response.json()
}

// Extract images from block content recursively
export const extractImagesFromBlock = (block: BlockContent): string[] => {
  const images: string[] = []

  if (block.type === 'image' && block.url) {
    images.push(block.url)
  }

  if (block.content && Array.isArray(block.content)) {
    for (const child of block.content) {
      images.push(...extractImagesFromBlock(child))
    }
  }

  return images
}

// Get document title from block content
export const getDocumentTitle = (block: BlockContent): string => {
  if (block.type === 'page' && block.markdown) {
    // Extract title from markdown like <page>Title</page>
    const match = block.markdown.match(/<page>([^<]*)<\/page>/i)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  // Try to find first text block with title
  if (block.content && Array.isArray(block.content)) {
    for (const child of block.content) {
      if (child.type === 'text' && child.textStyle && ['h1', 'page'].includes(child.textStyle)) {
        if (child.markdown) {
          return child.markdown.replace(/^#+\s*/, '').trim()
        }
      }
    }
  }

  return 'Untitled'
}

// Parse Craft link to extract blockId/documentId and determine type
export interface ParsedCraftLink {
  blockId: string
  documentId?: string
  isAppLink: boolean
  isWebLink: boolean
}

export const parseCraftLink = (link: string): ParsedCraftLink | null => {
  if (!link) return null

  // Extract URL from markdown link format: [text](url)
  let actualLink = link.trim()
  const markdownLinkMatch = link.match(/\[([^\]]+)\]\(([^\)]+)\)/)
  if (markdownLinkMatch && markdownLinkMatch[2]) {
    actualLink = markdownLinkMatch[2].trim()
  }

  // App link: craftdocs://open?blockId=...&spaceId=...
  if (actualLink.startsWith('craftdocs://')) {
    try {
      const url = new URL(actualLink)
      const blockId = url.searchParams.get('blockId')
      if (blockId) {
        return {
          blockId,
          isAppLink: true,
          isWebLink: false,
        }
      }
    } catch {
      return null
    }
  }

  // Web link: https://docs.craft.do/editor/d/{spaceId}/{documentId}?s={shareToken}
  if (actualLink.includes('docs.craft.do/editor/d/')) {
    try {
      // Add protocol if missing for URL parsing
      let urlString = actualLink
      if (!actualLink.startsWith('http://') && !actualLink.startsWith('https://')) {
        urlString = 'https://' + actualLink
      }
      const url = new URL(urlString)
      const pathParts = url.pathname.split('/')
      // Path format: /editor/d/{spaceId}/{documentId}
      // pathParts: ['', 'editor', 'd', '{spaceId}', '{documentId}']
      if (pathParts.length >= 5 && pathParts[1] === 'editor' && pathParts[2] === 'd') {
        const documentId = pathParts[4] // documentId is at index 4
        return {
          blockId: documentId, // For documents, blockId = documentId
          documentId,
          isAppLink: false,
          isWebLink: true,
        }
      }
    } catch {
      return null
    }
  }

  return null
}

// Extract document ID from either a Craft document URL or a plain document ID
export const extractDocumentId = (input: string): string | null => {
  if (!input || !input.trim()) return null

  const trimmed = input.trim()

  // If it's already a plain document ID (no URL structure), return it
  if (!trimmed.includes('://') && !trimmed.includes('http') && !trimmed.includes('docs.craft.do')) {
    return trimmed
  }

  // Try to parse as a Craft link
  const parsed = parseCraftLink(trimmed)
  if (parsed && parsed.documentId) {
    return parsed.documentId
  }

  // If parseCraftLink didn't work but we have a blockId, use that
  if (parsed && parsed.blockId) {
    return parsed.blockId
  }

  // If it looks like a web URL, try to extract from path
  if (trimmed.includes('docs.craft.do/editor/d/')) {
    try {
      // Add protocol if missing for URL parsing
      let urlString = trimmed
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        urlString = 'https://' + trimmed
      }
      const url = new URL(urlString)
      const pathParts = url.pathname.split('/')
      // Path format: /editor/d/{spaceId}/{documentId}
      // pathParts: ['', 'editor', 'd', '{spaceId}', '{documentId}']
      if (pathParts.length >= 5 && pathParts[1] === 'editor' && pathParts[2] === 'd') {
        return pathParts[4] // documentId is at index 4
      }
    } catch {
      // If URL parsing fails, try manual extraction from path
      // Match: docs.craft.do/editor/d/{spaceId}/{documentId}
      const match = trimmed.match(/docs\.craft\.do\/editor\/d\/[^\/]+\/([^\/\?]+)/)
      if (match && match[1]) {
        return match[1]
      }
    }
  }

  return null
}

// Fetch document titles for multiple document IDs
export const fetchDocumentTitles = async (
  documentIds: string[],
): Promise<Record<string, string>> => {
  const titles: Record<string, string> = {}

  // Fetch titles in parallel (limit to avoid too many requests)
  const promises = documentIds.slice(0, 10).map(async (id) => {
    try {
      const block = await getBlockContent(id)
      if (block) {
        titles[id] = getDocumentTitle(block)
      }
    } catch {
      // If fetch fails, keep the ID as fallback
      titles[id] = 'Untitled'
    }
  })

  await Promise.all(promises)
  return titles
}

// Render a property value based on its schema type
export const renderPropertyValue = (value: any, propertyType: string): string => {
  if (value === null || value === undefined) {
    return '—'
  }

  // Handle relation objects
  if (value && typeof value === 'object' && value.relations && Array.isArray(value.relations)) {
    const titles = value.relations.map((rel: any) => rel.title).filter(Boolean)
    return titles.length > 0 ? titles.join(', ') : '—'
  }

  // Handle arrays (like tags/etiquetas)
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '—'
  }

  switch (propertyType) {
    case 'select':
    case 'text':
    case 'number':
    case 'string':
      return String(value)
    case 'date':
      if (typeof value === 'string') {
        try {
          const date = new Date(value)
          return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        } catch {
          return value
        }
      }
      return String(value)
    case 'multiselect':
      // Already handled above as array, but keeping for type safety
      return '—'
    case 'checkbox':
    case 'boolean':
      return value ? '✓' : '✗'
    case 'url':
      return value
    case 'relation':
      // Already handled above, but keeping for type safety
      return '—'
    default:
      // For complex objects, try to display them nicely
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      return String(value)
  }
}
