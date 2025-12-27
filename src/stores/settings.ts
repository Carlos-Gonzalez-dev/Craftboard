import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', () => {
  const dashboardTitle = ref(localStorage.getItem('dashboard-title') || 'Craftboard')

  function setDashboardTitle(title: string) {
    dashboardTitle.value = title
    localStorage.setItem('dashboard-title', title)
  }

  return { dashboardTitle, setDashboardTitle }
})
