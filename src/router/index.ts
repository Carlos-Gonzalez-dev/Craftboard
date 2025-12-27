import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import SettingsView from '../views/SettingsView.vue'
import FlashcardsView from '../views/FlashcardsView.vue'
import MusicView from '../views/MusicView.vue'
import GraphView from '../views/GraphView.vue'
import BookmarksView from '../views/BookmarksView.vue'
import RSSView from '../views/RSSView.vue'
import TasksView from '../views/TasksView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/flashcards',
      name: 'flashcards',
      component: FlashcardsView,
    },
    {
      path: '/music',
      name: 'music',
      component: MusicView,
    },
    {
      path: '/graph',
      name: 'graph',
      component: GraphView,
    },
    {
      path: '/bookmarks',
      name: 'bookmarks',
      component: BookmarksView,
    },
    {
      path: '/rss',
      name: 'rss',
      component: RSSView,
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: TasksView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

export default router
