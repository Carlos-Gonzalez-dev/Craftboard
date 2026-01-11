import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiUrl } from '../utils/craftApi'
import { useApiCache } from '../composables/useApiCache'

export interface LogEntry {
  documentId: string
  documentTitle: string
  blockId: string
  markdown: string
  date?: string
  createdAt?: string
  lastModifiedAt?: string
  tags: string[]
  clickableLink?: string
}

export const useTagsApiStore = defineStore('tagsApi', () => {
  // State
  const logs = ref<LogEntry[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalApiCalls = ref(0)
  const completedApiCalls = ref(0)
  // Cache composable
  const cache = useApiCache('tags-cache-')

  /**
   * Extract tags from markdown
   */
  const extractMatchingTags = (markdown: string, pattern?: string): string[] => {
    if (!pattern) {
      // If no specific pattern, extract all tags
      const regex = /#([\w-]+(?:\/[\w-]+)*)/gi
      const tags: string[] = []
      let match
      while ((match = regex.exec(markdown)) !== null) {
        const tag = match[1] ? match[1].toLowerCase() : ''
        if (tag) tags.push(tag)
      }
      return [...new Set(tags)]
    }

    // Extract specific tag and its subtags
    const tags: string[] = []
    const regex = new RegExp(`#(${pattern}(?:\\/[\\w-]+)*)`, 'gi')
    let match
    while ((match = regex.exec(markdown)) !== null) {
      const tag = match[1] ? match[1].toLowerCase() : ''
      if (tag) tags.push(tag)
    }
    return [...new Set(tags)]
  }

  /**
   * Recursively extract blocks with tags from block tree
   */
  const extractBlocksWithTags = (
    block: any,
    documentId: string,
    documentTitle: string,
    savedTags: string[],
    parentPath: string[] = [],
  ): LogEntry[] => {
    const entries: LogEntry[] = []
    const markdown = block.markdown || ''
    const tags = extractMatchingTags(markdown, '')

    // Only include blocks that contain at least one of the user's saved tags
    const matchingTags = tags.filter((tag) => savedTags.includes(tag))

    if (matchingTags.length > 0) {
      entries.push({
        documentId,
        documentTitle,
        blockId: block.id,
        markdown,
        createdAt: block.metadata?.createdAt || undefined,
        lastModifiedAt: block.metadata?.lastModifiedAt || undefined,
        date: block.metadata?.createdAt,
        tags: matchingTags,
        clickableLink: undefined,
      })
    }

    // Recursively process children
    if (block.content && Array.isArray(block.content)) {
      const newPath =
        block.type === 'page' && block.markdown
          ? [...parentPath, block.markdown.replace(/<\/?page>/g, '').trim()]
          : parentPath

      for (const child of block.content) {
        entries.push(...extractBlocksWithTags(child, documentId, documentTitle, savedTags, newPath))
      }
    }

    return entries
  }

  /**
   * Load logs for given tags
   */
  const loadLogs = async (tags: string[], forceRefresh = false): Promise<LogEntry[]> => {
    if (tags.length === 0) {
      logs.value = []
      return []
    }

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = cache.getCachedData<LogEntry[]>(tags.join('-'))
      if (cachedData) {
        logs.value = cachedData
        return cachedData
      }
    }

    isLoading.value = true
    error.value = null
    logs.value = []

    try {
      const apiUrl = getApiUrl()
      if (!apiUrl) {
        throw new Error('Craft API URL not configured')
      }

      const token = localStorage.getItem('craft-api-token')
      if (!token) {
        throw new Error('Craft API token not configured')
      }

      // Step 1: Search for documents containing the tags
      const patterns = tags.map((tag) => `#${tag}(?:\/[\w-]+)?`).join('|')
      const regexPattern = patterns || '#[\w-]+(?:\/[\w-]+)?'

      const searchResponse = await fetch(
        `${apiUrl}/documents/search?regexps=${encodeURIComponent(regexPattern)}&fetchMetadata=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (!searchResponse.ok) {
        throw new Error(`Failed to search documents: ${searchResponse.statusText}`)
      }

      const searchData = await searchResponse.json()
      const documents = searchData.items || []

      // Step 2: Fetch blocks for each document with metadata
      totalApiCalls.value = documents.length
      completedApiCalls.value = 0

      const logEntries: LogEntry[] = []

      for (const doc of documents) {
        try {
          const blocksResponse = await fetch(
            `${apiUrl}/blocks?id=${encodeURIComponent(doc.documentId)}&fetchMetadata=true`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            },
          )

          completedApiCalls.value++

          if (blocksResponse.ok) {
            const blockData = await blocksResponse.json()
            const documentTitle = doc.title || 'Untitled'

            // Extract all blocks with tags from the tree
            const blockEntries = extractBlocksWithTags(
              blockData,
              doc.documentId,
              documentTitle,
              tags,
            )
            logEntries.push(...blockEntries)
          }
        } catch (blockError) {
          console.error(`Error fetching blocks for document ${doc.documentId}:`, blockError)
          // Continue with other documents even if one fails
        }
      }

      // Sort by date (most recent first)
      logEntries.sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      })

      logs.value = logEntries

      // Save to cache
      cache.setCachedData(tags.join('-'), logEntries)

      return logEntries
    } catch (err) {
      console.error('Failed to load logs:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load logs'
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh logs (force fetch from API)
   */
  const refreshLogs = async (tags: string[]): Promise<LogEntry[]> => {
    return loadLogs(tags, true)
  }

  /**
   * Get documents that contain specific tags (lightweight version for graph)
   * Returns a Map of documentId -> document info with tags
   * Uses shared cache with loadLogs
   */
  const getDocumentsByTags = async (
    tags: string[],
    forceRefresh = false,
  ): Promise<
    Map<string, { documentId: string; title: string; tags: string[]; dailyNoteDate?: string }>
  > => {
    if (tags.length === 0) {
      return new Map()
    }

    const cacheKey = `docs-by-tags-${tags.join('-')}`

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = cache.getCachedData<
        Array<{ documentId: string; title: string; tags: string[]; dailyNoteDate?: string }>
      >(cacheKey)
      if (cachedData) {
        const result = new Map<
          string,
          { documentId: string; title: string; tags: string[]; dailyNoteDate?: string }
        >()
        cachedData.forEach((item) => result.set(item.documentId, item))
        return result
      }
    }

    try {
      const apiUrl = getApiUrl()
      if (!apiUrl) {
        return new Map()
      }

      const token = localStorage.getItem('craft-api-token')
      if (!token) {
        return new Map()
      }

      // Search for documents containing the tags
      const patterns = tags.map((tag) => `#${tag}(?:\\/[\\w-]+)?`).join('|')
      const regexPattern = patterns || '#[\\w-]+(?:\\/[\\w-]+)?'

      const searchResponse = await fetch(
        `${apiUrl}/documents/search?regexps=${encodeURIComponent(regexPattern)}&fetchMetadata=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (!searchResponse.ok) {
        return new Map()
      }

      const searchData = await searchResponse.json()
      const documents = searchData.items || []

      // For each document, we need to determine which of the user's tags it contains
      // We'll fetch minimal block data to extract tags
      const result = new Map<
        string,
        { documentId: string; title: string; tags: string[]; dailyNoteDate?: string }
      >()
      const dataToCache: Array<{
        documentId: string
        title: string
        tags: string[]
        dailyNoteDate?: string
      }> = []

      for (const doc of documents) {
        try {
          const blocksResponse = await fetch(
            `${apiUrl}/blocks?id=${encodeURIComponent(doc.documentId)}&maxDepth=2`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            },
          )

          if (blocksResponse.ok) {
            const blockData = await blocksResponse.json()

            // Extract all tags from the document
            const extractTagsFromBlock = (block: any): string[] => {
              const foundTags: string[] = []
              if (block.markdown) {
                const blockTags = extractMatchingTags(block.markdown, '')
                foundTags.push(...blockTags)
              }
              if (block.content && Array.isArray(block.content)) {
                for (const child of block.content) {
                  foundTags.push(...extractTagsFromBlock(child))
                }
              }
              return foundTags
            }

            const allFoundTags = [...new Set(extractTagsFromBlock(blockData))]
            // Filter to only include tags the user is tracking
            const matchingTags = allFoundTags.filter((t) => tags.includes(t))

            if (matchingTags.length > 0) {
              const entry: {
                documentId: string
                title: string
                tags: string[]
                dailyNoteDate?: string
              } = {
                documentId: doc.documentId,
                title: doc.title || 'Untitled',
                tags: matchingTags,
              }
              // Include dailyNoteDate if present (for proper label formatting)
              if (doc.dailyNoteDate) {
                entry.dailyNoteDate = doc.dailyNoteDate
              }
              result.set(doc.documentId, entry)
              dataToCache.push(entry)
            }
          }
        } catch {
          // Continue with other documents
        }
      }

      // Cache the results
      cache.setCachedData(cacheKey, dataToCache)

      return result
    } catch {
      return new Map()
    }
  }

  return {
    // State
    logs: computed(() => logs.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    totalApiCalls: computed(() => totalApiCalls.value),
    completedApiCalls: computed(() => completedApiCalls.value),

    // Methods
    loadLogs,
    refreshLogs,
    getDocumentsByTags,
    clearCache: (tags: string[]) => cache.clearCache(tags.join('-')),
    clearAllCache: () => cache.clearAllCache(),
    extractMatchingTags,
  }
})
