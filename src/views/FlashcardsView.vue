<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, inject, h } from 'vue'
import { marked } from 'marked'
import {
  X,
  RotateCcw,
  ChevronRight,
  BookOpen,
  Clock,
  RefreshCw,
  Eye,
  Check,
  BarChart3,
  Star,
  Trophy,
  Flag,
  ArrowLeft,
  ExternalLink,
} from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
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
import ViewSubheader from '../components/ViewSubheader.vue'
import SubheaderButton from '../components/SubheaderButton.vue'
import ProgressIndicator from '../components/ProgressIndicator.vue'

const route = useRoute()
const registerRefresh = inject<(routeName: string, refreshFn: () => void | Promise<void>) => void>('registerRefresh')
const setSubheader = inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

// Session version for localStorage compatibility
const SESSION_VERSION = 1

// Cache keys
const CACHE_PREFIX = 'flashcards-cache-'

// API Configuration
const apiBaseUrl = ref('')
const selectedDocumentId = ref<string | null>(null)
const router = useRouter()

// Collection IDs
const decksCollectionId = ref<string | null>(null)
const flashcardsCollectionId = ref<string | null>(null)

// State
const loading = ref(true)
const error = ref<string | null>(null)
const currentView = ref<'decks' | 'study' | 'summary'>('decks')

// Progress tracking
const totalApiCalls = ref(0)
const completedApiCalls = ref(0)

// Data
const decks = ref<any[]>([])
const flashcards = ref<any[]>([])
const sessions = ref<any[]>([])
const selectedDeck = ref<any>(null)
const currentDeckFlashcards = ref<any[]>([])
const currentCardIndex = ref(0)
const isFlipped = ref(false)
const isTransitioning = ref(false)
const showExitModal = ref(false)

// Timer
const startTime = ref<number | null>(null)
const currentTime = ref<number | null>(null)
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)
const elapsedTime = ref(0)

// Results
const results = ref({
  total: 0,
  correct: 0,
  incorrect: 0,
})

// Image cache
const imageCache = ref(new Set<string>())
const preloadedImages = ref<Record<string, HTMLImageElement>>({})

