<script setup lang="ts">
defineOptions({
  name: 'MusicView'
})

import { ref, computed, onMounted, onUnmounted, watch, h, onActivated, inject } from 'vue'
import { RefreshCw, Music as MusicIcon, ExternalLink, GripVertical, X, ChevronDown, ChevronUp, Maximize, Minimize } from 'lucide-vue-next'
import {
  getApiUrl,
  getApiToken,
  getCacheExpiryMs,
  getCraftLinkPreference,
  buildCraftAppLink,
  buildCraftWebLink,
  getSpaceId,
  getShareToken,
} from '../utils/craftApi'
import { useRoute } from 'vue-router'
import ViewSubheader from '../components/ViewSubheader.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const route = useRoute()
const registerRefresh =
  inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader =
  inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

// API Configuration
const apiBaseUrl = ref('')
const selectedDocumentId = ref<string | null>(null)

// Collection IDs
const musicCollectionId = ref<string | null>(null)
const artistCollectionId = ref<string | null>(null)
const genreCollectionId = ref<string | null>(null)

// Cache keys
const CACHE_PREFIX = 'music-cache-'

// State
const music = ref<any[]>([])
const artistsData = ref<any[]>([])
const genresData = ref<any[]>([])
const selectedPlaylist = ref<any>(null)
const searchQuery = ref('')
const selectedGenre = ref('')
const selectedArtist = ref('')
const selectedTag = ref('')
const errorMessage = ref('')
const isLoading = ref(true)

// Progress tracking
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

