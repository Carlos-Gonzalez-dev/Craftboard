# API Stores Architecture

## Overview

The application uses Pinia stores to manage all API interactions and caching logic. This provides a centralized, testable, and reusable way to handle API calls across multiple views.

## Existing Stores

### 1. Tags API Store (`useTagsApiStore`)

**Location**: `src/stores/tagsApi.ts`

Manages:

- Search for documents containing specific tags
- Extract tags from markdown content
- Cache management for tag-based queries
- Progress tracking for multiple API calls

**Key Methods**:

- `loadLogs(tags: string[], forceRefresh?: boolean)`: Load entries for given tags
- `refreshLogs(tags: string[])`: Force refresh from API
- `clearCache(tags: string[])`: Clear cache for specific tags
- `extractMatchingTags(markdown: string, pattern?: string)`: Parse tags from markdown

**Used by**: `TagsView.vue`

### 2. RSS API Store (`useRSSApiStore`)

**Location**: `src/stores/rssApi.ts`

Manages:

- Fetch RSS collection items from Craft
- Fetch and parse individual RSS feeds
- Cache management for RSS data
- Track loading state for individual feeds

**Key Methods**:

- `initializeRSS(collectionId: string, forceRefresh?: boolean)`: Initialize RSS collection
- `refreshRSS(collectionId: string)`: Force refresh from API
- `refreshFeed(item: RSSCollectionItem)`: Refresh a single feed
- `clearCache(collectionId: string)`: Clear cache for specific collection

**Used by**: `RSSView.vue`

## Store Pattern

All API stores follow the same pattern:

```typescript
export const useXxxApiStore = defineStore('xxxApi', () => {
  // 1. State (as refs)
  const data = ref<DataType[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 2. Cache configuration
  const CACHE_PREFIX = 'xxx-cache-'

  // 3. Cache methods
  const getCacheKey = (id: string): string => {}
  const getCachedData = (id: string): DataType[] | null => {}
  const setCachedData = (id: string, data: DataType[]): void => {}
  const clearCache = (id: string): void => {}

  // 4. API methods
  const fetchData = async (id: string): Promise<DataType[]> => {}
  const processData = (rawData: any[]): DataType[] => {}

  // 5. Initialize/Refresh methods
  const initialize = async (id: string, forceRefresh = false): Promise<void> => {}
  const refresh = async (id: string): Promise<void> => {}

  // 6. Return reactive properties and methods
  return {
    data: computed(() => data.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    // ... methods
  }
})
```

## Cache Strategy

Each store implements a transparent cache layer:

1. **Check Cache**: When loading, first check if valid cached data exists
2. **Return Cache**: If valid (not expired), return cached data immediately
3. **Fetch API**: If cache miss or expired, fetch from API
4. **Save Cache**: Store API response in cache with timestamp
5. **Expiry**: Cache expiry is configured globally via `getCacheExpiryMs()`

Cache keys are generated based on context:

- **Tags**: Hash of selected tags (e.g., `tags-cache-tag1-tag2`)
- **RSS**: Collection ID (e.g., `rss-cache-abc123`)

## Usage in Views

### Basic Usage

```typescript
import { useXxxApiStore } from '@/stores/xxxApi'
import { computed } from 'vue'

export default {
  setup() {
    const xxxStore = useXxxApiStore()

    // Access state as computed properties
    const data = computed(() => xxxStore.data)
    const isLoading = computed(() => xxxStore.isLoading)

    // Call methods
    const loadData = async () => {
      await xxxStore.initialize(id)
    }

    return { data, isLoading, loadData }
  },
}
```

### With Refresh Function

```typescript
onMounted(() => {
  xxxStore.initialize(id)

  // Register refresh for UI
  registerRefresh?.('view-name', () => xxxStore.refresh(id))
})
```

## Error Handling

All stores provide:

- `error` computed property with error messages
- Try/catch blocks in all async methods
- User-friendly error messages in `error` property

Views should display error state:

```vue
<div v-if="store.error" class="error">{{ store.error }}</div>
```

## Progress Tracking

Some stores track API progress:

- `totalApiCalls`: Total number of API calls needed
- `completedApiCalls`: Number of completed calls

This is used by `ProgressIndicator` component to show loading progress.

## Future Stores

Follow the same pattern to create:

### Tasks API Store

- Fetch tasks from collection
- Cache task data
- Track task progress

### Bookmarks API Store

- Fetch bookmarks from collection
- Cache bookmark data
- Search bookmarks

### Graph API Store

- Fetch graph data
- Cache relationships
- Process node data

## Best Practices

1. **Always Use Computed**: In views, always wrap store properties in `computed()`
2. **Delegate to Store**: Never duplicate API logic in views
3. **Cache Transparently**: Stores handle caching; views don't need to know about it
4. **Error Handling**: Always check the `error` property after async operations
5. **Loading States**: Use `isLoading` to show progress indicators
6. **Reactive Updates**: Always return computed properties from stores for reactivity

## Testing

Stores are designed to be easily testable:

```typescript
import { createPinia } from 'pinia'
import { useXxxApiStore } from '@/stores/xxxApi'

describe('Xxx API Store', () => {
  let store

  beforeEach(() => {
    const pinia = createPinia()
    store = useXxxApiStore(pinia)
  })

  it('loads data', async () => {
    await store.initialize('test-id')
    expect(store.data.length).toBeGreaterThan(0)
  })
})
```

## Performance Considerations

1. **Lazy Loading**: Data is only loaded when explicitly requested
2. **Background Fetching**: Some stores fetch in background after cache hit
3. **Cache Expiry**: Configurable cache expiry prevents stale data
4. **Request Deduplication**: Some stores prevent duplicate simultaneous requests
5. **Partial Updates**: Some stores can update individual items without full reload