// Computed
const apiId = computed(() => {
  const match = apiBaseUrl.value.match(/\/links\/([^\/]+)\//)
  return match ? match[1] : 'default'
})

const currentCard = computed(() => {
  return currentDeckFlashcards.value[currentCardIndex.value] || null
})

const progress = computed(() => {
  if (currentDeckFlashcards.value.length === 0) return 0
  return ((currentCardIndex.value + 1) / currentDeckFlashcards.value.length) * 100
})

const scorePercentage = computed(() => {
  if (results.value.total === 0) return 0
  return Math.round((results.value.correct / results.value.total) * 100)
})

const scoreColor = computed(() => {
  const percentage = scorePercentage.value
  if (percentage >= 80) return '#22c55e' // green
  if (percentage >= 60) return '#f97316' // orange
  return '#f43f5e' // red
})

const scoreTextClass = computed(() => {
  const percentage = scorePercentage.value
  if (percentage >= 80) return 'text-success'
  if (percentage >= 60) return 'text-warning'
  return 'text-danger'
})

const scoreMessage = computed(() => {
  const percentage = scorePercentage.value
  if (percentage >= 90) return 'Outstanding! 🌟'
  if (percentage >= 80) return 'Great job! 👏'
  if (percentage >= 70) return 'Good work! 👍'
  if (percentage >= 60) return 'Keep practicing! 🔄'
  return 'Keep learning! 💪'
})

const circumference = computed(() => 2 * Math.PI * 88)

const formattedTimer = computed(() => {
  if (!startTime.value || !currentTime.value) return '0:00'
  const elapsed = Math.floor((currentTime.value - startTime.value) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const formattedElapsedTime = computed(() => {
  const minutes = Math.floor(elapsedTime.value / 60)
  const seconds = elapsedTime.value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const recentSessions = computed(() => {
  if (!sessions.value || sessions.value.length === 0) return []
  return [...sessions.value].sort((a, b) => b.title.localeCompare(a.title)).slice(0, 10)
})

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
    error.value = 'Craft API URL not configured. Please configure it in Settings.'
    loading.value = false
    return
  }

  initializeFlashcards()
}

const refreshFlashcards = async () => {
  clearCache()
  await initializeFlashcards(true)
}

const openCollectionInCraft = () => {
  if (!decksCollectionId.value) return
  const preference = getCraftLinkPreference()
  const spaceId = getSpaceId()
  if (!spaceId) return

  if (preference === 'web') {
    const webLink = buildCraftWebLink(decksCollectionId.value, spaceId, getShareToken())
    if (webLink) {
      window.open(webLink, '_blank')
    }
  } else {
    const appLink = buildCraftAppLink(decksCollectionId.value, spaceId)
    if (appLink) {
      window.location.href = appLink
    }
  }
}

const initializeFlashcards = async (forceRefresh = false) => {
  if (!apiBaseUrl.value) {
    return
  }

  loading.value = true
  error.value = null
  completedApiCalls.value = 0
  totalApiCalls.value = 0

  // Load collection IDs from settings
  const decksId = localStorage.getItem('collection-id-decks')
  const flashcardsId = localStorage.getItem('collection-id-flashcards')
  
  if (!decksId || !flashcardsId) {
    error.value = 'Collection IDs not configured. Please configure them in Settings > API > Collection IDs.'
    loading.value = false
    return
  }

  decksCollectionId.value = decksId
  flashcardsCollectionId.value = flashcardsId

  // Count API calls needed
  let apiCallCount = 0
  if (forceRefresh || !getCachedData()) apiCallCount += 2 // loadDecks (2 calls: decks + flashcards)
  
  totalApiCalls.value = apiCallCount

  // Load decks with the collection IDs
  if (decksCollectionId.value && flashcardsCollectionId.value) {
    await loadDecks(forceRefresh)
  }
}

const getCacheKey = () => {
  if (!decksCollectionId.value || !flashcardsCollectionId.value) return null
  return `${CACHE_PREFIX}${decksCollectionId.value}-${flashcardsCollectionId.value}`
}

const getCachedData = () => {
  const cacheKey = getCacheKey()
  if (!cacheKey) return null

  try {
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    const cacheExpiryMs = getCacheExpiryMs()

    if (cacheExpiryMs > 0 && now - timestamp < cacheExpiryMs) {
      return data
    }

    localStorage.removeItem(cacheKey)
    return null
  } catch (error) {
    console.error('Error reading cache:', error)
    return null
  }
}

const setCachedData = (decks: any[], flashcards: any[]) => {
  const cacheKey = getCacheKey()
  if (!cacheKey) return

  try {
    const cacheData = {
      data: {
        decks,
        flashcards,
      },
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


const loadDecks = async (forceRefresh = false) => {
  if (!apiBaseUrl.value || !decksCollectionId.value || !flashcardsCollectionId.value) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = getCachedData()
      if (cached) {
        flashcards.value = cached.flashcards || []
        processDecks(cached.decks || [])

        // Load sessions from localStorage
        loadSessions()

        // Preload all images
        preloadAllImages()

        loading.value = false
        return
      }
    }

    // Fetch decks
    const decksUrl = `${apiBaseUrl.value}/collections/${decksCollectionId.value}/items`
    const decksResponse = await fetch(decksUrl, {
      method: 'GET',
      headers: getHeaders(),
    })
    if (!decksResponse.ok) {
      if (decksResponse.status === 404) {
        throw new Error('Deck collection not found. Please check your Collection IDs in Settings > API.')
      }
      throw new Error(`Failed to fetch decks (${decksResponse.status}). Please check your Collection IDs in Settings > API.`)
    }
    const decksData = await decksResponse.json()
    completedApiCalls.value++

    // Fetch flashcards
    const flashcardsUrl = `${apiBaseUrl.value}/collections/${flashcardsCollectionId.value}/items`
    const flashcardsResponse = await fetch(flashcardsUrl, {
      method: 'GET',
      headers: getHeaders(),
    })
    if (!flashcardsResponse.ok) {
      if (flashcardsResponse.status === 404) {
        throw new Error('Flashcard collection not found. Please check your Collection IDs in Settings > API.')
      }
      throw new Error(`Failed to fetch flashcards (${flashcardsResponse.status}). Please check your Collection IDs in Settings > API.`)
    }
    const flashcardsData = await flashcardsResponse.json()
    completedApiCalls.value++

    const decksItems = decksData.items || []
    const flashcardsItems = flashcardsData.items || []

    flashcards.value = flashcardsItems
    processDecks(decksItems)

    // Cache the items
    setCachedData(decksItems, flashcardsItems)

    // Load sessions from localStorage
    loadSessions()

    // Preload all images
    preloadAllImages()

    loading.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load data'
    loading.value = false
    console.error('Error loading data:', err)
  }
}

const loadSessions = () => {
  try {
    const sessionVersion = localStorage.getItem('flashcards-sessionVersion')
    const allSessionsData = localStorage.getItem('flashcards-sessions')

    // Check version compatibility
    if (sessionVersion !== String(SESSION_VERSION)) {
      console.warn(
        `Session version mismatch (stored: ${sessionVersion}, current: ${SESSION_VERSION}). Resetting sessions.`,
      )
      localStorage.removeItem('flashcards-sessions')
      localStorage.setItem('flashcards-sessionVersion', String(SESSION_VERSION))
      sessions.value = []
      return
    }

    const allSessions = allSessionsData ? JSON.parse(allSessionsData) : []

    // Filter sessions for current API
    sessions.value = allSessions.filter((session: any) => session.apiId === apiId.value)
  } catch (err) {
    console.error('Error loading sessions from localStorage:', err)
    sessions.value = []
  }
}

const extractImageUrls = () => {
  const imageUrls = new Set<string>()

  // Extract from decks
  decks.value.forEach((deck) => {
    if (deck.image) {
      imageUrls.add(deck.image)
    }
  })

  // Extract from flashcards
  flashcards.value.forEach((flashcard) => {
    if (flashcard.content && Array.isArray(flashcard.content)) {
      flashcard.content.forEach((item: any) => {
        if (item.type === 'image' && item.url) {
          imageUrls.add(item.url)
        }
      })
    }
  })

  return Array.from(imageUrls)
}

const preloadAllImages = () => {
  const imageUrls = extractImageUrls()


  imageUrls.forEach((url) => {
    if (!imageCache.value.has(url)) {
      const img = new Image()

      img.onload = () => {
        imageCache.value.add(url)
        preloadedImages.value[url] = img
      }

      img.onerror = () => {
        console.warn(`✗ Failed to preload: ${url.substring(0, 50)}...`)
      }

      img.src = url
    }
  })
}

const processDecks = (deckItems: any[]) => {
  decks.value = deckItems
    .map((deck) => {
      // Extract image from content
      let imageUrl = null
      if (deck.content && deck.content.length > 0) {
        const imageContent = deck.content.find((item: any) => item.type === 'image')
        if (imageContent) {
          imageUrl = imageContent.url
        }
      }

      // Count flashcards
      const flashcardCount = deck.properties?.flashcards?.relations?.length || 0

      return {
        id: deck.id,
        title: deck.title,
        image: imageUrl,
        flashcardCount: flashcardCount,
      }
    })
    .filter((deck) => deck.title && deck.flashcardCount > 0)
}

const getFlashcardCount = (deck: any) => {
  return deck.flashcardCount || 0
}

const getDeckImage = (deck: any) => {
  return deck.image
}

const getSessionCount = (deck: any) => {
  if (!sessions.value || sessions.value.length === 0) return 0
  return sessions.value.filter((session: any) => session.deckId === deck.id).length
}

const getAverageScore = (deck: any) => {
  if (!sessions.value || sessions.value.length === 0) return null

  const deckSessions = sessions.value.filter((session: any) => session.deckId === deck.id)
  if (deckSessions.length === 0) return null

  const totalScore = deckSessions.reduce((sum: number, session: any) => sum + session.score, 0)
  return Math.round(totalScore / deckSessions.length)
}

const getAverageScoreClass = (avgScore: number | null) => {
  if (avgScore === null) return ''
  if (avgScore >= 80) return 'text-success'
  if (avgScore >= 60) return 'text-warning'
  return 'text-danger'
}

const getDeckNameForSession = (session: any) => {
  const deck = decks.value.find((d) => d.id === session.deckId)
  return deck ? deck.title : 'Unknown Deck'
}

const getScoreClass = (score: number) => {
  if (score >= 80) return 'score-high'
  if (score >= 60) return 'score-medium'
  return 'score-low'
}

const formatSessionDate = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const clearSessions = () => {
  if (confirm('Are you sure you want to clear all session history for this API?')) {
    // Load all sessions
    const allSessionsData = localStorage.getItem('flashcards-sessions')
    const allSessions = allSessionsData ? JSON.parse(allSessionsData) : []

    // Filter out sessions for current API
    const remainingSessions = allSessions.filter((session: any) => session.apiId !== apiId.value)

    // Save remaining sessions
    localStorage.setItem('flashcards-sessions', JSON.stringify(remainingSessions))

    // Clear current view
    sessions.value = []
  }
}

const formatElapsedTime = (seconds: number) => {
  if (!seconds) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const selectDeck = (deck: any) => {
  selectedDeck.value = deck

  // Filter flashcards for this deck
  currentDeckFlashcards.value = flashcards.value.filter((flashcard) => {
    const deckRelations = flashcard.properties?.deck?.relations
    return deckRelations && deckRelations.some((rel: any) => rel.blockId === deck.id)
  })

  // Shuffle flashcards
  currentDeckFlashcards.value = shuffleArray([...currentDeckFlashcards.value])

  if (currentDeckFlashcards.value.length === 0) {
    alert('This deck has no flashcards!')
    return
  }

  // Reset session
  currentCardIndex.value = 0
  isFlipped.value = false
  results.value = {
    total: 0,
    correct: 0,
    incorrect: 0,
  }

  // Start timer
  startTimer()

  currentView.value = 'study'
}

const flipCard = () => {
  isFlipped.value = !isFlipped.value
}

const markAnswer = (correct: boolean) => {
  results.value.total++
  if (correct) {
    results.value.correct++
  } else {
    results.value.incorrect++
  }

  // Move to next card or show summary
  if (currentCardIndex.value < currentDeckFlashcards.value.length - 1) {
    // Fade out content
    isTransitioning.value = true

    // Wait for fade out, then update card index while still hidden
    setTimeout(() => {
      currentCardIndex.value++
      isFlipped.value = false
    }, 300)

    // Wait for flip animation to complete before fading in new content
    setTimeout(() => {
      // Fade in new content
      isTransitioning.value = false
    }, 900) // 300ms fade + 600ms flip
  } else {
    showSummary()
  }
}

const showSummary = () => {
  stopTimer()
  currentView.value = 'summary'

  // Save session to localStorage
  saveSession()
}

const saveSession = () => {
  try {
    // Create session object with datetime and API ID
    const sessionData = {
      id: Date.now().toString(),
      title: new Date().toISOString(),
      apiId: apiId.value,
      deckId: selectedDeck.value.id,
      flashcards_played: results.value.total,
      score: scorePercentage.value,
      elapsedTime: elapsedTime.value,
    }

    // Load all sessions from localStorage
    const allSessionsData = localStorage.getItem('flashcards-sessions')
    const allSessions = allSessionsData ? JSON.parse(allSessionsData) : []

    // Add new session to all sessions
    allSessions.push(sessionData)

    // Save all sessions back to localStorage
    localStorage.setItem('flashcards-sessions', JSON.stringify(allSessions))
    localStorage.setItem('flashcards-sessionVersion', String(SESSION_VERSION))

    // Update current sessions view
    sessions.value.push(sessionData)

  } catch (err) {
    console.error('Error saving session to localStorage:', err)
  }
}

const restartDeck = () => {
  if (selectedDeck.value) {
    selectDeck(selectedDeck.value)
  }
}

const backToDecks = () => {
  stopTimer()
  showExitModal.value = false
  currentView.value = 'decks'
  selectedDeck.value = null
  currentDeckFlashcards.value = []
  currentCardIndex.value = 0
  isFlipped.value = false
}

const confirmExit = () => {
  showExitModal.value = false
  backToDecks()
}

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]!
    if (shuffled[j] !== undefined) {
      shuffled[i] = shuffled[j]!
      shuffled[j] = temp
    }
  }
  return shuffled
}

const getQuestion = (card: any) => {
  if (!card) return ''

  let questionHtml = `<div class="mb-4">${card.title}</div>`

  if (card.content && card.content.length > 0) {
    // Find the page break separator
    const separatorIndex = card.content.findIndex(
      (block: any) => block.type === 'line' && block.lineStyle === 'pageBreak',
    )

    if (separatorIndex !== -1) {
      // Content before separator is additional question content
      const questionContent = card.content.slice(0, separatorIndex)
      if (questionContent.length > 0) {
        questionHtml += renderContent(questionContent)
      }
    }
  }

  return questionHtml
}

const getAnswer = (card: any) => {
  if (!card || !card.content || card.content.length === 0) return 'No answer'

  // Find the page break separator
  const separatorIndex = card.content.findIndex(
    (block: any) => block.type === 'line' && block.lineStyle === 'pageBreak',
  )

  if (separatorIndex !== -1) {
    // Content after separator is the answer
    const answerContent = card.content.slice(separatorIndex + 1)
    if (answerContent.length > 0) {
      return renderContent(answerContent)
    }
  }

  // No page break: render all content as answer (images + text with markdown)
  return renderContent(card.content)
}

const renderContent = (contentArray: any[]) => {
  let html = ''
  let currentList: string | null = null
  let currentLevel = -1

  for (let i = 0; i < contentArray.length; i++) {
    const item = contentArray[i]

    if (item.type === 'image') {
      // Close any open list
      if (currentList) {
        html += closeListLevels(currentLevel, -1, currentList)
        currentList = null
        currentLevel = -1
      }
      html += `<img src="${item.url}" alt="Image" style="max-width: 100%; max-height: 200px; margin: 0 auto; display: block; border-radius: 8px;" loading="eager" decoding="async" />`
    } else if (item.type === 'text') {
      const markdown = item.markdown || ''
      const listStyle = item.listStyle
      const indentLevel = item.indentationLevel || 0

      if (listStyle) {
        // Handle list items
        const listTag = listStyle === 'bullet' ? 'ul' : 'ol'

        // Open or adjust list levels
        if (!currentList || currentList !== listTag) {
          if (currentList) {
            html += closeListLevels(currentLevel, -1, currentList)
          }
          html += `<${listTag}>`
          currentList = listTag
          currentLevel = indentLevel
        } else if (indentLevel > currentLevel) {
          // Open nested list
          html += `<${listTag}>`
          currentLevel = indentLevel
        } else if (indentLevel < currentLevel) {
          // Close nested lists
          html += closeListLevels(currentLevel, indentLevel, currentList)
          currentLevel = indentLevel
        }

        // Remove markdown list markers and parse content
        const cleanMarkdown = markdown.replace(/^[\s-]*[-*+]\s*/, '').trim()
        const parsedContent = marked.parseInline(cleanMarkdown)
        html += `<li>${parsedContent}</li>`
      } else {
        // Close any open list for non-list content
        if (currentList) {
          html += closeListLevels(currentLevel, -1, currentList)
          currentList = null
          currentLevel = -1
        }
        // Parse as regular markdown
        if (markdown.trim()) {
          html += marked.parse(markdown, { breaks: true })
        }
      }
    }
  }

  // Close any remaining open lists
  if (currentList) {
    html += closeListLevels(currentLevel, -1, currentList)
  }

  return html
}

const closeListLevels = (fromLevel: number, toLevel: number, listType: string) => {
  let html = ''
  const levelsToClose = fromLevel - toLevel
  for (let i = 0; i < levelsToClose; i++) {
    html += `</${listType}>`
  }
  if (toLevel === -1) {
    html += `</${listType}>`
  }
  return html
}

const hasComplexContent = (html: string) => {
  if (!html) return false
  // Check for lists, multiple paragraphs, or line breaks indicating complex content
  return (
    html.includes('<ul>') ||
    html.includes('<ol>') ||
    html.includes('<li>') ||
    (html.match(/<p>/g) || []).length > 1 ||
    html.includes('<br>')
  )
}

const startTimer = () => {
  startTime.value = Date.now()
  currentTime.value = Date.now()
  timerInterval.value = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
  if (startTime.value && currentTime.value) {
    elapsedTime.value = Math.floor((currentTime.value - startTime.value) / 1000)
  }
}

// Hide/show navbar when entering/exiting study mode or summary
watch(currentView, (newView) => {
  if (newView === 'study' || newView === 'summary') {
    document.body.classList.add('study-mode')
  } else {
    document.body.classList.remove('study-mode')
  }
})

// Initialize on mount
onMounted(() => {
  loadApiUrl()
  if (registerRefresh) {
    registerRefresh(String(route.name), refreshFlashcards)
  }

  // Register subheader with refresh button
  if (setSubheader && !error.value) {
    setSubheader({
      right: () => [
        h(SubheaderButton, {
          title: 'Open Decks Collection in Craft',
          onClick: openCollectionInCraft,
        }, {
          default: () => h(ExternalLink, { size: 16 })
        }),
        h(SubheaderButton, {
          title: 'Refresh',
          onClick: refreshFlashcards,
        }, {
          default: () => h(RefreshCw, { size: 16 })
        })
      ]
    })
  }
})

// Cleanup on unmount
onUnmounted(() => {
  document.body.classList.remove('study-mode')
  if (setSubheader) {
    setSubheader(null)
  }
})

// Re-register subheader when activated (for keep-alive)
onActivated(() => {
  if (setSubheader && !error.value) {
    setSubheader({
      right: () => [
        h(SubheaderButton, {
          title: 'Open Decks Collection in Craft',
          onClick: openCollectionInCraft,
        }, {
          default: () => h(ExternalLink, { size: 16 })
        }),
        h(SubheaderButton, {
          title: 'Refresh',
          onClick: refreshFlashcards,
        }, {
          default: () => h(RefreshCw, { size: 16 })
        })
      ]
    })
  }
})
</script>

<template>
  <div class="flashcards-view">
    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <ProgressIndicator
        :completed="completedApiCalls"
        :total="totalApiCalls"
        message="Loading flashcards"
      />
    </div>

    <!-- Error State -->
    <div v-if="error" class="error-container">
      <BookOpen :size="48" class="error-icon" />
      <h2>Configuration Required</h2>
      <p>{{ error }}</p>
      <router-link to="/settings" class="settings-link">Go to Settings</router-link>
    </div>

    <template v-if="!loading && !error && currentView === 'decks'">
      <!-- Deck Selection View -->
      <div class="decks-view">
      <!-- Deck Selection -->
      <div class="card">
        <h2 class="section-title">
          <BookOpen :size="20" class="section-icon" />
          Choose a deck
        </h2>

        <div v-if="decks.length === 0" class="empty-state">
          <p>No decks available</p>
        </div>

        <div v-else class="deck-list">
          <div v-for="deck in decks" :key="deck.id" @click="selectDeck(deck)" class="deck-card">
            <img
              v-if="getDeckImage(deck)"
              :src="getDeckImage(deck)"
              class="deck-image"
              :alt="deck.title"
              loading="eager"
              decoding="async"
            />
            <div class="deck-info">
              <h3>{{ deck.title }}</h3>
              <div class="deck-stats">
                <span class="stat">
                  <BookOpen :size="14" style="vertical-align: middle; margin-right: 4px" />
                  {{ getFlashcardCount(deck) }} flashcards
                </span>
                <span class="stat">
                  <BarChart3 :size="14" style="vertical-align: middle; margin-right: 4px" />
                  {{ getSessionCount(deck) }} sessions
                </span>
                <span
                  v-if="getAverageScore(deck) !== null"
                  class="stat"
                  :class="getAverageScoreClass(getAverageScore(deck))"
                >
                  <Star :size="14" style="vertical-align: middle; margin-right: 4px" />
                  {{ getAverageScore(deck) }}% avg
                </span>
              </div>
            </div>
            <ChevronRight :size="20" class="deck-arrow" />
          </div>
        </div>
      </div>

      <!-- Recent Sessions Table -->
      <div v-if="recentSessions.length > 0" class="card">
        <div class="card-header">
          <h2 class="section-title">
            <Clock :size="20" class="section-icon" />
            Recent sessions
          </h2>
          <button @click="clearSessions" class="clear-button">Clear all</button>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Deck</th>
                <th>Flashcards</th>
                <th>Time</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="session in recentSessions" :key="session.id">
                <td>{{ formatSessionDate(session.title) }}</td>
                <td>{{ getDeckNameForSession(session) }}</td>
                <td class="text-center">{{ session.flashcards_played }}</td>
                <td class="text-center">{{ formatElapsedTime(session.elapsedTime) }}</td>
                <td class="text-center">
                  <span class="score-badge" :class="getScoreClass(session.score)">
                    {{ session.score }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </template>

    <!-- Study View -->
    <div v-if="!loading && !error && currentView === 'study'" class="study-view">
      <div class="study-container">
        <!-- Progress Bar -->
        <div class="progress-section">
          <div class="progress-header">
            <span>{{ selectedDeck.title }}</span>
            <span>
              <Clock :size="14" style="vertical-align: middle; margin-right: 4px" />
              {{ formattedTimer }}
            </span>
            <span>{{ currentCardIndex + 1 }} / {{ currentDeckFlashcards.length }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
        </div>

        <!-- Flashcard -->
        <div v-if="currentCard" :key="currentCardIndex" class="flip-card" :class="{ flipped: isFlipped }">
          <!-- Exit button -->
          <button @click.stop="showExitModal = true" class="exit-button">
            <X :size="18" />
          </button>

          <!-- Instruction text -->
          <div class="instruction-text">
            <p v-if="!isFlipped">
              <Eye :size="16" style="vertical-align: middle; margin-right: 6px" />
              Click to reveal
            </p>
            <p v-else>
              <RotateCcw :size="16" style="vertical-align: middle; margin-right: 6px" />
              See question
            </p>
          </div>

          <div class="flip-card-inner">
            <!-- Front (Question) -->
            <div
              class="flip-card-front"
              @click="flipCard"
              :class="hasComplexContent(getQuestion(currentCard)) ? 'align-start' : ''"
            >
              <div
                class="card-content"
                :class="[
                  hasComplexContent(getQuestion(currentCard)) ? 'text-left' : 'text-center',
                  isTransitioning ? 'opacity-0' : 'opacity-100',
                ]"
              >
                <div v-html="getQuestion(currentCard)" class="markdown-content"></div>
              </div>
            </div>

            <!-- Back (Answer) -->
            <div
              class="flip-card-back"
              @click="flipCard"
              :class="hasComplexContent(getAnswer(currentCard)) ? 'align-start' : ''"
            >
              <div
                class="card-content"
                :class="[
                  hasComplexContent(getAnswer(currentCard)) ? 'text-left' : 'text-center',
                  isTransitioning ? 'opacity-0' : 'opacity-100',
                ]"
              >
                <div v-html="getAnswer(currentCard)" class="markdown-content"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div v-if="isFlipped" class="action-buttons">
          <button @click="markAnswer(false)" class="action-button incorrect-button">
            <X :size="18" style="vertical-align: middle; margin-right: 6px" />
            Incorrect
          </button>
          <button @click="markAnswer(true)" class="action-button correct-button">
            <Check :size="18" style="vertical-align: middle; margin-right: 6px" />
            Correct
          </button>
        </div>
      </div>
    </div>

    <!-- Exit Confirmation Modal -->
    <div v-if="showExitModal" class="modal-overlay" @click.self="showExitModal = false">
      <div class="modal">
        <h3>Exit session?</h3>
        <p>Your progress will be lost if you exit now.</p>
        <div class="button-group">
          <button @click="showExitModal = false" class="cancel-button">Cancel</button>
          <button @click="confirmExit" class="danger-button">Exit</button>
        </div>
      </div>
    </div>

    <!-- Summary View -->
    <div v-if="!loading && !error && currentView === 'summary'" class="summary-view">
      <!-- Confetti for perfect score -->
      <div v-if="scorePercentage === 100" class="confetti-container">
        <div
          v-for="i in 50"
          :key="i"
          class="confetti"
          :style="{
            left: Math.random() * 100 + '%',
            top: -20 + 'px',
            backgroundColor: ['#f59e0b', '#22c55e', '#6366f1', '#f43f5e', '#a855f7', '#ec4899'][
              Math.floor(Math.random() * 6)
            ],
            animationDelay: Math.random() * 2 + 's',
            animationDuration: 2 + Math.random() * 2 + 's',
          }"
        ></div>
      </div>

      <div class="card summary-card">
        <h2 class="summary-title">
          <span v-if="scorePercentage === 100">
            <Trophy :size="28" style="vertical-align: middle; margin: 0 8px" />
            Perfect score!
            <Trophy :size="28" style="vertical-align: middle; margin: 0 8px" />
          </span>
          <span v-else>
            <Flag :size="28" style="vertical-align: middle; margin-right: 8px" />
            Session complete!
          </span>
        </h2>

        <div class="stats-grid">
          <div class="stat-card">
            <p class="stat-value">{{ results.total }}</p>
            <p class="stat-label">Total cards</p>
          </div>
          <div class="stat-card success">
            <p class="stat-value">{{ results.correct }}</p>
            <p class="stat-label">Correct</p>
          </div>
          <div class="stat-card danger">
            <p class="stat-value">{{ results.incorrect }}</p>
            <p class="stat-label">Incorrect</p>
          </div>
          <div class="stat-card info">
            <p class="stat-value">{{ formattedElapsedTime }}</p>
            <p class="stat-label">Time</p>
          </div>
        </div>

        <!-- Score Circle -->
        <div class="score-circle-container">
          <div class="score-circle-wrapper">
            <svg class="score-circle" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="88" class="score-circle-bg" />
              <circle
                cx="100"
                cy="100"
                r="88"
                :stroke="scoreColor"
                class="score-circle-progress"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="circumference - (scorePercentage / 100) * circumference"
              />
            </svg>
            <div class="score-circle-content">
              <p class="score-percentage">{{ scorePercentage }}%</p>
              <p class="score-label">Score</p>
            </div>
          </div>
          <p class="score-message" :class="scoreTextClass">{{ scoreMessage }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="summary-actions">
          <button @click="restartDeck" class="summary-button restart-button">
            <RotateCcw :size="18" style="vertical-align: middle; margin-right: 6px" />
            Repeat This Deck
          </button>
          <button @click="backToDecks" class="summary-button back-button">
            <ArrowLeft :size="18" style="vertical-align: middle; margin-right: 6px" />
            Choose Another Deck
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flashcards-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow-y: auto;
}

.decks-view {
  flex: 1;
  padding: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 20px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-icon {
  color: var(--text-secondary);
}

.header {
  margin-bottom: 32px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header h1 {
  margin: 0 0 4px 0;
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
}

.subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-secondary);
}

.icon-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.loading-state,
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

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-primary);
  border-top-color: var(--btn-primary-bg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.settings-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-button:hover {
  background: var(--btn-primary-hover);
}

.retry-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--btn-secondary-bg);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-button:hover {
  background: var(--btn-secondary-hover);
}

.card {
  background: var(--widget-bg);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.card h2 {
  margin: 0 0 20px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-header h2 {
  margin: 0;
}

.clear-button {
  padding: 6px 12px;
  background: transparent;
  color: var(--btn-danger-bg);
  border: 1px solid var(--btn-danger-bg);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-button:hover {
  background: var(--btn-danger-bg);
  color: white;
}

.deck-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deck-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.deck-card:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.deck-image {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.deck-arrow {
  margin-left: auto;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.deck-info {
  flex: 1;
  min-width: 0;
}

.deck-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.deck-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.stat {
  color: var(--text-secondary);
}

.stat.text-success {
  color: var(--btn-success-bg);
}

.stat.text-warning {
  color: var(--accent-orange);
}

.stat.text-danger {
  color: var(--btn-danger-bg);
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-tertiary);
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  border-bottom: 2px solid var(--border-primary);
}

th {
  text-align: left;
  padding: 12px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
}

td {
  padding: 12px 8px;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-primary);
}

tbody tr:hover {
  background: var(--bg-secondary);
}

.text-center {
  text-align: center;
}

.score-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.score-badge.score-high {
  background: rgba(34, 197, 94, 0.2);
  color: var(--btn-success-bg);
}

.score-badge.score-medium {
  background: rgba(249, 115, 22, 0.2);
  color: var(--accent-orange);
}

.score-badge.score-low {
  background: rgba(244, 63, 94, 0.2);
  color: var(--btn-danger-bg);
}

/* Study View */
.study-view {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-primary);
}

.study-container {
  width: 100%;
  max-width: calc(100% - 32px);
  height: calc(100% - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--widget-bg);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px var(--shadow-dark);
}

.progress-section {
  flex-shrink: 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a855f7 0%, #6366f1 50%, #22d3ee 100%);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* Flip Card Styles */
.flip-card {
  perspective: 1000px;
  height: calc(100% - 200px);
  min-height: 500px;
  position: relative;
  flex-shrink: 0;
}

.flip-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}

.flip-card.flipped .flip-card-inner {
  transform: rotateY(180deg);
}

.flip-card-front,
.flip-card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 12px;
  padding: 32px;
  cursor: pointer;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.1s ease-in-out;
}

.flip-card-front {
  z-index: 2;
  transform: rotateY(0deg);
  background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(168, 85, 247, 0.1) 100%);
  border: 2px solid rgba(168, 85, 247, 0.3);
}

.flip-card-front.align-start {
  align-items: flex-start;
  justify-content: center;
}

.flip-card-back {
  z-index: 1;
  transform: rotateY(180deg);
  background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(34, 197, 94, 0.1) 100%);
  border: 2px solid rgba(34, 197, 94, 0.3);
}

