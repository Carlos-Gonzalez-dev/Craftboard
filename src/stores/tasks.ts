import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { CraftTask } from '../utils/craftApi'

export const useTasksStore = defineStore('tasks', () => {
  // State
  const inboxTasks = ref<CraftTask[]>([])
  const activeTasks = ref<CraftTask[]>([])
  const upcomingTasks = ref<CraftTask[]>([])

  // Getters
  const activeTasksCount = computed(() => {
    // Count only todo tasks with non-empty titles
    const getTaskStatus = (task: CraftTask): 'todo' | 'done' | 'canceled' => {
      const status = task.taskInfo?.state
      if (status === 'done') return 'done'
      if (status === 'canceled') return 'canceled'
      return 'todo'
    }

    const extractTitleFromMarkdown = (markdown: string): string => {
      if (!markdown) return ''
      const lines = markdown.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (
          trimmed &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('-') &&
          !trimmed.startsWith('#')
        ) {
          return trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
        }
      }
      return markdown.trim()
    }

    return activeTasks.value.filter((task) => {
      const status = getTaskStatus(task)
      if (status !== 'todo') return false
      const title = extractTitleFromMarkdown(task.markdown || '')
      return title && title.trim() !== ''
    }).length
  })

  const allTasks = computed(() => {
    const all = [...inboxTasks.value, ...activeTasks.value, ...upcomingTasks.value]
    // Remove duplicates by id
    const unique = new Map<string, CraftTask>()
    all.forEach((task) => {
      if (!unique.has(task.id)) {
        unique.set(task.id, task)
      }
    })
    return Array.from(unique.values())
  })

  // Actions
  function setInboxTasks(tasks: CraftTask[]) {
    inboxTasks.value = tasks
  }

  function setActiveTasks(tasks: CraftTask[]) {
    activeTasks.value = tasks
  }

  function setUpcomingTasks(tasks: CraftTask[]) {
    upcomingTasks.value = tasks
  }

  function setAllTasks(inbox: CraftTask[], active: CraftTask[], upcoming: CraftTask[]) {
    inboxTasks.value = inbox
    activeTasks.value = active
    upcomingTasks.value = upcoming
  }

  function clearTasks() {
    inboxTasks.value = []
    activeTasks.value = []
    upcomingTasks.value = []
  }

  return {
    // State
    inboxTasks,
    activeTasks,
    upcomingTasks,
    // Getters
    activeTasksCount,
    allTasks,
    // Actions
    setInboxTasks,
    setActiveTasks,
    setUpcomingTasks,
    setAllTasks,
    clearTasks,
  }
})
