export interface RSSItem {
  title: string
  link: string
  description: string
  pubDate?: string
  author?: string
  guid?: string
}

export interface RSSFeed {
  title: string
  link: string
  description: string
  items: RSSItem[]
}

// Parse RSS XML to extract feed information (supports both RSS 2.0 and Atom)
export const parseRSS = (xmlText: string): RSSFeed | null => {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror')
    if (parseError) {
      console.error('RSS parsing error:', parseError.textContent)
      return null
    }

    // Try RSS 2.0 format first
    const channel = xmlDoc.querySelector('channel')
    if (channel) {
      let title = channel.querySelector('title')?.textContent || ''
      // Replace "Untitled" with empty string
      if (title.trim().toLowerCase() === 'untitled') {
        title = ''
      }
      const link = channel.querySelector('link')?.textContent || ''
      const description = channel.querySelector('description')?.textContent || ''

      const items: RSSItem[] = []
      const itemElements = channel.querySelectorAll('item')

      itemElements.forEach((item) => {
        let itemTitle = item.querySelector('title')?.textContent || ''
        // Replace "Untitled" with empty string
        if (itemTitle.trim().toLowerCase() === 'untitled') {
          itemTitle = ''
        }
        const itemLink = item.querySelector('link')?.textContent || ''
        const itemDescription = item.querySelector('description')?.textContent || ''
        const itemPubDate = item.querySelector('pubDate')?.textContent
        const itemAuthor =
          item.querySelector('author')?.textContent ||
          item.querySelector('dc\\:creator')?.textContent
        const itemGuid = item.querySelector('guid')?.textContent

        // For RSS 2.0 feeds (like Bluesky), be more lenient - if no title, use description or link
        if (itemLink) {
          // If no title but we have description, use first line of description as title
          if (!itemTitle && itemDescription) {
            // Use first line of description as title, limit to 100 chars
            itemTitle = (itemDescription?.split('\n')[0] ?? '').substring(0, 100).trim()
          }
          // If still no title, use the link domain or a default
          if (!itemTitle) {
            try {
              const urlObj = new URL(itemLink)
              itemTitle = urlObj.hostname.replace('www.', '')
            } catch {
              itemTitle = 'Untitled Post'
            }
          }

          items.push({
            title: itemTitle,
            link: itemLink,
            description: itemDescription,
            pubDate: itemPubDate,
            author: itemAuthor,
            guid: itemGuid,
          })
        } else {
          console.warn('Skipping RSS item - no link found')
        }
      })

      return {
        title,
        link,
        description,
        items,
      }
    }

    // Try Atom format
    const feed = xmlDoc.querySelector('feed')
    if (feed) {
      let title = feed.querySelector('title')?.textContent || ''
      // Replace "Untitled" with empty string
      if (title.trim().toLowerCase() === 'untitled') {
        title = ''
      }
      const linkElement = feed.querySelector('link[rel="alternate"], link[rel="self"], link')
      const link = linkElement?.getAttribute('href') || ''
      const subtitle = feed.querySelector('subtitle')?.textContent || ''
      const description = subtitle || feed.querySelector('description')?.textContent || ''

      const items: RSSItem[] = []
      const entryElements = feed.querySelectorAll('entry')

      entryElements.forEach((entry, index) => {
        let itemTitle = entry.querySelector('title')?.textContent || ''
        // Replace "Untitled" with empty string
        if (itemTitle.trim().toLowerCase() === 'untitled') {
          itemTitle = ''
        }
        // Try multiple ways to get the link
        const itemLinkElement =
          entry.querySelector('link[rel="alternate"]') ||
          entry.querySelector('link[rel="self"]') ||
          entry.querySelector('link')
        const itemLink = itemLinkElement?.getAttribute('href') || ''
        const itemSummary = entry.querySelector('summary')?.textContent || ''
        const itemContent = entry.querySelector('content')?.textContent || ''
        const itemDescription = itemSummary || itemContent || ''
        const itemPublished =
          entry.querySelector('published')?.textContent ||
          entry.querySelector('updated')?.textContent
        const itemAuthor = entry.querySelector('author > name')?.textContent || ''
        const itemId = entry.querySelector('id')?.textContent

        // For Bluesky/Atom feeds, be more lenient - if we have a link, use content/description as title if needed
        if (itemLink) {
          // If no title but we have description/content, use that as title
          if (!itemTitle && itemDescription) {
            // Use first line of description as title
            itemTitle = (itemDescription?.split('\n')[0] ?? '').substring(0, 100).trim()
          }
          // If still no title, use the link domain or a default
          if (!itemTitle) {
            try {
              const urlObj = new URL(itemLink)
              itemTitle = urlObj.hostname.replace('www.', '')
            } catch {
              itemTitle = 'Untitled Post'
            }
          }

          items.push({
            title: itemTitle,
            link: itemLink,
            description: itemDescription,
            pubDate: itemPublished,
            author: itemAuthor,
            guid: itemId,
          })
        } else {
          console.warn(`Skipping entry ${index} - no link found`)
        }
      })

      return {
        title,
        link,
        description,
        items,
      }
    }

    // Neither RSS nor Atom format found - log the structure for debugging
    console.error('No valid RSS or Atom feed structure found')
    return null
  } catch (error) {
    console.error('Error parsing RSS:', error)
    return null
  }
}

