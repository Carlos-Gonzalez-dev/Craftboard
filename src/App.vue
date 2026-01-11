<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed, nextTick, watch, Fragment, h } from 'vue'
import {
  Settings,
  LayoutDashboard,
  LayoutGrid,
  BookOpen,
  Music,
  Network,
  Bookmark,
  Rss,
  CheckSquare,
  RefreshCw,
  Maximize2,
  Minimize2,
  Plus,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Calendar,
  Move,
  Menu,
  HelpCircle,
  Download,
  Clock,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useWidgetView } from './composables/useWidgetView'
import { usePanes } from './composables/usePanes'
import { useActiveTimers } from './composables/useActiveTimers'
import { useBadgeAndTitle } from './composables/useBadgeAndTitle'
import { useTasksStore } from './stores/tasks'
import ViewSubheader from './components/ViewSubheader.vue'
import PaneTabs from './components/PaneTabs.vue'
import ViewTabs from './components/ViewTabs.vue'
import SubheaderButton from './components/SubheaderButton.vue'
import ActiveTimerBar from './components/ActiveTimerBar.vue'
import { getLatestChangelogDate } from './utils/changelog'

const route = useRoute()
const tasksStore = useTasksStore()
const { activeTimers } = useActiveTimers()
const { todayTasksCount } = useBadgeAndTitle()

// Widget view mode (only for dashboard)
const { isCompactView } = useWidgetView()
const isDashboard = computed(() => route.name === 'dashboard' || route.path === '/')

// Current view name for mobile header
const currentViewName = computed(() => {
  const routeName = route.name
  const routePath = route.path

  if (routeName === 'dashboard' || routePath === '/') {
    return 'Dashboard'
  }

  const viewNames: Record<string, string> = {
    tasks: 'Tasks',
    flashcards: 'Flashcards',
    music: 'Music',
    graph: 'Graph',
    bookmarks: 'Bookmarks',
    rss: 'RSS',
    tags: 'Tags',
    settings: 'Settings',
  }

  return (
    viewNames[String(routeName)] ||
    String(routeName).charAt(0).toUpperCase() + String(routeName).slice(1)
  )
})

// Pane management (only for dashboard)
const { panes, activePaneId, loadPanes, switchPane, savePanes } = usePanes()
const editingPaneId = ref<string | null>(null)
const editingPaneName = ref('')
const showPaneNameModal = ref(false)
const newPaneName = ref('')

// Provide/inject for refresh functions
const refreshFunctions = ref<Map<string, () => void | Promise<void>>>(new Map())

const registerRefresh = (routeName: string, refreshFn: () => void | Promise<void>) => {
  refreshFunctions.value.set(routeName, refreshFn)
}

provide('registerRefresh', registerRefresh)

// Provide/inject for add widget modal (dashboard only)
const showAddWidgetModal = ref(false)
const openAddWidgetModal = () => {
  showAddWidgetModal.value = true
}

provide('showAddWidgetModal', showAddWidgetModal)

// Provide/inject for subheader content
type SubheaderContent = {
  default?: () => any
  right?: () => any
} | null

const subheaderContent = ref<SubheaderContent>(null)
const setSubheader = (content: SubheaderContent) => {
  subheaderContent.value = content
}
provide('setSubheader', setSubheader)

// Watch route to clear subheader when navigating away
watch(
  () => route.name,
  (newRoute, oldRoute) => {
    // Clear subheader when route changes (each view will set its own)
    // Only clear if not going to dashboard (dashboard handles its own)
    if (newRoute !== 'dashboard') {
      // Clear immediately, then each view will set its own in onMounted/onActivated
      subheaderContent.value = null
    } else if (newRoute === 'dashboard') {
      // Clear when going to dashboard (dashboard renders its own)
      subheaderContent.value = null
    }
  },
  { immediate: false },
)

const handleRefresh = () => {
  const currentRoute = String(route.name)
  const refreshFn = refreshFunctions.value.get(currentRoute)
  if (refreshFn) {
    refreshFn()
  }
}

const reloadApp = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('t', Date.now().toString())
  // Replace to avoid stacking history entries while forcing cache revalidation
  window.location.replace(url.toString())
}

const dashboardTitle = ref('Craftboard')
const showFlashcardsTab = ref(true)
const showMusicTab = ref(true)
const showGraphTab = ref(true)
const showBookmarksTab = ref(true)
const showRSSTab = ref(true)
const showTasksTab = ref(true)
const showTagsTab = ref(true)

