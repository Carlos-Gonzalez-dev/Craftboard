# RSS API Store Migration

## Overview

A Pinia store (`useRSSApiStore`) has been created to centralize all API and caching logic for the RSS functionality. This allows reusing the logic in other components and views without code duplication.

## Changes Made

### New Store: `src/stores/rssApi.ts`

Contains all the logic for:

- **API Calls**: RSS collection items fetching
- **RSS Feed Parsing**: Integration with RSS parser utility
- **Feed Management**: Individual feed fetching and caching
- **Caching**: Cache management with localStorage and configurable expiration
- **State**: rssItems, rssFeeds, loadingFeeds, isLoading, error, totalApiCalls, completedApiCalls

#### Main Methods:

- `initializeRSS(collectionId: string, forceRefresh?: boolean)`: Load RSS items and feeds for a collection
- `refreshRSS(collectionId: string)`: Force reload from API (ignores cache)
- `refreshFeed(item: RSSCollectionItem)`: Refresh a single feed
- `fetchFeedForItem(item: RSSCollectionItem, forceRefresh?: boolean)`: Fetch a single RSS feed
- `fetchAllFeeds()`: Fetch all feeds for current items
- `clearCache(collectionId: string)`: Clear cache for specific collection
- `clearAllCache()`: Clear all RSS cache

### Changes to RSSView.vue

- **Imports**: Now imports the store and `RSSCollectionItem` type from the store
- **Store**: Initializes `useRSSApiStore()`
- **Computed**: rssItems, rssFeeds, loadingFeeds, isLoading, totalApiCalls, completedApiCalls are now computed properties pointing to the store
- **Removed Methods**: getCacheKey, getCachedData, setCachedData, clearCache (now in the store)
- **Removed Methods**: fetchCollectionItems, fetchFeedForItem, fetchAllFeeds (now in the store)
- **Removed Functions**: getHeaders (no longer needed)
- **Simplified Methods**: refreshFeeds now delegates to the store
- **Simplified Methods**: initializeRSSData now delegates to the store
- **Removed Constants**: CACHE_PREFIX (now in the store)

## Architecture

Both API stores follow a consistent pattern:

1. **State Management**: All reactive state is in the store
2. **API Logic**: All API calls and data processing happen in the store
3. **Cache Management**: Cache is handled transparently by the store
4. **UI Integration**: Views only interact with the store, not with the API directly

This allows:

- Easy testing of API logic independently
- Code reuse across multiple views
- Consistent error handling
- Centralized cache management

## Advantages

1. **Reusability**: Other components can use `useRSSApiStore()` to access the same logic
2. **Separation of Concerns**: API/cache logic is separated from UI logic
3. **Testability**: The store can be tested independently from the component
4. **Maintainability**: Changes to API logic are made in one place
5. **Scalability**: Established pattern for creating similar stores

## Pattern for Creating New API Stores

When creating a new API store, follow this pattern:

1. Create `src/stores/xxxApi.ts`
2. Export types needed by the view (e.g., `RSSCollectionItem`)
3. Define all state as `ref` inside the store function
4. Create methods for:
   - Loading data (with cache checking)
   - Refreshing data (force API call)
   - Cache management
5. Export computed properties for reactivity
6. In the view, import the store and use `computed(() => store.property)` to access state

## Next Steps

The same pattern can be used to create similar stores for:

- Tasks API (`useTasksApiStore`)
- Bookmarks API (`useBookmarksApiStore`)
- Graph API (`useGraphApiStore`)

## Compatibility

- Fully compatible with existing code
- No changes to UI or user behavior
- Cache functionality is identical to the previous implementation
