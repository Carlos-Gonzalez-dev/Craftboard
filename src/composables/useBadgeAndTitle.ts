import { watch, computed } from 'vue'
import { useTasksStore } from '../stores/tasks'
import type { CraftTask } from '../utils/craftApi'

const DEFAULT_TITLE = 'Craftboard'

export function useBadgeAndTitle() {
  const tasksStore = useTasksStore()

  // Count tasks due today
  const todayTasksCount = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const allTasks = [
      ...tasksStore.inboxTasks,
      ...tasksStore.activeTasks,
      ...tasksStore.upcomingTasks,
    ]

    // Remove duplicates
    const unique = new Map<string, CraftTask>()
    allTasks.forEach((task) => {
      if (!unique.has(task.id)) {
        unique.set(task.id, task)
      }
    })

    // Count tasks with scheduleDate today or overdue
    return Array.from(unique.values()).filter((task) => {
      // Only count todo tasks
      if (task.taskInfo?.state) {
        if (task.taskInfo.state !== 'todo') return false
      } else if (task.completedAt || task.canceledAt) {
        return false
      }

      const scheduleDate = task.taskInfo?.scheduleDate
      if (!scheduleDate) return false

      const taskDate = new Date(scheduleDate)
      taskDate.setHours(0, 0, 0, 0)

      // Include tasks scheduled for today or earlier (overdue)
      return taskDate <= today
    }).length
  })

  // Update document title
  const updateDocumentTitle = () => {
    const count = todayTasksCount.value
    if (count > 0) {
      document.title = `(${count}) ${DEFAULT_TITLE}`
    } else {
      document.title = DEFAULT_TITLE
    }
  }

  // Update badge (for PWA)
  const updateBadge = async () => {
    if (!navigator.setAppBadge) {
      // Badge API not supported
      return
    }

    try {
      const count = todayTasksCount.value
      if (count > 0) {
        await navigator.setAppBadge(count)
      } else {
        await navigator.clearAppBadge()
      }
    } catch (error) {
      console.warn('Badge API error:', error)
    }
  }

  // Watch for changes in task counts
  watch(todayTasksCount, () => {
    updateDocumentTitle()
    updateBadge()
  })

  // Initial setup
  if (typeof document !== 'undefined') {
    updateDocumentTitle()
    updateBadge()
  }

  return {
    todayTasksCount,
    updateDocumentTitle,
    updateBadge,
  }
}