// Navigation items configuration
const navigationItems = computed(() => {
  const items = [
    { path: '/', name: 'Dashboard', icon: LayoutDashboard, show: true, badge: null },
    {
      path: '/tasks',
      name: 'Tasks',
      icon: CheckSquare,
      show: showTasksTab.value,
      badge: tasksStore.activeTasksCount > 0 ? tasksStore.activeTasksCount : null,
    },
    {
      path: '/flashcards',
      name: 'Flashcards',
      icon: BookOpen,
      show: showFlashcardsTab.value,
      badge: null,
    },
    { path: '/music', name: 'Music', icon: Music, show: showMusicTab.value, badge: null },
    { path: '/graph', name: 'Graph', icon: Network, show: showGraphTab.value, badge: null },
    {
      path: '/bookmarks',
      name: 'Bookmarks',
      icon: Bookmark,
      show: showBookmarksTab.value,
      badge: null,
    },
    { path: '/rss', name: 'RSS', icon: Rss, show: showRSSTab.value, badge: null },
    { path: '/tags', name: 'Tags', icon: Clock, show: showTagsTab.value, badge: null },
  ]
  return items.filter((item) => item.show)
})

// Mobile sidebar state
const isMobileSidebarOpen = ref(false)
const toggleMobileSidebar = () => {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}
const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false
}

// Close sidebar when route changes
watch(
  () => route.path,
  () => {
    closeMobileSidebar()
  },
)

// App version (injected at build time)
const appVersion = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0') as string
const latestChangelogDate = computed(() => getLatestChangelogDate())

// Theme management
const currentTheme = ref<'light' | 'dark'>('dark')
const systemThemeUnwatch = ref<(() => void) | null>(null)

const getSystemTheme = (): 'light' | 'dark' => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

const loadTheme = () => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (savedTheme) {
    currentTheme.value = savedTheme
  } else {
    currentTheme.value = getSystemTheme()
  }
  applyTheme(currentTheme.value)
}

const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.setAttribute('data-theme', theme)
}

const toggleTheme = () => {
  currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', currentTheme.value)
  applyTheme(currentTheme.value)
}

// Watch for system theme changes
const watchSystemTheme = () => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
  const handleChange = (e: MediaQueryListEvent) => {
    // Only apply system theme if user hasn't manually set a preference
    if (!localStorage.getItem('theme')) {
      currentTheme.value = e.matches ? 'light' : 'dark'
      applyTheme(currentTheme.value)
    }
  }
  mediaQuery.addEventListener('change', handleChange)
  return () => mediaQuery.removeEventListener('change', handleChange)
}

const loadNavTabSettings = () => {
  dashboardTitle.value = localStorage.getItem('dashboard-title') || 'Craftboard'
  showFlashcardsTab.value = localStorage.getItem('show-flashcards-tab') !== 'false'
  showMusicTab.value = localStorage.getItem('show-music-tab') !== 'false'
  showGraphTab.value = localStorage.getItem('show-graph-tab') !== 'false'
  showBookmarksTab.value = localStorage.getItem('show-bookmarks-tab') !== 'false'
  showRSSTab.value = localStorage.getItem('show-rss-tab') !== 'false'
  showTasksTab.value = localStorage.getItem('show-tasks-tab') !== 'false'
  showTagsTab.value = localStorage.getItem('show-tags-tab') !== 'false'
}

// Update detection
const updateAvailable = ref(false)
const showUpdateModal = ref(false)
let updateCheckInterval: number | null = null

