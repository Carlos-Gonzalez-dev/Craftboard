export interface ChangelogEntry {
  date: string
  changes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    date: '2025-12-27',
    changes: [
      'Added specific navigation for mobile devices',
      'Changelog now is date based instead of version based',
      "Now it's possible to sort dashboard tabs",
      'Improved add widget list now they are grouped by category',
      'Removed unnecesary sections on Stats widgets',
      'Fix BookmarkWidget it now uses the new CollectionID stored on settings',
    ],
  },
  {
    date: '2025-12-26',
    changes: [
      'Added autodiscovery of collections to avoid searching the ids manually',
      'Added progressbar indicator on all widgets',
      'Added open links in Craft Web (Beta) untested, please report any issues',
    ],
  },
  {
    date: '2025-12-26',
    changes: ['Added progress indicator on all views'],
  },
  {
    date: '2025-12-26',
    changes: [
      'Changed cache expiry from hours to minutes',
      'Reduce number of API calls on some views',
      'Fixed RSS proxy request with a localhost URL on production',
    ],
  },
  {
    date: '2025-12-25',
    changes: ['Fixed several bugs'],
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
