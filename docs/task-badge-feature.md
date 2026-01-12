# Task Badge & Title Feature

This feature displays the number of pending tasks for today in three places:

## 1. Browser Tab Title
The browser tab title will show the number of pending tasks in parentheses.

**Examples:**
- No tasks: `Craftboard`
- 3 tasks: `(3) Craftboard`
- 1 task: `(1) Craftboard`

## 2. Navigation Menu Badge
The Tasks item in the navigation bar shows a red badge with the number of active tasks.

## 3. App Badge (PWA on Mobile)
If you install Craftboard as a web app on your mobile device (Android, iOS, etc.), a badge (number) will appear on the app icon.

**How to see this:**
1. Open Craftboard in Chrome/Edge/Safari mobile
2. Press the menu ⋮ and select "Install app" (or "Add to Home Screen" on iOS)
3. The number of pending tasks will appear over the app icon

## Counted Tasks
Tasks are counted if they meet all of the following:
- ✅ Status is "todo" (not completed or canceled)
- ✅ They have a scheduled date (`scheduleDate`)
- ✅ The date is today or earlier (including overdue tasks)

## Implementation
The `useBadgeAndTitle()` composable is initialized in `App.vue` and:
- Automatically updates the document title
- Uses the [Badge API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API) to display the badge in PWA
- Reactively updates whenever tasks change

## Browser Support
- **Tab title**: Compatible with all browsers
- **Badge API**: Compatible with Chrome, Edge, Opera, and some mobile browsers (Android and iOS)
  - If not available, only the tab title works
  - The app does not show errors, it simply ignores it silently