const checkForUpdates = async () => {
  try {
    // Fetch the version.txt file with cache-busting timestamp
    const response = await fetch(`/version.txt?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) return

    const serverVersion = (await response.text()).trim()

    // Compare with current version
    if (serverVersion && serverVersion !== appVersion) {
      updateAvailable.value = true
    }
  } catch (error) {
    // Silently fail - don't bother the user with network errors
    console.debug('Update check failed:', error)
  }
}

const showUpdateNotification = () => {
  showUpdateModal.value = true
  // Close mobile sidebar so the modal is visible
  closeMobileSidebar()
}

const updateApp = () => {
  reloadApp()
}

const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'dashboard-title') {
    dashboardTitle.value = e.newValue || 'Craftboard'
  } else if (e.key === 'show-flashcards-tab') {
    showFlashcardsTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-music-tab') {
    showMusicTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-graph-tab') {
    showGraphTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-bookmarks-tab') {
    showBookmarksTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-rss-tab') {
    showRSSTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-tasks-tab') {
    showTasksTab.value = e.newValue !== 'false'
  } else if (e.key === 'show-tags-tab') {
    showTagsTab.value = e.newValue !== 'false'
  }
}

const handleCustomEvent = (e: Event) => {
  if (e.type === 'dashboard-title-updated' || e.type === 'nav-tabs-updated') {
    loadNavTabSettings()
  }
}

// Pane management functions
const startEditingPane = (paneId: string) => {
  const pane = panes.value.find((p) => p.id === paneId)
  if (pane) {
    editingPaneId.value = paneId
    editingPaneName.value = pane.name
  }
}

const savePaneName = (paneId: string) => {
  const pane = panes.value.find((p) => p.id === paneId)
  if (pane && editingPaneName.value.trim()) {
    pane.name = editingPaneName.value.trim()
    savePanes()
  }
  editingPaneId.value = null
  editingPaneName.value = ''
}

const cancelEditingPane = () => {
  editingPaneId.value = null
  editingPaneName.value = ''
}

const handlePaneDoubleClick = (paneId: string, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  startEditingPane(paneId)
}

const deletePane = (paneId: string) => {
  if (panes.value.length === 1) {
    alert('Cannot delete the last pane')
    return
  }

  if (confirm('Are you sure you want to delete this pane and all its widgets?')) {
    const index = panes.value.findIndex((p) => p.id === paneId)
    if (index !== -1) {
      panes.value.splice(index, 1)
      if (activePaneId.value === paneId) {
        activePaneId.value = panes.value[0]?.id || ''
      }
      savePanes()
    }
  }
}

const createPane = () => {
  if (!newPaneName.value.trim()) {
    alert('Please enter a pane name')
    return
  }

  const newPane = {
    id: `pane-${Date.now()}`,
    name: newPaneName.value.trim(),
    widgets: [],
  }

  panes.value.push(newPane)
  activePaneId.value = newPane.id
  showPaneNameModal.value = false
  newPaneName.value = ''
  savePanes()
}

// Scroll controls for pane tabs
const paneTabsContainer = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const checkScrollButtons = () => {
  if (!paneTabsContainer.value) return
  const container = paneTabsContainer.value
  canScrollLeft.value = container.scrollLeft > 0
  canScrollRight.value = container.scrollLeft < container.scrollWidth - container.clientWidth - 1
}

const scrollPanesLeft = () => {
  if (!paneTabsContainer.value) return
  paneTabsContainer.value.scrollBy({ left: -200, behavior: 'smooth' })
}

const scrollPanesRight = () => {
  if (!paneTabsContainer.value) return
  paneTabsContainer.value.scrollBy({ left: 200, behavior: 'smooth' })
}

// Watch for route changes to check scroll buttons
watch(
  () => route.path,
  () => {
    if (isDashboard.value) {
      nextTick(() => {
        setTimeout(() => {
          checkScrollButtons()
        }, 100)
      })
    }
  },
)

// Watch for pane changes to check scroll buttons
watch(
  () => panes.value.length,
  () => {
    if (isDashboard.value) {
      nextTick(() => {
        setTimeout(() => {
          checkScrollButtons()
        }, 100)
      })
    }
  },
)

onMounted(() => {
  loadTheme()
  loadNavTabSettings()
  window.addEventListener('storage', handleStorageChange)
  window.addEventListener('dashboard-title-updated', handleCustomEvent)
  window.addEventListener('nav-tabs-updated', handleCustomEvent)
  systemThemeUnwatch.value = watchSystemTheme()

  // Check for updates on mount and then every 5 minutes
  checkForUpdates()
  updateCheckInterval = window.setInterval(checkForUpdates, 5 * 60 * 1000)

  if (isDashboard.value) {
    loadPanes()
    // Check scroll buttons after a short delay to ensure DOM is ready
    nextTick(() => {
      setTimeout(() => {
        checkScrollButtons()
        if (paneTabsContainer.value) {
          paneTabsContainer.value.addEventListener('scroll', checkScrollButtons)
          // Also check on resize
          window.addEventListener('resize', checkScrollButtons)
        }
      }, 100)
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange)
  window.removeEventListener('dashboard-title-updated', handleCustomEvent)
  window.removeEventListener('nav-tabs-updated', handleCustomEvent)
  if (systemThemeUnwatch.value) {
    systemThemeUnwatch.value()
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
  }

  if (paneTabsContainer.value) {
    paneTabsContainer.value.removeEventListener('scroll', checkScrollButtons)
    window.removeEventListener('resize', checkScrollButtons)
  }
})
</script>

<template>
  <div class="app">
    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="isMobileSidebarOpen"
      class="mobile-sidebar-overlay"
      @click="closeMobileSidebar"
    ></div>

    <!-- Mobile Sidebar -->
    <aside class="mobile-sidebar" :class="{ open: isMobileSidebarOpen }">
      <div class="mobile-sidebar-header">
        <div class="mobile-sidebar-brand">
          <img src="/favicon.svg" alt="Craftboard" class="mobile-sidebar-brand-icon" />
          <span>{{ dashboardTitle }}</span>
        </div>
        <button @click="closeMobileSidebar" class="mobile-sidebar-close">
          <X :size="20" />
        </button>
      </div>
      <div class="mobile-sidebar-content">
        <nav class="mobile-sidebar-nav">
          <router-link
            v-for="item in navigationItems"
            :key="item.path"
            :to="item.path"
            class="mobile-nav-link"
            @click="closeMobileSidebar"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ item.name }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </router-link>
        </nav>
      </div>
      <div class="mobile-sidebar-footer">
        <button @click="reloadApp" class="mobile-nav-link refresh-button">
          <RefreshCw :size="18" />
          <span>Reload</span>
        </button>
        <button @click="toggleTheme" class="mobile-nav-link theme-toggle">
          <component :is="currentTheme === 'dark' ? Sun : Moon" :size="18" />
          <span>{{ currentTheme === 'light' ? 'Light' : 'Dark' }}</span>
        </button>
        <router-link to="/settings" class="mobile-nav-link" @click="closeMobileSidebar">
          <Settings :size="18" />
          <span>Settings</span>
        </router-link>
        <!-- App Footer in Sidebar -->
        <div class="mobile-app-footer">
          <div class="mobile-footer-left">
            <img src="/favicon.svg" alt="Craftboard" class="mobile-footer-icon" />
            <span>{{ dashboardTitle }}</span>
            <button
              v-if="latestChangelogDate"
              @click="updateAvailable ? showUpdateNotification() : null"
              class="mobile-footer-version"
              :class="{ 'update-available': updateAvailable }"
              :title="updateAvailable ? 'Update available! Click to update' : ''"
            >
              {{ latestChangelogDate }}
            </button>
          </div>
          <div class="mobile-footer-right">
            <span class="mobile-footer-about">Carlos González, 2025 - 2026</span>
            <span class="mobile-footer-contact">craftboard@dende.gal</span>
            <a
              href="https://espazo.dende.gal/craftboard-documentation"
              target="_blank"
              rel="noopener noreferrer"
              class="mobile-footer-help"
              title="Documentation"
            >
              <HelpCircle :size="14" />
            </a>
          </div>
        </div>
      </div>
    </aside>

    <nav class="navbar">
      <div class="nav-container">
        <div class="nav-top-row">
          <!-- Mobile View Name -->
          <div class="mobile-view-name">
            {{ currentViewName }}
          </div>
          <!-- Desktop Navigation -->
          <div class="nav-links desktop-nav">
            <router-link
              v-for="item in navigationItems"
              :key="item.path"
              :to="item.path"
              class="nav-link"
            >
              <component :is="item.icon" :size="16" />
              <span>{{ item.name }}</span>
              <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
            </router-link>
          </div>
          <!-- Mobile Hamburger Button -->
          <button @click="toggleMobileSidebar" class="mobile-hamburger" title="Open menu">
            <Menu :size="20" />
          </button>
          <!-- Desktop Right Side -->
          <div class="nav-right desktop-nav">
            <button
              @click="toggleTheme"
              class="nav-link theme-toggle"
              :title="currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
            >
              <component :is="currentTheme === 'dark' ? Sun : Moon" :size="16" />
              <span>{{ currentTheme === 'light' ? 'Light' : 'Dark' }}</span>
            </button>
            <router-link to="/settings" class="nav-link">
              <Settings :size="16" />
              <span>Settings</span>
            </router-link>
          </div>
        </div>
        <!-- Subheader (below header) -->
        <div
          v-if="subheaderContent || isDashboard"
          class="nav-subheader"
          :class="{ 'dashboard-subheader': isDashboard }"
        >
          <ViewSubheader v-if="isDashboard">
            <template #default>
              <PaneTabs @create-pane="showPaneNameModal = true" />
            </template>
            <template #right>
              <button @click="openAddWidgetModal" class="add-widget-button" title="Add Widget">
                <Plus :size="14" />
                <span>Add Widget</span>
              </button>
              <div class="view-mode-buttons">
                <button
                  @click="isCompactView = false"
                  :class="['view-mode-button', { active: !isCompactView }]"
                  title="Expanded View"
                >
                  <Maximize2 :size="14" />
                  <span>Expanded</span>
                </button>
                <button
                  @click="isCompactView = true"
                  :class="['view-mode-button', { active: isCompactView }]"
                  title="Compact View"
                >
                  <Minimize2 :size="14" />
                  <span>Compact</span>
                </button>
              </div>
            </template>
          </ViewSubheader>
          <ViewSubheader v-else-if="subheaderContent">
            <template v-if="subheaderContent.default" #default>
              <component :is="() => subheaderContent.default()" />
            </template>
            <template v-if="subheaderContent.right" #right>
              <component
                :is="
                  () =>
                    h(
                      Fragment,
                      {},
                      Array.isArray(subheaderContent.right())
                        ? subheaderContent.right()
                        : [subheaderContent.right()],
                    )
                "
              />
            </template>
          </ViewSubheader>
        </div>
      </div>
    </nav>

    <!-- Active Timers Bar -->
    <div v-if="activeTimers.length > 0" class="active-timers-container">
      <ActiveTimerBar v-for="timer in activeTimers" :key="timer.id" :timer="timer" />
    </div>

    <main :class="['content', { 'with-pane-tabs': isDashboard }]">
      <router-view v-slot="{ Component }">
        <keep-alive include="MusicView,BookmarksView">
          <component :is="Component" :key="route.name" />
        </keep-alive>
      </router-view>
    </main>

    <footer class="app-footer">
      <div class="footer-left">
        <img src="/favicon.svg" alt="Craftboard" class="footer-icon" />
        <span>{{ dashboardTitle }}</span>
        <button
          v-if="latestChangelogDate"
          @click="updateAvailable ? showUpdateNotification() : null"
          class="footer-version"
          :class="{ 'update-available': updateAvailable }"
          :title="updateAvailable ? 'Update available! Click to update' : ''"
        >
          {{ latestChangelogDate }}
        </button>
      </div>
      <div class="footer-right">
        <span class="footer-about">Carlos González, 2025 - 2026</span>
        <span class="footer-contact">craftboard@dende.gal</span>
        <a
          href="https://espazo.dende.gal/craftboard-documentation"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-help"
          title="Documentation"
        >
          <HelpCircle :size="14" />
        </a>
      </div>
    </footer>

    <!-- Global Music Player Container -->
    <div
      id="global-music-player"
      class="global-music-player"
      :class="{ 'route-music': route.name === 'music' }"
    ></div>

    <!-- New Pane Modal -->
    <div v-if="showPaneNameModal" class="modal-overlay" @click.self="showPaneNameModal = false">
      <div class="modal pane-modal">
        <h2>Create New Pane</h2>
        <p class="modal-description">Enter a name for your new pane</p>

        <div class="form-group">
          <input
            v-model="newPaneName"
            @keyup.enter="createPane"
            type="text"
            placeholder="Pane name..."
            class="pane-name-input"
            autofocus
          />
        </div>

        <div class="button-group">
          <button @click="createPane" class="create-button">Create</button>
          <button @click="((showPaneNameModal = false), (newPaneName = ''))" class="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Update Available Modal -->
    <div v-if="showUpdateModal" class="modal-overlay" @click.self="showUpdateModal = false">
      <div class="modal update-modal">
        <div class="modal-header-with-icon">
          <div class="modal-icon">
            <Download :size="24" />
          </div>
          <h2>Update Available</h2>
        </div>
        <p class="modal-description">
          A new version of Craftboard is available! Click the button below to reload and get the
          latest features and improvements.
        </p>

        <div class="button-group">
          <button @click="updateApp" class="update-button">
            <RefreshCw :size="16" />
            <span>Update Now</span>
          </button>
          <button @click="showUpdateModal = false" class="cancel-button">Later</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: transparent;
}

.navbar {
  background: transparent;
  border-bottom: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 100;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

body.study-mode .navbar {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-100%);
}

.nav-container {
  display: flex;
  flex-direction: column;
  padding: 0;
  min-height: 48px;
  gap: 0;
  overflow: hidden;
  width: 100%;
}

@media (max-width: 768px) {
  .nav-container {
    flex-direction: row;
  }
}

.nav-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  padding: 10px 16px;
  min-height: 48px;
  transition: background 0.2s ease;
}

.nav-subheader {
  width: 100%;
  padding: 0 16px;
  margin-top: 1px;
  transition: opacity 0.2s ease;
  background: var(--bg-secondary);
  display: block;
}

.nav-subheader.dashboard-subheader {
  padding: 0;
  margin-top: 0;
}

.nav-subheader.dashboard-subheader :deep(.view-subheader) {
  padding: 8px 16px;
  background: transparent;
}

@media (max-width: 768px) {
  .nav-subheader {
    padding: 0;
    margin-top: 0;
    border-top: 1px solid var(--border-primary);
  }

  .nav-subheader :deep(.view-subheader) {
    padding: 8px 16px;
  }

  .nav-subheader :deep(.view-subheader-right) {
    justify-content: flex-start;
    width: 100%;
  }
}

.nav-links {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-start;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1 1 auto;
  min-width: 0;
  scrollbar-width: thin;
  scrollbar-color: #6366f1 var(--bg-tertiary);
  -webkit-overflow-scrolling: touch;
  position: relative;
  padding-bottom: 2px;
  margin-bottom: -2px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Active Timers Container */
.active-timers-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  z-index: 90;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-primary);
}

.app-footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-primary);
  padding: 8px 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.global-music-player {
  position: fixed;
  bottom: 48px;
  right: 0;
  width: 350px;
  max-width: calc(100vw - 40px);
  z-index: 1000;
  transition: all 0.3s ease;
}

.global-music-player .user-positioned {
  bottom: auto;
  right: auto;
  transition: none;
}

.global-music-player:not(:empty) {
  background: var(--bg-secondary);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.global-music-player:not(:empty):hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.footer-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
  background: transparent;
  border: none;
}

.footer-version {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-left: 4px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  background: transparent;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: default;
  transition: all 0.2s ease;
  position: relative;
  /* Override parent gradient text */
  -webkit-text-fill-color: var(--text-tertiary);
  background-clip: unset;
  -webkit-background-clip: unset;
}

.footer-version.update-available {
  cursor: pointer;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  padding: 4px 10px;
  padding-right: 24px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.4);
  -webkit-text-fill-color: white;
}

.footer-version.update-available::after {
  content: '•';
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: white;
  font-size: 16px;
  animation: blink 1.5s ease-in-out infinite;
}

.footer-version.update-available:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.5);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--text-secondary);
}

.footer-about {
  font-weight: 500;
}

.footer-contact {
  color: var(--text-tertiary);
}

.footer-help {
  display: inline-flex;
  align-items: center;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color 0.2s ease;
  margin-left: 8px;
}

.footer-help:hover {
  color: var(--text-primary);
}

.footer-changelog-date {
  color: var(--text-tertiary);
  font-size: 10px;
}

/* Mobile: Center footer items */
@media (max-width: 768px) {
  .app-footer {
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    text-align: center;
  }

  .footer-right {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
}

.nav-links::-webkit-scrollbar {
  height: 8px;
  display: block !important;
}

.nav-links::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.nav-links::-webkit-scrollbar-thumb {
  background: #6366f1;
  border-radius: 4px;
  min-width: 30px;
}

.nav-links::-webkit-scrollbar-thumb:hover {
  background: #818cf8;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.theme-toggle {
  /* Theme toggle button specific styles if needed */
}

.nav-link:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.nav-link.router-link-active,
.nav-link.router-link-exact-active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: var(--btn-primary-text);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.nav-link.router-link-active:hover,
.nav-link.router-link-exact-active:hover {
  background: var(--btn-primary-hover);
}

.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #ef4444;
  color: white;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  margin-left: auto;
}

.nav-link.router-link-active .nav-badge,
.nav-link.router-link-exact-active .nav-badge {
  background: rgba(255, 255, 255, 0.3);
  color: white;
}

.content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

@media (max-width: 768px) {
  .content {
    overflow: hidden;
  }
}

.content.with-pane-tabs {
  padding-top: 0;
  position: relative;
}

.view-mode-buttons {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
}

.view-mode-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.view-mode-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.view-mode-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.view-mode-button.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

@media (max-width: 768px) {
  .view-mode-buttons {
    gap: 2px;
    padding: 1px;
  }

  .view-mode-button {
    padding: 4px 8px;
    font-size: 11px;
    gap: 4px;
  }

  /* Show labels on mobile for subheader buttons */
  .nav-subheader.mobile-subheader .view-mode-button span {
    display: inline;
  }

  .nav-subheader.mobile-subheader .add-widget-button span {
    display: inline;
  }
}

/* Mobile Sidebar */
.mobile-sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  display: none;
}

.mobile-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-primary);
  z-index: 9999;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  display: none;
  flex-direction: column;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.mobile-sidebar-header {
  flex-shrink: 0;
}

.mobile-sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mobile-sidebar-footer {
  flex-shrink: 0;
}

.mobile-sidebar.open {
  transform: translateX(0);
}

.mobile-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-primary);
}

.mobile-sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.mobile-sidebar-brand-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
  background: transparent;
  border: none;
}

.mobile-sidebar-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-sidebar-close:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.mobile-sidebar-nav {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.2s ease;
  font-weight: 500;
  font-size: 15px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  text-align: left;
}

.mobile-nav-link:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.mobile-nav-link.router-link-active,
.mobile-nav-link.router-link-exact-active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: var(--btn-primary-text);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.mobile-sidebar-subheader {
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
}

.mobile-subheader-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-pane-tabs {
  width: 100%;
}

.mobile-pane-tabs :deep(.pane-tabs-wrapper) {
  flex-direction: column;
  gap: 8px;
}

.mobile-pane-tabs :deep(.pane-tabs-container) {
  flex-direction: column;
  width: 100%;
  max-height: none;
  overflow-y: auto;
  overflow-x: hidden;
  align-items: stretch;
  padding: 4px;
}

.mobile-pane-tabs :deep(.pane-tab-wrapper) {
  width: 100%;
  margin-right: 0;
  margin-bottom: 4px;
}

.mobile-pane-tabs :deep(.pane-tab-wrapper:last-child) {
  margin-bottom: 0;
}

.mobile-pane-tabs :deep(.pane-tab) {
  width: 100%;
  justify-content: space-between;
  min-width: auto;
}

.mobile-pane-tabs :deep(.pane-scroll-button) {
  display: none;
}

.mobile-pane-tabs :deep(.add-pane-tab) {
  width: 100%;
  justify-content: center;
  margin-top: 4px;
}

.mobile-subheader-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-add-widget-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: white;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
  width: 100%;
}

.mobile-add-widget-button:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.mobile-view-mode-buttons {
  display: flex;
  gap: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 2px;
}

.mobile-view-mode-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
  flex: 1;
}

.mobile-view-mode-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.mobile-view-mode-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.mobile-view-mode-button.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.mobile-subheader-left,
.mobile-subheader-right {
  width: 100%;
}

.mobile-subheader-left :deep(.view-tabs-container),
.mobile-subheader-right :deep(.view-tabs-container) {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.mobile-subheader-left :deep(.view-tabs),
.mobile-subheader-right :deep(.view-tabs) {
  flex-direction: column;
  width: 100%;
  align-items: stretch;
  padding: 4px;
}

.mobile-subheader-left :deep(.view-tab),
.mobile-subheader-right :deep(.view-tab) {
  width: 100%;
  justify-content: flex-start;
  min-width: auto;
}

.mobile-app-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.mobile-footer-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
  background: transparent;
  border: none;
}

.mobile-footer-version {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-left: 4px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  background: transparent;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: default;
  transition: all 0.2s ease;
  position: relative;
  /* Override parent gradient text */
  -webkit-text-fill-color: var(--text-tertiary);
  background-clip: unset;
  -webkit-background-clip: unset;
}

.mobile-footer-version.update-available {
  cursor: pointer;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  padding: 4px 10px;
  padding-right: 24px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.4);
  -webkit-text-fill-color: white;
}

.mobile-footer-version.update-available::after {
  content: '•';
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: white;
  font-size: 16px;
  animation: blink 1.5s ease-in-out infinite;
}

.mobile-footer-version.update-available:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.5);
}

.mobile-footer-right {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.mobile-footer-about {
  font-weight: 500;
}

.mobile-footer-contact {
  color: var(--text-tertiary);
}

.mobile-footer-help {
  display: inline-flex;
  align-items: center;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color 0.2s ease;
  margin-left: 8px;
}

.mobile-footer-help:hover {
  color: var(--text-primary);
}

.mobile-footer-changelog-date {
  color: var(--text-tertiary);
  font-size: 10px;
}

.mobile-sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-view-name {
  display: none;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
}

.mobile-hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-hamburger:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--btn-primary-bg);
}

/* Mobile Navbar Layout */
@media (max-width: 768px) {
  .mobile-sidebar-overlay {
    display: block;
  }

  .mobile-sidebar {
    display: flex;
  }

  .mobile-view-name {
    display: flex;
  }

  .mobile-hamburger {
    display: flex;
  }

  .desktop-nav {
    display: none !important;
  }

  .app-footer {
    display: none !important;
  }

  .nav-container {
    flex-direction: column !important;
    align-items: stretch;
    justify-content: flex-start;
    padding: 0;
    height: auto;
    gap: 0;
  }

  .nav-top-row {
    flex-direction: row !important;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
  }

  .nav-subheader {
    display: block !important;
    order: 2;
  }

  .nav-brand {
    justify-content: center;
    width: 100%;
    font-size: 17px;
    padding-bottom: 2px;
  }
  .nav-links {
    flex-direction: row;
    justify-content: center;
    gap: 4px;
    width: 100%;
    margin-top: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }
  .nav-right {
    justify-content: center;
    width: 100%;
    order: 2;
  }

  .nav-links::-webkit-scrollbar {
    height: 4px;
  }

  .nav-links::-webkit-scrollbar-track {
    background: transparent;
  }

  .nav-links::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 2px;
  }

  .nav-links::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .nav-link {
    flex: 0 0 auto;
    justify-content: center;
    font-size: 13px;
    padding: 7px 12px;
    min-width: 0;
    border-radius: 6px;
    gap: 4px;
  }
  .nav-links .nav-link span {
    display: none;
  }
  .nav-right .nav-link span {
    display: inline;
  }
  .nav-link.router-link-active,
  .nav-link.router-link-exact-active {
    box-shadow: none;
  }
}

/* Pane Tabs Header Styles */
.pane-tabs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: transparent;
  border-top: none;
  flex-shrink: 0;
  min-height: 40px;
}

.pane-tabs-left-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
  position: relative;
}

.pane-tabs-left {
  display: inline-flex;
  gap: 0;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  align-items: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
}

.pane-tabs-left::-webkit-scrollbar {
  display: none;
}

.pane-scroll-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pane-scroll-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.pane-scroll-button:active {
  transform: scale(0.95);
}

.pane-tabs-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: none;
  align-self: center;
  margin-bottom: 0;
}

.pane-tab-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.pane-tab-wrapper:not(:last-child) {
  margin-right: 2px;
}

.pane-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  user-select: none;
  min-width: 60px;
}

.pane-tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.pane-tab.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
  font-weight: 600;
}

.pane-tab.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.pane-tab.active:hover {
  background: var(--bg-primary);
}

.pane-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pane-tab:hover .pane-actions,
.pane-tab.active .pane-actions {
  opacity: 1;
}

.pane-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.pane-tab.active .pane-action-button {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.pane-tab:not(.active) .pane-action-button {
  background: transparent;
  color: var(--text-tertiary);
}

.pane-action-button:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.1);
}

.pane-tab:not(.active) .delete-button:hover {
  color: var(--btn-danger-bg);
  background: rgba(239, 68, 68, 0.1);
}

.pane-edit-form {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 2px solid var(--btn-primary-bg);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  flex: 1;
  min-width: 0;
}

.pane-edit-input {
  flex: 1;
  min-width: 80px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.pane-edit-input:focus {
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.pane-action-button.save-button {
  color: var(--btn-primary-bg);
}

.pane-action-button.save-button:hover {
  background: rgba(99, 102, 241, 0.2);
  color: var(--btn-primary-bg);
}

.pane-action-button.cancel-edit-button {
  color: var(--text-tertiary);
}

.pane-action-button.cancel-edit-button:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--btn-danger-bg);
}

.add-pane-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  margin-left: 8px;
  background: transparent;
  border: 1px dashed var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.add-pane-tab:hover {
  background: var(--bg-tertiary);
  border-color: var(--btn-primary-bg);
  border-style: solid;
  color: var(--text-primary);
}

.add-widget-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: white;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
}

.add-widget-button:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.add-widget-button:active {
  transform: translateY(0);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
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

.modal h2 {
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

.pane-modal {
  max-width: 380px;
}

.form-group {
  margin-bottom: 20px;
}

.pane-name-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-sizing: border-box;
  background: var(--input-bg);
  color: var(--input-text);
}

.pane-name-input:focus {
  outline: none;
  border-color: var(--btn-primary-bg);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.button-group {
  display: flex;
  gap: 10px;
}

.create-button {
  flex: 1;
  padding: 10px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-button:hover {
  background: var(--btn-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-medium);
}

.button-group .cancel-button {
  flex: 1;
  width: auto;
  padding: 10px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.button-group .cancel-button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

/* Update Modal Styles */
.update-modal {
  max-width: 420px;
}

.modal-header-with-icon {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.modal-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border-radius: 12px;
  color: white;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
}

.modal-header-with-icon h2 {
  margin: 0;
}

.update-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
}

.update-button:hover {
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.update-button:active {
  transform: translateY(0);
}

/* View Mode Buttons in Pane Tabs */
.pane-tabs-header .view-mode-buttons {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 2px;
}

.pane-tabs-header .view-mode-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.pane-tabs-header .view-mode-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.pane-tabs-header .view-mode-button.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
}

.pane-tabs-header .view-mode-button.active:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

/* Mobile styles for pane tabs header */
@media (max-width: 768px) {
  .pane-tabs-header {
    padding: 6px 12px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pane-tabs-left-wrapper {
    gap: 4px;
    width: 100%;
    order: 2;
  }

  .pane-tabs-left {
    gap: 0;
    flex: 1;
    min-width: 0;
    padding: 2px;
  }

  .pane-scroll-button {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .pane-tabs-right {
    flex-shrink: 0;
    order: 1;
    width: 100%;
    justify-content: center;
    align-items: center;
    margin-bottom: 4px;
    margin-left: 0;
    padding-left: 0;
    border-left: none;
    border-bottom: none;
    padding-bottom: 4px;
    gap: 6px;
  }

  .pane-tabs-header .view-mode-buttons {
    gap: 2px;
    padding: 1px;
  }

  .pane-tabs-header .view-mode-button {
    padding: 4px 8px;
    font-size: 10px;
    gap: 3px;
  }

  .pane-tabs-header .view-mode-button span {
    display: none;
  }

  .add-pane-tab span {
    display: none;
  }

  .add-widget-button {
    padding: 5px 10px;
    font-size: 11px;
  }

  /* Keep labels hidden in pane tabs header, but show in mobile subheader */
  .pane-tabs-header .add-widget-button span {
    display: none;
  }
}

/* Save Settings Button in Subheader */
.save-button-subheader {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 12px !important;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  color: white !important;
  border: none !important;
  border-radius: 6px !important;
  font-family: inherit !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3) !important;
  white-space: nowrap !important;
}

.save-button-subheader:hover {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4) !important;
}

.save-button-subheader:active {
  transform: translateY(0) !important;
}
</style>