.flip-card-back.align-start {
  align-items: flex-start;
  justify-content: center;
}

.flip-card:not(.flipped) .flip-card-back {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.flip-card.flipped .flip-card-front {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.flip-card.flipped .flip-card-back {
  z-index: 2;
  opacity: 1;
  visibility: visible;
}

.exit-button {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  width: 36px;
  height: 36px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-primary);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.exit-button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.instruction-text {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-primary);
}

.instruction-text p {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.card-content {
  width: 100%;
  transition: opacity 0.3s ease;
}

.markdown-content {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
}

/* Increase font size in fullscreen study mode */
.study-view .markdown-content {
  font-size: 30px; /* 20px * 1.5 */
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  text-align: left;
  margin: 1rem 0;
  padding-left: 2rem;
  list-style-position: outside;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ul ul) {
  list-style-type: circle;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li) {
  margin: 0.5rem 0;
  display: list-item;
}

.markdown-content :deep(p) {
  margin: 0.5rem 0;
}

.markdown-content :deep(img) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 16px;
}

.action-button {
  flex: 1;
  max-width: 200px;
  padding: 16px 24px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.incorrect-button {
  background: linear-gradient(135deg, #f43f5e 0%, #ec4899 100%);
  color: white;
}

.incorrect-button:hover {
  background: linear-gradient(135deg, #e11d48 0%, #db2777 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 63, 94, 0.4);
}

.correct-button {
  background: linear-gradient(135deg, #22c55e 0%, #10b981 100%);
  color: white;
}

.correct-button:hover {
  background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

/* Summary View */
.summary-view {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  background: var(--bg-primary);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.confetti-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
}

.confetti {
  position: fixed;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: confetti-fall 3s linear infinite;
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}

.summary-card {
  text-align: center;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.summary-title {
  font-size: 32px;
  margin-bottom: 32px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #22d3ee 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  padding: 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
}

.stat-card.success {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
}

.stat-card.danger {
  background: rgba(244, 63, 94, 0.1);
  border-color: rgba(244, 63, 94, 0.3);
}

.stat-card.info {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
}

.stat-value {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-circle-container {
  margin-bottom: 32px;
}

.score-circle-wrapper {
  position: relative;
  display: inline-block;
  margin-bottom: 16px;
}

.score-circle {
  width: 192px;
  height: 192px;
  transform: rotate(-90deg);
}

.score-circle-bg {
  fill: none;
  stroke: var(--border-primary);
  stroke-width: 12;
}

.score-circle-progress {
  fill: none;
  stroke-width: 12;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s ease;
}

.score-circle-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-percentage {
  font-size: 48px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.score-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.score-message {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.score-message.text-success {
  color: var(--btn-success-bg);
}

.score-message.text-warning {
  color: var(--accent-orange);
}

.score-message.text-danger {
  color: var(--btn-danger-bg);
}

.summary-actions {
  display: grid;
  gap: 12px;
}

.summary-button {
  width: 100%;
  padding: 16px 24px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
}

.restart-button {
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: white;
}

.restart-button:hover {
  background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.back-button {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.back-button:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-secondary);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 28px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 8px 32px var(--shadow-dark);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal h2,
.modal h3 {
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-description {
  margin: 0 0 20px 0;
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: 500;
}

.button-group {
  display: flex;
  gap: 10px;
}

.cancel-button,
.danger-button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
}

.cancel-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.danger-button {
  background: var(--btn-danger-bg);
  color: white;
}

.danger-button:hover {
  background: var(--btn-danger-hover);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .flashcards-view {
    padding: 16px;
  }

  .header h1 {
    font-size: 24px;
  }

  .study-container {
    padding: 16px;
  }

  .flip-card {
    height: calc(95vh - 180px);
    min-height: 400px;
  }

  .study-container {
    height: auto;
    max-height: 95vh;
  }

  .markdown-content {
    font-size: 18px;
  }

  /* Increase font size in fullscreen study mode on mobile */
  .study-view .markdown-content {
    font-size: 27px; /* 18px * 1.5 */
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  /* Summary view mobile fixes */
  .summary-view {
    align-items: flex-start;
    padding: 16px;
  }

  .summary-card {
    padding: 20px 16px;
    margin: 0;
  }

  .summary-title {
    font-size: 24px;
    margin-bottom: 24px;
  }

  .stat-value {
    font-size: 28px;
  }

  .score-circle {
    width: 160px;
    height: 160px;
  }

  .score-percentage {
    font-size: 36px;
  }

  .score-message {
    font-size: 16px;
  }

  .summary-actions {
    margin-top: 24px;
  }
}
</style>
