# Tags API Store Migration

## Overview

A Pinia store (`useTagsApiStore`) has been created to centralize all API and caching logic for the tags functionality. This allows reusing the logic in other components and views without code duplication.

## Changes Made

### New Store: `src/stores/tagsApi.ts`

Contains all the logic for:

- **API Calls**: Document search and block fetching
- **Tag Extraction**: Markdown parsing to find tags (#tag)
- **Caching**: Cache management with localStorage and configurable expiration
- **State**: logs, isLoading, error, totalApiCalls, completedApiCalls

#### Main Methods:

- `loadLogs(tags: string[], forceRefresh?: boolean)`: Load logs for a set of tags
- `refreshLogs(tags: string[])`: Force reload from API (ignores cache)
- `clearCache(tags: string[])`: Clear cache for specific tags
- `clearAllCache()`: Clear all tags cache
- `extractMatchingTags(markdown: string, pattern?: string)`: Extract tags from markdown

### Changes to TagsView.vue

- **Imports**: Now imports the store and `LogEntry` type from the store
- **Store**: Initializes `useTagsApiStore()`
- **Computed**: logs, isLoading, error, totalApiCalls, completedApiCalls are now computed properties pointing to the store
- **Removed Methods**: getCacheKey, getCachedData, setCachedData (now in the store)
- **Removed Methods**: extractMatchingTags, extractBlocksWithTags (now in the store)
- **Simplified Methods**: loadLogs now simply delegates to the store
- **Removed Constants**: CACHE_PREFIX (now in the store)

## Advantages

1. **Reusability**: Other components can use `useTagsApiStore()` to access the same logic
2. **Separation of Concerns**: API/cache logic is separated from UI logic
3. **Testability**: The store can be tested independently from the component
4. **Maintainability**: Changes to API logic are made in one place
5. **Scalability**: Easy to add more stores for RSS, tasks, etc. following the same pattern

## Next Steps

The same pattern can be used to create similar stores for:

- RSS API (`useRSSApiStore`)
- Tasks API (`useTasksApiStore`)
- Bookmarks API (`useBookmarksApiStore`)

## Compatibility

- Fully compatible with existing code
- No changes to UI or user behavior
- Cache functionality is identical to the previous implementation