// YouTube Player Component
const YoutubePlayer = {
  props: {
    url: {
      type: String,
      required: true,
    },
  },
  setup(props: { url: string }) {
    const playerId = ref(`player-${Date.now()}`)
    const embedUrl = ref('')
    const playerType = ref('') // 'youtube', 'soundcloud', or 'bandcamp'
    const videoId = ref('')
    const playlistId = ref('')
    const isPlaylist = ref(false)
    const playerError = ref(false)
    const isRetrying = ref(false)
    const playerWidth = ref(1280)
    const playerHeight = ref(720)
    let player: any = null
    let retryCount = 0
    const maxRetries = 3

    const parseUrl = (url: string) => {
      // Check for SoundCloud embed URL
      if (url.includes('soundcloud.com/player')) {
        playerType.value = 'soundcloud'
        let customUrl = url
        if (customUrl.includes('color=')) {
          customUrl = customUrl.replace(/color=%23[0-9a-fA-F]+/, 'color=%2314b8a6')
        } else {
          const separator = customUrl.includes('?') ? '&' : '?'
          customUrl += `${separator}color=%2314b8a6`
        }
        if (!customUrl.includes('auto_play=')) {
          customUrl += '&auto_play=true'
        }
        embedUrl.value = customUrl
        return
      }

      // Check for Bandcamp embed URL
      if (url.includes('bandcamp.com') && url.includes('EmbeddedPlayer')) {
        playerType.value = 'bandcamp'
        let customUrl = url
        if (!url.includes('bgcol=')) {
          customUrl = customUrl.replace(/\/$/, '') + '/bgcol=1e293b/linkcol=14b8a6/'
        }
        embedUrl.value = customUrl
        return
      }

      // Check for regular Bandcamp URL
      if (url.includes('bandcamp.com')) {
        playerType.value = 'bandcamp'
        embedUrl.value = 'about:blank'
        return
      }

      // YouTube handling
      playerType.value = 'youtube'
      embedUrl.value = ''

      const playlistMatch = url.match(/list=([^&]+)/)?.[1]
      if (playlistMatch) {
        isPlaylist.value = true
        playlistId.value = playlistMatch
        return
      }

      const videoMatch = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1]
      if (videoMatch) {
        isPlaylist.value = false
        videoId.value = videoMatch
      }
    }

    onMounted(() => {
      if (props.url) {
        parseUrl(props.url)
        if (playerType.value === 'youtube' && (videoId.value || playlistId.value)) {
          setTimeout(() => {
            loadYouTubeAPI()
          }, 100)
        }
      }
    })

    watch(
      () => props.url,
      (newUrl: string) => {
        if (!newUrl) return

        playerError.value = false
        retryCount = 0

        if (player && typeof player.destroy === 'function') {
          try {
            player.destroy()
            player = null
          } catch (e) {
            console.warn('Error destroying player on URL change:', e)
          }
        }

        parseUrl(newUrl)

        if (playerType.value === 'youtube' && (videoId.value || playlistId.value)) {
          playerId.value = `player-${Date.now()}`
          setTimeout(() => {
            if ((window as any).YT && (window as any).YT.Player) {
              initPlayer()
            } else {
              loadYouTubeAPI()
            }
          }, 100)
        }
      },
    )

    onUnmounted(() => {
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy()
        } catch (e) {
          console.warn('Error destroying player on unmount:', e)
        }
      }
    })

    const loadYouTubeAPI = () => {
      if (!(window as any).YT) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
        ;(window as any).onYouTubeIframeAPIReady = () => {
          initPlayer()
        }
      } else if ((window as any).YT.Player) {
        initPlayer()
      }
    }

    const initPlayer = () => {
      try {
        playerError.value = false
        const container = document.getElementById(playerId.value)?.parentElement
        if (!container) {
          console.error('Player container not found')
          playerError.value = true
          return
        }

        // Get current container dimensions
        const containerWidth = container.offsetWidth || 1280
        const containerHeight = Math.round(containerWidth * 0.5625)
        playerWidth.value = containerWidth
        playerHeight.value = containerHeight

        const config: any = {
          height: containerHeight,
          width: containerWidth,
          playerVars: {
            autoplay: 1,
            rel: 0,
          },
          events: {
            onError: (event: any) => {
              console.error('YouTube player error:', event.data)
              playerError.value = true
            },
            onReady: (event: any) => {
              retryCount = 0
              playerError.value = false
              // Store player instance for external access
              ;(window as any)[`ytplayer_${playerId.value}`] = player
            },
          },
        }

        if (isPlaylist.value) {
          config.playerVars.listType = 'playlist'
          config.playerVars.list = playlistId.value
        } else {
          config.videoId = videoId.value
        }

        player = new (window as any).YT.Player(playerId.value, config)
      } catch (error) {
        console.error('Error initializing YouTube player:', error)
        playerError.value = true
      }
    }

    const retryPlayer = () => {
      if (retryCount >= maxRetries) {
        console.error('Max retries reached for YouTube player')
        return
      }

      isRetrying.value = true
      retryCount++

      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy()
        } catch (e) {
          console.warn('Error destroying player:', e)
        }
      }

      setTimeout(() => {
        playerId.value = `player-${Date.now()}`
        playerError.value = false
        isRetrying.value = false

        if ((window as any).YT && (window as any).YT.Player) {
          initPlayer()
        } else {
          loadYouTubeAPI()
        }
      }, 1000)
    }

    return () => {
      if (playerType.value === 'youtube') {
        return h('div', { class: 'youtube-player-container' }, [
          h('div', { id: playerId.value, class: 'youtube-player' }),
          playerError.value && !isRetrying.value
            ? h('div', { class: 'player-error-overlay' }, [
                h('div', { class: 'player-error-content' }, [
                  h(
                    'svg',
                    {
                      class: 'error-icon',
                      fill: 'none',
                      stroke: 'currentColor',
                      viewBox: '0 0 24 24',
                    },
                    [
                      h('path', {
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                        'stroke-width': '2',
                        d: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                      }),
                    ],
                  ),
                  h('p', { class: 'error-title' }, 'Failed to load video'),
                  h('button', { class: 'retry-button', onClick: retryPlayer }, 'Retry'),
                ]),
              ])
            : null,
          isRetrying.value
            ? h('div', { class: 'player-loading-overlay' }, [
                h('div', { class: 'player-loading-content' }, [
                  h('svg', { class: 'loading-spinner', fill: 'none', viewBox: '0 0 24 24' }, [
                    h('circle', {
                      class: 'spinner-circle',
                      cx: '12',
                      cy: '12',
                      r: '10',
                      stroke: 'currentColor',
                      'stroke-width': '4',
                    }),
                    h('path', {
                      class: 'spinner-path',
                      fill: 'currentColor',
                      d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
                    }),
                  ]),
                  h('p', null, 'Retrying...'),
                ]),
              ])
            : null,
        ])
      } else if (playerType.value === 'soundcloud') {
        return h('div', { class: 'soundcloud-player' }, [
          h('iframe', {
            src: embedUrl.value,
            class: 'soundcloud-iframe',
            scrolling: 'no',
            frameborder: 'no',
            allow: 'autoplay',
          }),
        ])
      } else if (playerType.value === 'bandcamp') {
        return h('div', { class: 'bandcamp-player' }, [
          embedUrl.value !== 'about:blank'
            ? h('iframe', {
                src: embedUrl.value,
                class: 'bandcamp-iframe',
                seamless: true,
                width: '350',
                height: '470',
                style: {
                  border: '0px',
                  maxWidth: '100%',
                },
              })
            : h('div', { class: 'bandcamp-message' }, [
                h(
                  'svg',
                  {
                    class: 'message-icon',
                    fill: 'none',
                    stroke: 'currentColor',
                    viewBox: '0 0 24 24',
                  },
                  [
                    h('path', {
                      'stroke-linecap': 'round',
                      'stroke-linejoin': 'round',
                      'stroke-width': '2',
                      d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                    }),
                  ],
                ),
                h('p', { class: 'message-title' }, 'Bandcamp Embed URL Required'),
                h(
                  'p',
                  { class: 'message-text' },
                  "Please use the embed URL from Bandcamp's Share/Embed button instead of the regular album URL.",
                ),
              ]),
        ])
      }
      return h('div')
    }
  },
}

