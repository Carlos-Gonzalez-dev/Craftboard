export interface ChangelogEntry {
  date: string
  changes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    date: '2026-01-06',
    changes: [
      'Dragging is now only possible using the widget header to prevent moving widgets accidentally',
      'Improved the music player. Now it works even when changing views as a floating music player',
      'Improved Pomodoro Timers. Now they are visible on all views as a floating timer',
      'Improved Stopwatch . Now it works even when changing views as a floating stopwatch',
    ],
  },
  {
    date: '2026-01-04v2',
    changes: [
      'On mobile added a reload app button on the sidebar footer',
      'Added button to reload app if a new version is released',
      'Deleted PIN Widget. It was not being used',
      'Minor adjustements to ClockWidget',
      'Improve DailyNoteWidget',
    ],
  },
  {
    date: '2026-01-04',
    changes: [
      'Added import / export settings feature',
      'Optimized call to get document widget tasks',
      'Add direct links to the collections on most views',
      'Add active tasks counter on the tasks tab',
      'Improve bookmark filtering',
      'Bookmark tags now have unique colors',
      'Improve favicons',
    ],
  },
  {
    date: '2025-12-27',
    changes: [
      'Added specific navigation for mobile devices',
      'Changelog now is date based instead of version based',
      "Now it's possible to sort dashboard tabs",
      'Improved add widget list now they are grouped by category',
      'Removed unnecesary sections on Stats widgets',
      'Fix BookmarkWidget it now uses the new CollectionID stored in settings',
      'Update contact e-mail',
    ],
  },
  {
    date: '2025-12-26',
    changes: [
      'Added autodiscovery of collections to avoid searching the ids manually',
      'Added progressbar indicator on all widgets',
      'Added open links in Craft Web (Beta) untested, please report any issues',
      'Added progress indicator on all views',
      'Changed cache expiry from hours to minutes',
      'Reduce number of API calls on some views',
      'Fixed RSS proxy request with a localhost URL on production',
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
