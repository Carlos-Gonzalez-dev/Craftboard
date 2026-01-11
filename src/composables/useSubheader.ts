import { inject, onMounted, onUnmounted, type Ref } from 'vue'

export function useSubheader(content: Ref<{ default?: () => any; right?: () => any } | null>) {
  const setSubheader =
    inject<(content: { default?: () => any; right?: () => any } | null) => void>('setSubheader')

  onMounted(() => {
    if (setSubheader) {
      setSubheader(content.value)
    }
  })

  onUnmounted(() => {
    if (setSubheader) {
      setSubheader(null)
    }
  })

  // Watch content changes
  const stopWatcher = inject<(() => void) | undefined>('watchSubheader', () => {
    if (setSubheader && content.value) {
      setSubheader(content.value)
    }
  })

  return { setSubheader }
}
