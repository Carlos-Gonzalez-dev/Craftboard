<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Zap,
  Calendar,
  FileText,
  Search,
  FolderOpen,
  CalendarDays,
  Files,
} from 'lucide-vue-next'
import { getSpaceId, fetchAndCacheSpaceId } from '../utils/craftApi'

const isOpen = ref(false)
const searchQuery = ref('')
const menuRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLElement | null>(null)

const toggleMenu = () => {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    searchQuery.value = ''
  }
}

const closeMenu = () => {
  isOpen.value = false
  searchQuery.value = ''
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node
  if (
    menuRef.value &&
    !menuRef.value.contains(target) &&
    buttonRef.value &&
    !buttonRef.value.contains(target)
  ) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Get space ID (cached or fetch)
const getSpace = async (): Promise<string> => {
  let spaceId = getSpaceId()
  if (!spaceId) {
    spaceId = (await fetchAndCacheSpaceId()) || ''
  }
  return spaceId
}

// Daily Notes actions
const openDailyNote = async (query: 'yesterday' | 'today' | 'tomorrow') => {
  const spaceId = await getSpace()
  if (!spaceId) {
    alert('Space ID not configured. Please set it in Settings.')
    return
  }
  window.location.href = `craftdocs://openByQuery?query=${query}&spaceId=${spaceId}`
  closeMenu()
}

// New Document action
const createNewDocument = () => {
  window.location.href = 'craftdocs://createnewdocument'
  closeMenu()
}

// Search action
const executeSearch = async () => {
  if (!searchQuery.value.trim()) return

  const spaceId = await getSpace()
  if (!spaceId) {
    alert('Space ID not configured. Please set it in Settings.')
    return
  }

  const encodedQuery = encodeURIComponent(searchQuery.value.trim())
  window.location.href = `craftdocs://opensearch?spaceId=${spaceId}&query=${encodedQuery}`
  closeMenu()
}

const handleSearchKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    executeSearch()
  } else if (event.key === 'Escape') {
    showSearchInput.value = false
    searchQuery.value = ''
  }
}

// Open Space actions
const openSpace = async (tab: 'calendar' | 'search' | 'documents') => {
  const spaceId = await getSpace()
  if (!spaceId) {
    alert('Space ID not configured. Please set it in Settings.')
    return
  }
  window.location.href = `craftdocs://openspace?spaceId=${spaceId}&tab=${tab}`
  closeMenu()
}
</script>

<template>
  <div class="quick-access-container">
    <!-- Floating Action Button -->
    <button ref="buttonRef" class="quick-access-fab" :class="{ open: isOpen }" @click="toggleMenu">
      <Zap :size="22" />
    </button>

    <!-- Popup Menu -->
    <Transition name="menu">
      <div v-if="isOpen" ref="menuRef" class="quick-access-menu">
        <!-- Daily Notes Section -->
        <div class="menu-section">
          <div class="menu-section-header">
            <CalendarDays :size="14" />
            <span>Daily Notes</span>
          </div>
          <button class="menu-item" @click="openDailyNote('yesterday')">Yesterday</button>
          <button class="menu-item" @click="openDailyNote('today')">Today</button>
          <button class="menu-item" @click="openDailyNote('tomorrow')">Tomorrow</button>
        </div>

        <div class="menu-divider"></div>

        <!-- New Document -->
        <button class="menu-item" @click="createNewDocument">
          <FileText :size="14" />
          <span>New Document</span>
        </button>

        <div class="menu-divider"></div>

        <!-- Search -->
        <div class="search-input-container" @click.stop>
          <Search :size="14" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search in Craft..."
            class="search-input"
            @keydown="handleSearchKeydown"
          />
          <button class="search-submit" @click.stop="executeSearch">Go</button>
        </div>

        <div class="menu-divider"></div>

        <!-- Open Space Section -->
        <div class="menu-section">
          <div class="menu-section-header">
            <FolderOpen :size="14" />
            <span>Open Space</span>
          </div>
          <button class="menu-item" @click="openSpace('calendar')">
            <Calendar :size="14" />
            <span>Calendar</span>
          </button>
          <button class="menu-item" @click="openSpace('search')">
            <Search :size="14" />
            <span>Search</span>
          </button>
          <button class="menu-item" @click="openSpace('documents')">
            <Files :size="14" />
            <span>Documents</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.quick-access-container {
  position: fixed;
  bottom: 60px;
  right: 20px;
  z-index: 950;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.quick-access-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 12px rgba(168, 85, 247, 0.4),
    0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.quick-access-fab:hover {
  transform: scale(1.05);
  box-shadow:
    0 6px 16px rgba(168, 85, 247, 0.5),
    0 3px 6px rgba(0, 0, 0, 0.15);
}

.quick-access-fab.open {
  transform: rotate(45deg);
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
}

.quick-access-menu {
  position: absolute;
  bottom: 58px;
  right: 0;
  min-width: 200px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.15),
    0 4px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(12px);
  overflow: hidden;
  padding: 8px 0;
}

.menu-section {
  padding: 0;
}

.menu-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  font-family: inherit;
}

.menu-item:hover {
  background: var(--bg-tertiary);
  color: #a855f7;
}

.menu-item .chevron {
  margin-left: auto;
  opacity: 0.5;
}

.menu-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 6px 0;
}

.search-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.search-input-container svg {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-submit {
  padding: 4px 10px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.search-submit:hover {
  transform: scale(1.02);
}

/* Menu transition */
.menu-enter-active,
.menu-leave-active {
  transition: all 0.2s ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

/* Responsive */
@media (max-width: 480px) {
  .quick-access-container {
    bottom: 16px;
    right: 16px;
  }

  .quick-access-fab {
    width: 44px;
    height: 44px;
  }

  .quick-access-menu {
    right: -4px;
    min-width: 180px;
  }
}
</style>