// Methods
const getHeaders = () => {
  const token = getApiToken()
  if (!token) {
    throw new Error('Craft API token not configured')
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

const loadApiUrl = () => {
  apiBaseUrl.value = getApiUrl() || ''
  if (!apiBaseUrl.value) {
    errorMessage.value = 'Craft API URL not configured. Please configure it in Settings.'
    isLoading.value = false
    return
  }

  // Load document ID from settings (use collections document ID only)
  initializeMusic(false)
}

const initializeMusic = async (forceRefresh = false) => {
  if (!apiBaseUrl.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  completedApiCalls.value = 0
  totalApiCalls.value = 0

  // Load collection IDs from settings
  const playlistsId = localStorage.getItem('collection-id-playlists')
  const artistsId = localStorage.getItem('collection-id-artists')
  const genresId = localStorage.getItem('collection-id-genres')

  if (!playlistsId || !artistsId || !genresId) {
    errorMessage.value =
      'Collection IDs not configured. Please configure them in Settings > API > Collection IDs.'
    isLoading.value = false
    return
  }

  musicCollectionId.value = playlistsId
  artistCollectionId.value = artistsId
  genreCollectionId.value = genresId

  // Count API calls needed
  let apiCallCount = 0
  if (forceRefresh || !getCachedData()) {
    apiCallCount += 3 // fetchData: music + artists + genres
  }

  totalApiCalls.value = apiCallCount

  // Fetch data with the collection IDs
  if (musicCollectionId.value && artistCollectionId.value && genreCollectionId.value) {
    await fetchData(forceRefresh)
  }
}

const getCacheKey = () => {
  if (!musicCollectionId.value || !artistCollectionId.value || !genreCollectionId.value) return null
  return `${CACHE_PREFIX}${musicCollectionId.value}-${artistCollectionId.value}-${genreCollectionId.value}`
}

const getCachedData = () => {
  try {
    const cacheKey = getCacheKey()
    if (!cacheKey) return null
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()

    // Check if cache is still valid (less than 24 hours old)
    const cacheExpiryMs = getCacheExpiryMs()
    if (cacheExpiryMs > 0 && now - timestamp < cacheExpiryMs) {
      return data
    }

    // Cache expired, remove it
    localStorage.removeItem(cacheKey)
    return null
  } catch (error) {
    console.error('Error reading cache:', error)
    return null
  }
}

const setCachedData = (data: { music: any[]; artists: any[]; genres: any[] }) => {
  try {
    const cacheKey = getCacheKey()
    if (!cacheKey) return
    const cacheData = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.error('Error saving cache:', error)
  }
}

const clearCache = () => {
  try {
    const cacheKey = getCacheKey()
    if (cacheKey) {
      localStorage.removeItem(cacheKey)
    }
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}

const fetchData = async (forceRefresh = false) => {
  if (
    !apiBaseUrl.value ||
    !musicCollectionId.value ||
    !artistCollectionId.value ||
    !genreCollectionId.value
  ) {
    isLoading.value = false
    return
  }

  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedData()
    if (cached) {
      music.value = cached.music || []
      artistsData.value = cached.artists || []
      genresData.value = cached.genres || []
      isLoading.value = false
      return
    }
  } else {
    clearCache()
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const [musicRes, artistsRes, genresRes] = await Promise.all([
      fetch(`${apiBaseUrl.value}/collections/${musicCollectionId.value}/items?maxDepth=-1`, {
        headers: getHeaders(),
      }),
      fetch(`${apiBaseUrl.value}/collections/${artistCollectionId.value}/items?maxDepth=-1`, {
        headers: getHeaders(),
      }),
      fetch(`${apiBaseUrl.value}/collections/${genreCollectionId.value}/items?maxDepth=-1`, {
        headers: getHeaders(),
      }),
    ])

    completedApiCalls.value += 3 // All 3 API calls completed

    if (!musicRes.ok || !artistsRes.ok || !genresRes.ok) {
      throw new Error('Failed to fetch data from the server')
    }

    const [musicData, artistsDataRes, genresDataRes] = await Promise.all([
      musicRes.json(),
      artistsRes.json(),
      genresRes.json(),
    ])

    const musicItems = musicData.items || []
    const artistsItems = artistsDataRes.items || []
    const genresItems = genresDataRes.items || []

    music.value = musicItems
    artistsData.value = artistsItems
    genresData.value = genresItems

    // Cache the data
    setCachedData({
      music: musicItems,
      artists: artistsItems,
      genres: genresItems,
    })
  } catch (error) {
    console.error('Error loading playlists:', error)
    errorMessage.value =
      'Oops! Unable to load playlists. Please check your connection and try again.'
    completedApiCalls.value += 3 // Count as completed even on error
  } finally {
    isLoading.value = false
  }
}

const refreshData = () => {
  // Clear cache and force refresh
  clearCache()
  initializeMusic(true) // Force refresh everything
}

const openCollectionInCraft = () => {
  if (!musicCollectionId.value) return
  const preference = getCraftLinkPreference()
  const spaceId = getSpaceId()
  if (!spaceId) return

  if (preference === 'web') {
    const webLink = buildCraftWebLink(musicCollectionId.value, spaceId, getShareToken())
    if (webLink) {
      window.open(webLink, '_blank')
    }
  } else {
    const appLink = buildCraftAppLink(musicCollectionId.value, spaceId)
    if (appLink) {
      window.location.href = appLink
    }
  }
}

const selectPlaylist = (playlist: any) => {
  selectedPlaylist.value = playlist
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedGenre.value = ''
  selectedArtist.value = ''
  selectedTag.value = ''
}

const selectRandomPlaylist = () => {
  if (filteredMusic.value.length === 0) return

  if (filteredMusic.value.length === 1) {
    selectedPlaylist.value = filteredMusic.value[0]
    return
  }

  const availablePlaylists = filteredMusic.value.filter((p) => p.id !== selectedPlaylist.value?.id)

  if (availablePlaylists.length > 0) {
    const randomIndex = Math.floor(Math.random() * availablePlaylists.length)
    selectedPlaylist.value = availablePlaylists[randomIndex]
  }
}

const navigateToMusic = () => {
  if (route.name !== 'music') {
    window.location.hash = '#/music'
  }
}

// Floating player state
const isCollapsed = ref(false)
const isFullscreen = ref(false)
const playerPosition = ref({ x: 0, y: 0 })
const positionBeforeCollapse = ref({ x: 0, y: 0 })
const stateBeforeFullscreen = ref({
  position: { x: 0, y: 0 },
  size: { width: 350, height: 250 },
  moved: false
})
const playerSize = ref({ width: 350, height: 250 })
const isDragging = ref(false)
const isResizing = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const userHasMoved = ref(false)

// Watch for player size changes and update YouTube iframe
watch(
  () => playerSize.value,
  (newSize) => {
    if (selectedPlaylist.value) {
      // Find and resize YouTube player
      const playerWrapper = document.querySelector('.global-player-wrapper')
      if (playerWrapper) {
        const playerId = playerWrapper.querySelector('.youtube-player')?.id
        if (playerId) {
          const player = (window as any)[`ytplayer_${playerId}`]
          if (player && typeof player.setSize === 'function') {
            const height = Math.round(newSize.width * 0.5625) // 16:9 ratio
            player.setSize(newSize.width, height)
          }
        }
      }
    }
  },
  { deep: true }
)

const toggleCollapse = () => {
  if (!isCollapsed.value) {
    // Collapsing - save current position
    positionBeforeCollapse.value = { ...playerPosition.value }
  } else {
    // Expanding - restore previous position
    playerPosition.value = { ...positionBeforeCollapse.value }
  }
  isCollapsed.value = !isCollapsed.value
}

const toggleFullscreen = () => {
  if (!isFullscreen.value) {
    // Entering fullscreen - save current state
    stateBeforeFullscreen.value = {
      position: { ...playerPosition.value },
      size: { ...playerSize.value },
      moved: userHasMoved.value
    }
    // Set fullscreen dimensions
    playerPosition.value = { x: 0, y: 0 }
    playerSize.value = { width: window.innerWidth, height: window.innerHeight }
    userHasMoved.value = true
    isFullscreen.value = true
  } else {
    // Exiting fullscreen - restore previous state
    playerPosition.value = { ...stateBeforeFullscreen.value.position }
    playerSize.value = { ...stateBeforeFullscreen.value.size }
    userHasMoved.value = stateBeforeFullscreen.value.moved
    isFullscreen.value = false
  }
}

const startDrag = (e: MouseEvent) => {
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - playerPosition.value.x,
    y: e.clientY - playerPosition.value.y
  }
  userHasMoved.value = true
}

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return
  playerPosition.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y
  }
}

