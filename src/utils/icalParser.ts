export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
}

/**
 * Parse iCal format string and extract events
 */
export function parseICal(icalString: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const lines = icalString.split(/\r?\n/)
  let currentEvent: Partial<CalendarEvent> | null = null
  let currentKey = ''
  let currentValue = ''

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Handle line continuation (lines starting with space or tab)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentKey) {
        currentValue += line.trim()
      }
      continue
    }

    // Process previous line's value
    if (currentKey && currentValue) {
      processEventProperty(currentEvent, currentKey, currentValue)
      currentKey = ''
      currentValue = ''
    }

    // Skip empty lines
    if (!line.trim()) continue

    // Check for BEGIN:VEVENT
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {}
      continue
    }

    // Check for END:VEVENT
    if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.id && currentEvent.title && currentEvent.start && currentEvent.end) {
        events.push({
          id: currentEvent.id,
          title: currentEvent.title,
          start: currentEvent.start,
          end: currentEvent.end,
          description: currentEvent.description,
          location: currentEvent.location,
        })
      }
      currentEvent = null
      continue
    }

    // Parse key-value pairs
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).split(';')[0] // Remove parameters
      const value = line.substring(colonIndex + 1)
      currentKey = key
      currentValue = value
    }
  }

  // Process last property
  if (currentKey && currentValue && currentEvent) {
    processEventProperty(currentEvent, currentKey, currentValue)
  }

  return events
}

function processEventProperty(
  event: Partial<CalendarEvent> | null,
  key: string,
  value: string,
): void {
  if (!event) return

  switch (key) {
    case 'UID':
      event.id = value
      break
    case 'SUMMARY':
      event.title = unescapeICalText(value)
      break
    case 'DTSTART':
    case 'DTSTART;VALUE=DATE':
      event.start = parseICalDate(value)
      break
    case 'DTEND':
    case 'DTEND;VALUE=DATE':
      event.end = parseICalDate(value)
      break
    case 'DESCRIPTION':
      event.description = unescapeICalText(value)
      break
    case 'LOCATION':
      event.location = unescapeICalText(value)
      break
  }
}

/**
 * Parse iCal date format (YYYYMMDDTHHMMSS or YYYYMMDD)
 */
function parseICalDate(dateString: string): Date {
  // Remove timezone info if present
  const cleanDate = dateString.replace(/[Z+-].*$/, '')
  
  // Check if it's a date-only format (YYYYMMDD)
  if (cleanDate.length === 8) {
    const year = parseInt(cleanDate.substring(0, 4), 10)
    const month = parseInt(cleanDate.substring(4, 6), 10) - 1 // Month is 0-indexed
    const day = parseInt(cleanDate.substring(6, 8), 10)
    return new Date(Date.UTC(year, month, day))
  }

  // Parse datetime format (YYYYMMDDTHHMMSS)
  if (cleanDate.length >= 15) {
    const year = parseInt(cleanDate.substring(0, 4), 10)
    const month = parseInt(cleanDate.substring(4, 6), 10) - 1
    const day = parseInt(cleanDate.substring(6, 8), 10)
    const hour = parseInt(cleanDate.substring(9, 11), 10) || 0
    const minute = parseInt(cleanDate.substring(11, 13), 10) || 0
    const second = parseInt(cleanDate.substring(13, 15), 10) || 0
    return new Date(Date.UTC(year, month, day, hour, minute, second))
  }

  // Fallback to Date parsing
  return new Date(dateString)
}

/**
 * Unescape iCal text (handle escaped commas, semicolons, newlines)
 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/**
 * Fetch and parse calendar events from an iCal URL
 */
export async function fetchCalendarEvents(url: string): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.statusText}`)
    }
    const icalString = await response.text()
    return parseICal(icalString)
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    throw error
  }
}

