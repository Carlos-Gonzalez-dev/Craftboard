export interface ChangelogEntry {
  date: string
  changes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    date: '2026-01-10',
    changes: [
      'Improve iCal support (recurring events, all-day events)',
      'Improve tags color scheme',
    ],
  },
  {
    date: '2026-01-08v2',
    changes: [
      'Reverted live activity and media session API support. Not working as expected, might come back in the future',
    ],
  },
  {
    date: '2026-01-08',
    changes: [
      'Fixed Tag visibility setting, now it hides the Tag tab correctly',
      'Added media session API support for MusicView, it should keep playing music when the app is in the background',
      'Added live activity support for Pomodoro and Stopwatch timers',
      'Improve Tag charts',
      'Refactor some code for clarity',
    ],
  },
  {
    date: '2026-01-07v2',
    changes: [
      'Persist tasks on local storage to avoid losing them on refresh',
      'Add task count on installed web app (PWA) badge',
      'Tags can now be viewed as chart in tag view',
    ],
  },
  {
    date: '2026-01-07',
    changes: ['Improved Tags view'],
  },
  {
    date: '2026-01-06v2',
    changes: [
      'Improved update button on mobile',
      'Added "All" buttons to Bookmark and RSS views to show all items without filters',
      'Added Tags view to surface tagged notes',
      'Added ability to hide task and tags tabs',
    ],
  },
  {
    date: '2026-01-06',
    changes: [
      'Dragging is now only possible using the widget header to prevent moving widgets accidentally',
      'Music player keeps playing across views as a floating player',
      'Pomodoro timers are visible on all views as a floating timer',
      'Stopwatch keeps running across views as a floating stopwatch',
    ],
  },
  {
    date: '2026-01-04v2',
    changes: [
      'Added a reload button to the mobile sidebar footer',
      'Added reload prompt when a new version is released',
      'Removed PIN widget (unused)',
      'Minor adjustments to ClockWidget',
      'Improved DailyNoteWidget',
    ],
  },
  {
    date: '2026-01-04',
    changes: [
      'Added settings import/export',
      'Optimized document task fetch',
      'Added direct links to collections in most views',
      'Added active tasks counter to the tasks tab',
      'Improved bookmark filtering',
      'Bookmark tags now have unique colors',
      'Improved favicons',
    ],
  },
  {
    date: '2025-12-27',
    changes: [
      'Added specific navigation for mobile devices',
      'Changelog is now date-based instead of version-based',
      "Now it's possible to sort dashboard tabs",
      'Improved add-widget list; widgets are now grouped by category',
      'Removed unnecessary sections on Stats widgets',
      'Fixed BookmarkWidget; it now uses the new CollectionID stored in settings',
      'Updated contact email',
    ],
  },
  {
    date: '2025-12-26',
    changes: [
      'Added auto-discovery of collections to avoid searching the ids manually',
      'Added progress bar indicator on all widgets',
      'Added option to open links in Craft Web (beta); please report issues',
      'Added progress indicator on all views',
      'Changed cache expiry from hours to minutes',
      'Reduced number of API calls on some views',
      'Fixed RSS proxy requesting a localhost URL in production',
    ],
  },
  {
    date: '2025-12-25',
    changes: ['Initial release'],
  },
]

// Get the latest changelog date
export const getLatestChangelogDate = (): string => {
  if (changelog.length === 0) return ''
  const latest = changelog[0]
  return latest ? latest.date : ''
}
