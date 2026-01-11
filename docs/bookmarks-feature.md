# Bookmarks Feature

The Bookmarks feature allows you to organize and access your favorite links directly from Craftboard, with support for categorization, projects, environments, and tags.

## Data Model

### BookmarkItem Interface

```typescript
interface BookmarkItem {
  id: string
  title: string
  url: string
  category: string
  tags?: string[]
  env?: 'dev' | 'staging' | 'prod'
}
```

## Craft Document Setup

### Required Properties

To create bookmarks in Craft, add a Collection document with the following properties:

1. **URL** (required) - The link destination
2. **Category** (required) - Used for grouping bookmarks
3. **Title** (optional) - Displayed name (uses document title if empty)
4. **Tags** (optional) - Array of tags for filtering
5. **env** (optional) - Environment identifier: `dev`, `staging`, or `prod`

### Property Extraction

The store automatically extracts properties from Craft documents:

```typescript
// Case-insensitive property matching
url: properties.URL || properties.url
category: properties.Category || properties.category
tags: properties.Tags || properties.tags
env: properties.env || properties.Env
```

Environment values are validated - only `dev`, `staging`, or `prod` are accepted. Invalid values default to `undefined`.

## Projects Organization

### Project Categories

Categories that start with `Project:` are treated as projects and receive special treatment:

- **Visual Distinction**: Display a folder icon (📁) instead of the "Project:" prefix
- **Priority Sorting**: Projects appear first in the category tabs
- **Separator**: A visual divider separates projects from regular categories

Example categories:

- `Project: Cliente A` → Displays as "📁 Cliente A"
- `Project: Internal` → Displays as "📁 Internal"
- `APIs` → Regular category
- `Documentation` → Regular category

### Sorting Logic

```typescript
// Projects first, then alphabetically
categories.sort((a, b) => {
  const aIsProject = a.startsWith('Project:')
  const bIsProject = b.startsWith('Project:')

  if (aIsProject && !bIsProject) return -1
  if (!aIsProject && bIsProject) return 1
  return a.localeCompare(b)
})
```

## Environment Field

### Purpose

The `env` field distinguishes between different deployment environments of the same service (e.g., dev API, staging API, prod API).

### Supported Values

- `dev` - Development environment (blue)
- `staging` - Staging environment (orange)
- `prod` - Production environment (green)

### Visual Indicators

**Color Scheme:**

- Dev: `#3b82f6` (blue)
- Staging: `#f59e0b` (orange)
- Prod: `#22c55e` (green)

**Bookmark Cards:**

- 3px colored left border
- Small badge with environment name
- Card hover effects with environment color

**Widget Display:**

- Same colored borders and badges in BookmarkWidget
- Responsive layout adapts to widget width

### Environment Grouping

When a category contains bookmarks with the `env` field, they are automatically grouped by environment:

**Column Layout:**

- Each environment gets its own column
- Columns displayed side by side for easy comparison
- Background color matches environment
- "Other" group for bookmarks without `env`

**Groups:**

1. **Development** - Dev environment bookmarks (blue background)
2. **Staging** - Staging environment bookmarks (orange background)
3. **Production** - Production environment bookmarks (green background)
4. **Other** - Bookmarks without env field (neutral background)

### Environment Filtering

When the env filter is active:

- Bookmarks displayed in a standard grid
- Only selected environment shown
- Filter buttons: All / Dev / Staging / Prod

When "All" is selected and category has env bookmarks:

- Automatic grouping by environment in columns
- All environments visible simultaneously

## Tags System

### Tag Filtering

- Multiple tags can be selected
- **AND logic**: Bookmarks must have ALL selected tags
- Color-coded tags for visual distinction
- Tag hue mapping ensures consistent colors

### Tag Colors

Tags use a hue-based color system:

```typescript
// Light theme
background: hsl(var(--tag-hue), 70%, 95%)
border: hsl(var(--tag-hue), 60%, 75%)
color: hsl(var(--tag-hue), 70%, 35%)

// Dark theme
background: hsl(var(--tag-hue), 60%, 20%)
border: hsl(var(--tag-hue), 50%, 35%)
color: hsl(var(--tag-hue), 70%, 75%)
```

## Search Functionality

The search feature filters bookmarks by:

- Bookmark title
- Full URL
- Domain name

Search is case-insensitive and updates results in real-time.

## UI Features

### Category Tabs

- Projects displayed first with folder icon
- Visual separator between projects and categories
- Active tab highlighted with gradient background
- Keep-alive state preservation on navigation

### Bookmark Cards

- Favicon display with fallback handling
- Title and domain
- Environment badge (if applicable)
- Colored left border (if env is set)
- Tag chips with color coding
- External link icon on hover
- Smooth hover animations

### Responsive Design

**Desktop:**

- Multi-column grid for bookmarks
- Environment groups side-by-side

**Mobile:**

- Single column layout
- Stacked environment groups
- Optimized touch targets

### BookmarkWidget

The dashboard widget includes:

- Bookmark selection from dropdown
- Environment badges in list and display
- Colored borders matching environment
- Responsive layout adapts to widget size
- Container queries for narrow widgets

**Responsive Breakpoints:**

- Width < 300px: Vertical layout, smaller favicon, wrapped title
- Width ≥ 300px: Horizontal layout, full-size elements

## State Management

### Pinia Store: `useBookmarksApiStore`

**State:**

```typescript
bookmarks: BookmarkItem[]
isLoading: boolean
error: string | null
totalApiCalls: number
completedApiCalls: number
```

**Actions:**

- `fetchBookmarks(documentId, collectionId)` - Load bookmarks from Craft API
- `refreshCache()` - Clear cache and reload

**Cache:**

- Uses `useApiCache` composable
- Key: `bookmarks-cache-{documentId}-{collectionId}`
- TTL: Configurable in settings

### View State

**Preserved via keep-alive:**

- Selected category
- Search query
- Selected tags
- Environment filter

**URL Query Parameters:**

- `category` - Selected category ID

## Example Use Cases

### 1. Project-Based Organization

```
Project: Cliente A
├─ Dev: https://dev.cliente-a.com
├─ Staging: https://staging.cliente-a.com
└─ Prod: https://cliente-a.com

Project: Internal
├─ Dev: https://dev.internal.com
├─ Staging: https://staging.internal.com
└─ Prod: https://internal.com
```

### 2. Service Catalogs

```
APIs
├─ Auth Service (dev, staging, prod)
├─ Payment Gateway (dev, staging, prod)
└─ Analytics API (dev, staging, prod)
```

### 3. Documentation

```
Documentation
├─ API Reference (tag: backend)
├─ User Guide (tag: frontend)
└─ Architecture (tag: backend, infrastructure)
```

## Best Practices

1. **Use Projects for client work**: Prefix with `Project:` for automatic grouping
2. **Consistent naming**: Use standard env values (dev/staging/prod)
3. **Tag strategically**: Use tags for cross-category organization
4. **Descriptive titles**: Clear names improve searchability
5. **Environment consistency**: Use env field for services with multiple deployments

## Migration Notes

The env field is fully optional and backward compatible:

- Existing bookmarks without env continue to work normally
- Environment grouping only activates when env field is present
- No data migration required

## Configuration

### Settings Required

In Craftboard settings:

1. **API URL** - Your Craft API endpoint
2. **Document ID** - Main document containing collections
3. **Bookmarks Collection ID** - ID of the bookmarks collection
4. **Space ID** - Craft space identifier
5. **Share Token** - API authentication token

### Refresh Strategy

- Manual refresh via button
- Cache invalidation on refresh
- Progress indicator during load
- Error state with settings link
