import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePanes } from './usePanes'

// Letras para panes (hasta 10 panes)
export const PANE_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']

// Feature flag - singleton
const enabled = ref(localStorage.getItem('craftboard-keyboard-shortcuts') !== 'false')

export const keyboardShortcutsEnabled = computed(() => enabled.value)

export function useKeyboardShortcuts(options: {
  navigationItems: () => Array<{ path: string; name: string }>
  onToggleQuickAccess?: () => void
  isDashboard: () => boolean
}) {
  const router = useRouter()
  const { panes, switchPane } = usePanes()

  const isInputFocused = (): boolean => {
    const el = document.activeElement
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el?.getAttribute('contenteditable') === 'true'
    )
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (!enabled.value) return
    if (isInputFocused()) return

    const key = e.key.toUpperCase()

    // Números 1-9 para navegación del menú
    if (/^[1-9]$/.test(e.key)) {
      // No interferir con shortcuts del navegador (cmd+1, ctrl+1, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const index = parseInt(e.key) - 1
      const items = options.navigationItems()
      const item = items[index]
      if (item) {
        e.preventDefault()
        router.push(item.path)
      }
      return
    }

    // Letras Q,W,E,R... para panes (solo en dashboard)
    if (options.isDashboard()) {
      const paneIndex = PANE_KEYS.indexOf(key)
      const pane = panes.value[paneIndex]
      if (paneIndex !== -1 && pane) {
        e.preventDefault()
        switchPane(pane.id)
        return
      }
    }

    // Espacio para Quick Actions
    if (e.code === 'Space' && options.onToggleQuickAccess) {
      e.preventDefault()
      options.onToggleQuickAccess()
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

  return { enabled }
}