const stopDrag = () => {
  isDragging.value = false
}

const startResize = (e: MouseEvent) => {
  e.stopPropagation()
  isResizing.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY
  }
}

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return
  const deltaX = e.clientX - dragStart.value.x
  const deltaY = e.clientY - dragStart.value.y
  playerSize.value = {
    width: Math.max(300, playerSize.value.width + deltaX),
    height: Math.max(200, playerSize.value.height + deltaY)
  }
  dragStart.value = { x: e.clientX, y: e.clientY }
}

const stopResize = () => {
  isResizing.value = false
}



// Add global mouse event listeners
onMounted(() => {
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('mouseup', stopResize)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('mouseup', stopResize)
})

// Computed
const genres = computed(() => {
  return genresData.value.map((g) => g.title).sort()
})

const genreTabs = computed(() => {
  const tabs = [{ id: '', label: 'All' }]
  genres.value.forEach((genre) => {
    tabs.push({ id: genre, label: genre })
  })
  if (hasUnknownGenre.value) {
    tabs.push({ id: 'Unknown', label: 'Unknown' })
  }
  return tabs
})

const artists = computed(() => {
  return artistsData.value.map((a) => a.title).sort()
})

const tags = computed(() => {
  const tagSet = new Set<string>()
  music.value.forEach((playlist) => {
    const playlistTags = playlist.properties?.tags
    if (Array.isArray(playlistTags)) {
      playlistTags.forEach((tag) => {
        if (tag) tagSet.add(tag.toLowerCase())
      })
    }
  })
  return Array.from(tagSet).sort()
})

const hasUnknownGenre = computed(() => {
  return music.value.some((playlist) => !playlist.properties?.genre?.relations?.[0]?.title)
})