// Helper function to add timeout to fetch
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000,
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}

// Fetch RSS feed via CORS proxy with fallback options
export const fetchRSSFeed = async (url: string): Promise<RSSFeed | null> => {
  // Get user-defined proxies from localStorage
  let proxyTemplates: string[] = []
  try {
    const stored = localStorage.getItem('rss-proxy-urls')
    if (stored) {
      proxyTemplates = JSON.parse(stored)
    }
  } catch {
    proxyTemplates = []
  }
  if (!Array.isArray(proxyTemplates) || proxyTemplates.length === 0) {
    // Default fallback if none configured
    proxyTemplates = ['https://api.allorigins.win/get?url={url}']
  }

  for (const template of proxyTemplates) {
    // Replace {url} placeholder with encoded URL
    const proxyUrl = template.replace('{url}', encodeURIComponent(url))
    let parseResponse: (response: Response) => Promise<string>
    // Heuristic: if the URL contains 'allorigins' and '/get?', expect JSON, else text
    if (/allorigins\.win\/get\?/.test(proxyUrl)) {
      parseResponse = async (response: Response) => {
        const data = await response.json()
        return data.contents
      }
    } else {
      parseResponse = async (response: Response) => await response.text()
    }

    try {
      const response = await fetchWithTimeout(proxyUrl, {}, 15000)
      if (!response.ok) {
        console.warn(`${proxyUrl} returned status ${response.status}, trying next...`)
        continue
      }
      const xmlText = await parseResponse(response)
      if (!xmlText || !xmlText.trim()) {
        console.warn(`${proxyUrl} returned empty content, trying next...`)
        continue
      }
      if (!xmlText.trim().startsWith('<')) {
        console.warn(`${proxyUrl} returned non-XML content, trying next...`)
        continue
      }
      const parsed = parseRSS(xmlText)
      if (parsed) {
        if (parsed.items.length > 0) {
          return parsed
        } else {
          console.warn(
            `${proxyUrl} parsed successfully but found 0 items. Feed title: "${parsed.title}". Checking XML structure...`,
          )
          return parsed
        }
      } else {
        console.warn(`${proxyUrl} failed to parse XML. Sample:`, xmlText.substring(0, 500))
        continue
      }
    } catch (error) {
      console.warn(`${proxyUrl} error:`, error instanceof Error ? error.message : String(error))
      continue
    }
  }
  console.error('❌ All proxy options failed for:', url)
  return null
}
