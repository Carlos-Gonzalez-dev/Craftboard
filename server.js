import http from 'http'
import { URL } from 'url'

const PORT = process.env.PORT || 3001

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // RSS Proxy endpoint
  if (req.url?.startsWith('/api/rss-proxy')) {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
      const targetUrl = parsedUrl.searchParams.get('url')

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'URL parameter is required' }))
        return
      }


      // Fetch the RSS feed using Node's built-in fetch (Node 18+)
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS-Reader/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      })

      if (!response.ok) {
        res.writeHead(response.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          error: `Failed to fetch RSS feed: ${response.statusText}` 
        }))
        return
      }

      const xmlText = await response.text()

      if (!xmlText || !xmlText.trim()) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Empty response from RSS feed' }))
        return
      }

      // Return the XML content
      res.writeHead(200, { 
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      })
      res.end(xmlText)
    } catch (error) {
      console.error('Error fetching RSS feed:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        error: 'Failed to fetch RSS feed',
        message: error.message 
      }))
    }
    return
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
})