const hasUnknownArtist = computed(() => {
  return music.value.some((playlist) => !playlist.properties?.artist?.relations?.[0]?.title)
})

const hasUnknownTag = computed(() => {
  return music.value.some(
    (playlist) => !playlist.properties?.tags || playlist.properties.tags.length === 0,
  )
})

const currentArtistImage = computed(() => {
  if (!selectedPlaylist.value) return null

  const artistTitle = selectedPlaylist.value.properties?.artist?.relations?.[0]?.title
  if (!artistTitle) return null

  const artist = artistsData.value.find((a) => a.title === artistTitle)
  if (!artist || !artist.content || artist.content.length === 0) return null

  const firstImage = artist.content.find((c: any) => c.type === 'image')
  return firstImage?.url || null
})

const filteredMusic = computed(() => {
  const filtered = music.value.filter((playlist) => {
    const searchLower = searchQuery.value.toLowerCase()
    const searchMatch =
      !searchQuery.value ||
      playlist.title.toLowerCase().includes(searchLower) ||
      playlist.properties?.genre?.relations?.[0]?.title?.toLowerCase().includes(searchLower) ||
      playlist.properties?.artist?.relations?.[0]?.title?.toLowerCase().includes(searchLower) ||
      playlist.properties?.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))

    const genreMatch =
      !selectedGenre.value ||
      (selectedGenre.value === 'Unknown'
        ? !playlist.properties?.genre?.relations?.[0]?.title
        : playlist.properties?.genre?.relations?.[0]?.title === selectedGenre.value)

    const artistMatch =
      !selectedArtist.value ||
      (selectedArtist.value === 'Unknown'
        ? !playlist.properties?.artist?.relations?.[0]?.title
        : playlist.properties?.artist?.relations?.[0]?.title === selectedArtist.value)

    const tagMatch =
      !selectedTag.value ||
      (selectedTag.value === 'untagged'
        ? !playlist.properties?.tags || playlist.properties.tags.length === 0
        : playlist.properties?.tags?.some((tag: string) => tag.toLowerCase() === selectedTag.value))

    return searchMatch && genreMatch && artistMatch && tagMatch
  })

  return filtered.sort((a, b) => {
    const aPinned = a.properties?.pinned || false
    const bPinned = b.properties?.pinned || false
    if (aPinned === bPinned) return 0
    return aPinned ? -1 : 1
  })
})

