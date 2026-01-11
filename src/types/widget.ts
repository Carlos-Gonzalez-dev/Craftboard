export interface Widget {
  id: string
  type:
    | 'markdown'
    | 'clock'
    | 'notes'
    | 'tasks'
    | 'collection'
    | 'daily-note'
    | 'pin-block'
    | 'pin-url'
    | 'stats'
    | 'task-stats'
    | 'collection-chart'
    | 'graph'
    | 'bookmark'
    | 'quote'
    | 'rss'
    | 'pomodoro'
    | 'document-tasks'
    | 'stopwatch'
    | 'iframe'
  x: number
  y: number
  w: number
  h: number
  title: string
  color?: string
  data?: any
}