// Load API URL on mount and when component is activated (for keep-alive)
onMounted(() => {
  loadApiUrl()
  if (registerRefresh) {
    registerRefresh(String(route.name), refreshData)
  }

  // Register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value) {
    setSubheader({
      right: () => [
        h(
          SubheaderButton,
          { title: 'Open Playlists Collection in Craft', onClick: openCollectionInCraft },
          {
            default: () => h(ExternalLink, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          { title: 'Refresh music library', onClick: refreshData },
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

// Watch for changes to update subheader
watch([errorMessage, isLoading], () => {
  if (setSubheader) {
    if (errorMessage.value || isLoading.value) {
      setSubheader(null)
    } else {
      setSubheader({
        right: () => [
          h(
            SubheaderButton,
            { title: 'Open Playlists Collection in Craft', onClick: openCollectionInCraft },
            {
              default: () => h(ExternalLink, { size: 16 }),
            },
          ),
          h(
            SubheaderButton,
            { title: 'Refresh music library', onClick: refreshData },
            {
              default: () => h(RefreshCw, { size: 16 }),
            },
          ),
        ],
      })
    }
  }
})

// Also reload when component is activated (for keep-alive)
onActivated(() => {
  loadApiUrl()
  // Re-register subheader
  if (setSubheader && !errorMessage.value && !isLoading.value) {
    setSubheader({
      right: () => [
        h(
          SubheaderButton,
          { title: 'Open Playlists Collection in Craft', onClick: openCollectionInCraft },
          {
            default: () => h(ExternalLink, { size: 16 }),
          },
        ),
        h(
          SubheaderButton,
          { title: 'Refresh music library', onClick: refreshData },
          {
            default: () => h(RefreshCw, { size: 16 }),
          },
        ),
      ],
    })
  }
})

// Watch for route changes to reload if needed
watch(
  () => route.name,
  () => {
    if (route.name === 'music') {
      loadApiUrl()
    }
  },
)
</script>

<template>
  <div class="music-view">
    <!-- Error Container -->
    <div v-if="errorMessage" class="error-container">
      <MusicIcon :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ errorMessage }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="loading-container">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading playlists"
      />
    </div>

    <template v-else>
      <!-- Content Container -->
      <div class="music-content">
        <!-- Playlists List -->
        <div class="playlists-sidebar">
          <div class="sidebar-content">
            <!-- Filters -->
            <div class="filters">
              <div class="filter-group">
                <label class="filter-label">Search</label>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search playlists..."
                  class="filter-input"
                />
              </div>

              <div class="filter-group">
                <label class="filter-label">Genre</label>
                <select v-model="selectedGenre" class="filter-select">
                  <option value="">All</option>
                  <option v-for="genre in genres" :key="genre" :value="genre">
                    {{ genre }}
                  </option>
                  <option v-if="hasUnknownGenre" value="Unknown">Unknown</option>
                </select>
              </div>

              <div class="filter-group">
                <label class="filter-label">Artist</label>
                <select v-model="selectedArtist" class="filter-select">
                  <option value="">All</option>
                  <option v-for="artist in artists" :key="artist" :value="artist">
                    {{ artist }}
                  </option>
                  <option v-if="hasUnknownArtist" value="Unknown">Unknown</option>
                </select>
              </div>

              <div class="filter-group">
                <label class="filter-label">Tag</label>
                <select v-model="selectedTag" class="filter-select">
                  <option value="">All</option>
                  <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
                  <option v-if="hasUnknownTag" value="untagged">untagged</option>
                </select>
              </div>

              <button
                v-if="searchQuery || selectedGenre || selectedArtist || selectedTag"
                @click="clearFilters"
                class="clear-filters-button"
              >
                Clear filters
              </button>
            </div>

            <div class="playlists-header">
              <div class="playlists-count">{{ filteredMusic.length }} playlist(s)</div>
              <button
                @click="selectRandomPlaylist"
                :disabled="filteredMusic.length === 0"
                class="random-button"
                title="Play random playlist"
              >
                <RefreshCw :size="12" />
                Random
              </button>
            </div>

            <ul class="playlists-list">
              <li
                v-for="playlist in filteredMusic"
                :key="playlist.id"
                @click="selectPlaylist(playlist)"
                :class="[
                  'playlist-item',
                  { 'playlist-item-selected': selectedPlaylist?.id === playlist.id },
                  { 'playlist-item-pinned': playlist.properties?.pinned },
                ]"
              >
                <div class="playlist-content">
                  <svg
                    v-if="playlist.properties?.pinned"
                    class="pin-icon"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M10 3.5l2.5 5 5.5.5-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-.5z" />
                  </svg>
                  <h3 class="playlist-title">{{ playlist.title }}</h3>
                </div>
                <div class="playlist-details">
                  <div
                    v-if="playlist.properties?.artist?.relations?.[0]?.title"
                    class="playlist-detail"
                  >
                    <span class="detail-label">Artist:</span>
                    {{ playlist.properties.artist.relations[0].title }}
                  </div>
                  <div
                    v-if="playlist.properties?.genre?.relations?.[0]?.title"
                    class="playlist-detail"
                  >
                    <span class="detail-label">Genre:</span>
                    {{ playlist.properties.genre.relations[0].title }}
                  </div>
                  <div v-if="playlist.properties?.tags?.length > 0" class="playlist-tags">
                    <span v-for="tag in playlist.properties.tags" :key="tag" class="playlist-tag">
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Player -->
        <div class="player-section">
          <Teleport to="#global-music-player">
            <div 
              v-if="selectedPlaylist" 
              class="global-player-wrapper"
              :class="{ 
                'is-collapsed': isCollapsed,
                'is-dragging': isDragging,
                'is-resizing': isResizing,
                'is-fullscreen': isFullscreen,
                'user-positioned': userHasMoved
              }"
              :style="{
                transform: userHasMoved ? `translate(${playerPosition.x}px, ${playerPosition.y}px)` : undefined,
                width: !isCollapsed ? `${playerSize.width}px` : undefined,
                height: !isCollapsed ? `${playerSize.height}px` : undefined
              }"
            >
              <div class="floating-player-header">
                <div class="drag-handle" @mousedown="startDrag" title="Drag to move">
                  <GripVertical :size="14" />
                </div>
                <div class="floating-player-info">
                  <img 
                    v-if="currentArtistImage" 
                    :src="currentArtistImage" 
                    :alt="selectedPlaylist.properties?.artist?.relations?.[0]?.title"
                    class="floating-artist-image"
                  />
                  <MusicIcon v-else :size="16" class="floating-icon" />
                  <div class="floating-text">
                    <div class="floating-title">{{ selectedPlaylist.title }}</div>
                    <div class="floating-artist" v-if="selectedPlaylist.properties?.artist?.relations?.[0]?.title">
                      {{ selectedPlaylist.properties.artist.relations[0].title }}
                    </div>
                  </div>
                </div>
                <div class="header-buttons">
                  <button 
                    @click.stop="toggleFullscreen" 
                    class="header-button"
                    :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
                  >
                    <Minimize v-if="isFullscreen" :size="14" />
                    <Maximize v-else :size="14" />
                  </button>
                  <button 
                    v-if="!isFullscreen"
                    @click.stop="toggleCollapse" 
                    class="header-button"
                    :title="isCollapsed ? 'Expand player' : 'Collapse player'"
                  >
                    <ChevronUp v-if="isCollapsed" :size="14" />
                    <ChevronDown v-else :size="14" />
                  </button>
                  <button 
                    v-if="!isFullscreen"
                    @click.stop="navigateToMusic" 
                    class="header-button"
                    title="Go to Music view"
                  >
                    <ExternalLink :size="14" />
                  </button>
                  <button 
                    v-if="!isFullscreen"
                    @click.stop="selectedPlaylist = null" 
                    class="header-button"
                    title="Close player"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>
              <div class="floating-player-content" :class="{ 'is-hidden': isCollapsed }">
                <component
                  :is="YoutubePlayer"
                  :url="selectedPlaylist.properties.url"
                  :key="selectedPlaylist.id"
                />
              </div>
              <div 
                v-if="!isCollapsed" 
                class="resize-handle"
                @mousedown="startResize"
              ></div>
            </div>
          </Teleport>

          <div
            v-if="selectedPlaylist"
            class="player-header"
            :class="{ 'has-background': currentArtistImage }"
          >
            <div
              v-if="currentArtistImage"
              class="artist-background"
              :style="{ backgroundImage: `url(${currentArtistImage})` }"
            ></div>

            <div class="player-info">
              <div class="player-info-content">
                <img
                  v-if="currentArtistImage"
                  :src="currentArtistImage"
                  :alt="selectedPlaylist.properties.artist?.relations?.[0]?.title"
                  class="artist-image"
                />
                <div class="player-text">
                  <h2 class="playlist-name">{{ selectedPlaylist.title }}</h2>
                  <div class="playlist-meta">
                    <span
                      v-if="selectedPlaylist.properties.genre?.relations?.[0]?.title"
                      class="meta-item"
                    >
                      <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                        />
                      </svg>
                      {{ selectedPlaylist.properties.genre.relations[0].title }}
                    </span>
                    <span v-if="selectedPlaylist.properties.artist" class="meta-item">
                      <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      {{ selectedPlaylist.properties.artist?.relations?.[0]?.title }}
                    </span>
                    <span v-if="selectedPlaylist.properties.tags?.length > 0" class="meta-item">
                      <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      <span class="meta-tags">
                        <span
                          v-for="tag in selectedPlaylist.properties.tags"
                          :key="tag"
                          class="meta-tag"
                        >
                          {{ tag }}
                        </span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="player-content">
            <div v-if="selectedPlaylist" class="player-display-wrapper" id="music-view-player-target">
              <!-- Player is rendered here via teleport from global container -->
            </div>
            <div v-else class="player-empty">
              <MusicIcon :size="64" class="empty-icon" />
              <p class="empty-text">Select a playlist to start listening</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.music-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.music-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (min-width: 768px) {
  .music-content {
    flex-direction: row;
  }
}

.playlists-sidebar {
  width: 100%;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  overflow-y: auto;
  max-height: 45vh;
  position: relative;
}

@media (min-width: 768px) {
  .playlists-sidebar {
    width: 256px;
    max-height: none;
    border-bottom: none;
    border-right: 1px solid var(--border-primary);
  }
}

.sidebar-content {
  padding: 12px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-button:hover:not(:disabled) {
  background: var(--bg-primary);
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-text {
  display: none;
}

@media (min-width: 640px) {
  .refresh-text {
    display: inline;
  }
}

.spinning {
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

.error-container {
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

.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
  text-align: center;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

.spinner-circle {
  opacity: 0.25;
}

.spinner-path {
  opacity: 0.75;
}

.filters {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.filter-input,
.filter-select {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.filter-input:focus,
.filter-select:focus {
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.filter-input::placeholder {
  color: var(--text-tertiary);
}

.clear-filters-button {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-filters-button:hover {
  background: var(--bg-primary);
}

.playlists-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.playlists-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.random-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--btn-primary-bg);
  border: none;
  color: var(--btn-primary-text);
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.random-button:hover:not(:disabled) {
  background: var(--btn-primary-hover);
}

.random-button:disabled {
  background: var(--bg-tertiary);
  cursor: not-allowed;
  opacity: 0.5;
}

.playlists-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.playlist-item {
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-tertiary);
  border-left: 2px solid transparent;
}

.playlist-item:hover {
  background: var(--bg-primary);
}

.playlist-item-selected {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.playlist-item-pinned {
  border-left-color: #facc15;
}

.playlist-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.pin-icon {
  width: 16px;
  height: 16px;
  color: #facc15;
  flex-shrink: 0;
  margin-top: 2px;
}

.playlist-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px 0;
  flex: 1;
}

.playlist-details {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.playlist-detail {
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-item-selected .playlist-detail {
  color: rgba(255, 255, 255, 0.8);
}

.detail-label {
  color: var(--text-tertiary);
}

.playlist-item-selected .detail-label {
  color: rgba(255, 255, 255, 0.6);
}

.playlist-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.playlist-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.playlist-item-selected .playlist-tag {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.player-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.player-header {
  position: relative;
  background: transparent;
  border-bottom: 1px solid var(--border-primary);
  padding: 16px;
  overflow: hidden;
}

.artist-background {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.2;
}

.artist-background::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, var(--bg-secondary) 0%, var(--bg-secondary) 100%);
}

.player-info {
  position: relative;
  z-index: 10;
}

.player-info-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.artist-image {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .artist-image {
    width: 80px;
    height: 80px;
  }
}

.player-text {
  flex: 1;
  min-width: 0;
}

.playlist-name {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

@media (min-width: 768px) {
  .playlist-name {
    font-size: 24px;
  }
}

.playlist-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 14px;
}

@media (min-width: 768px) {
  .playlist-meta {
    gap: 16px;
    font-size: 16px;
  }
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (min-width: 768px) {
  .meta-item {
    gap: 8px;
  }
}

.meta-icon {
  width: 16px;
  height: 16px;
}

@media (min-width: 768px) {
  .meta-icon {
    width: 20px;
    height: 20px;
  }
}

.meta-tags {
  display: flex;
  gap: 6px;
}

.meta-tag {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 12px;
}

.player-placeholder {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-tertiary);
  position: relative;
  z-index: 10;
}

@media (min-width: 768px) {
  .player-placeholder {
    font-size: 24px;
  }
}

.player-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  background-color: var(--bg-primary);
  background-image:
    linear-gradient(var(--bg-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px);
  background-size: 40px 40px;
}

@media (max-width: 767px) {
  .player-content {
    padding-top: 150px;
  }
}

.player-wrapper {
  width: 100%;
  max-width: 1280px;
}

.player-display-wrapper {
  width: 100%;
  max-width: 1280px;
  min-height: 400px;
}

.player-empty {
  text-align: center;
  color: var(--text-tertiary);
}

.empty-icon {
  margin: 0 auto 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
}

@media (min-width: 768px) {
  .empty-text {
    font-size: 20px;
  }
}

/* YouTube Player Styles */
.global-player-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.global-player-wrapper.is-dragging {
  cursor: grabbing;
}

.global-player-wrapper.is-collapsed {
  height: auto !important;
  width: 350px !important;
  max-width: calc(100vw - 40px) !important;
}

.global-player-wrapper.is-fullscreen {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 9999 !important;
  transform: none !important;
  border-radius: 0 !important;
}

.global-player-wrapper.user-positioned {
  position: fixed;
  bottom: auto !important;
  right: auto !important;
}

.floating-player-header {
  padding: 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
  transition: background 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  user-select: none;
}

.drag-handle {
  color: var(--text-tertiary);
  cursor: move;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.drag-handle:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.drag-handle:active {
  cursor: grabbing;
}

.floating-player-header:active {
  cursor: default;
}

.floating-player-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.floating-icon {
  color: var(--btn-primary-bg);
  flex-shrink: 0;
}

.floating-artist-image {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.floating-text {
  flex: 1;
  min-width: 0;
}

.floating-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-button {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.header-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.floating-player-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  transition: all 0.3s ease;
}

.floating-player-content.is-hidden {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}

.global-music-player.route-music .floating-player-content {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 50%,
    var(--text-tertiary) 50%,
    var(--text-tertiary) 60%,
    transparent 60%,
    transparent 70%,
    var(--text-tertiary) 70%,
    var(--text-tertiary) 80%,
    transparent 80%
  );
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.resize-handle:hover {
  opacity: 1;
}

.player-empty {
  text-align: center;
  color: var(--text-tertiary);
}

.empty-icon {
  margin: 0 auto 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
}

@media (min-width: 768px) {
  .empty-text {
    font-size: 20px;
  }
}

/* YouTube Player Styles */
.global-player-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
}

.floating-player-header {
  padding: 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
  cursor: pointer;
  transition: background 0.2s ease;
}

.floating-player-header:hover {
  background: var(--bg-primary);
}

.floating-player-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.floating-icon {
  color: var(--btn-primary-bg);
  flex-shrink: 0;
}

.floating-text {
  flex: 1;
  min-width: 0;
}

.floating-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-player-content {
  flex: 1;
  min-height: 0;
}

.route-music .floating-player-content {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.player-display-wrapper {
  width: 100%;
  max-width: 1280px;
}

.playing-indicator {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 48px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
}

.playing-icon {
  width: 64px;
  height: 64px;
  color: var(--btn-primary-bg);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.playing-text {
  flex: 1;
}

.playing-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.playing-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
}

.youtube-player-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
  overflow: hidden;
}

.youtube-player {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.youtube-player :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
}

.player-error-overlay,
.player-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.95);
  z-index: 10;
}

.player-error-content,
.player-loading-content {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem;
}

.error-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
  color: #ef4444;
}

.error-title {
  margin-bottom: 1rem;
  font-weight: 600;
  font-size: 1.125rem;
}

.retry-button {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  padding: 0.5rem 1.5rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.retry-button:hover {
  background: var(--btn-primary-hover);
}

/* SoundCloud Player Styles */
.soundcloud-player {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.soundcloud-iframe {
  border: 0;
  width: 100%;
  height: 400px;
  max-width: 100%;
}

/* Bandcamp Player Styles */
.bandcamp-player {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  padding: 16px 0;
  overflow-x: auto;
}

.bandcamp-iframe {
  border: 0px;
  width: 350px;
  height: 470px;
  max-width: 100%;
}

.bandcamp-message {
  width: 100%;
  max-width: 700px;
  min-height: 470px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  padding: 2rem;
  text-align: center;
}

.message-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
  opacity: 0.5;
}

.message-title {
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.message-text {
  font-size: 0.875rem;
  opacity: 0.8;
}
</style>
