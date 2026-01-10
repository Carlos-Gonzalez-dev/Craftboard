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
type RecurrenceInfo = {
  rrule?: string
  exdates?: Date[]
  rdates?: Date[]
  recurrenceId?: Date
  status?: string
}

type WorkingEvent = Partial<CalendarEvent> & RecurrenceInfo

export function parseICal(icalString: string): CalendarEvent[] {
  const lines = icalString.split(/\r?\n/)
  const workingEvents: WorkingEvent[] = []
  let currentEvent: WorkingEvent | null = null
  let currentKey = ''
  let currentValue = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || ''

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
      if (currentEvent && currentEvent.id && currentEvent.start && currentEvent.end) {
        // Store raw event to allow post-processing of overrides (RECURRENCE-ID)
        workingEvents.push(currentEvent)
      }
      currentEvent = null
      continue
    }

    // Parse key-value pairs
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      // Keep parameters (e.g., TZID, VALUE=DATE) in the key so we can parse correctly
      const key = line.substring(0, colonIndex)
      const value = line.substring(colonIndex + 1)
      currentKey = key
      currentValue = value
    }
  }

  // Process last property
  if (currentKey && currentValue && currentEvent) {
    processEventProperty(currentEvent, currentKey, currentValue)
  }

  return processWorkingEvents(workingEvents)
}

function processEventProperty(event: WorkingEvent | null, key: string, value: string): void {
  if (!event) return

  // Normalize the base property name (e.g., DTSTART from "DTSTART;TZID=Europe/Madrid")
  const baseKey = key.split(';')[0]
  const params = key.includes(';')
    ? key
        .split(';')
        .slice(1)
        .reduce<Record<string, string>>((acc, part) => {
          const [pKey, pVal] = part.split('=')
          if (pKey) acc[pKey.toUpperCase()] = pVal || ''
          return acc
        }, {})
    : {}

  switch (baseKey) {
    case 'UID':
      event.id = value
      break
    case 'SUMMARY':
      event.title = unescapeICalText(value)
      break
    case 'DTSTART': {
      const isDateOnly = 'VALUE' in params && params['VALUE'].toUpperCase() === 'DATE'
      const tzid = params['TZID']
      event.start = parseICalDate(value, { isDateOnly, timeZone: tzid })
      break
    }
    case 'DTEND': {
      const isDateOnly = 'VALUE' in params && params['VALUE'].toUpperCase() === 'DATE'
      const tzid = params['TZID']
      event.end = parseICalDate(value, { isDateOnly, timeZone: tzid })
      break
    }
    case 'RECURRENCE-ID': {
      const isDateOnly = 'VALUE' in params && params['VALUE'].toUpperCase() === 'DATE'
      const tzid = params['TZID']
      // Store the original occurrence datetime we are overriding
      event.recurrenceId = parseICalDate(value, { isDateOnly, timeZone: tzid })
      break
    }
    case 'DESCRIPTION':
      event.description = unescapeICalText(value)
      break
    case 'LOCATION':
      event.location = unescapeICalText(value)
      break
    case 'RRULE':
      event.rrule = value
      break
    case 'STATUS':
      event.status = value
      break
    case 'EXDATE': {
      const isDateOnly = 'VALUE' in params && params['VALUE'].toUpperCase() === 'DATE'
      const tzid = params['TZID']
      const values = value.split(',')
      const dates = values.map((v) => parseICalDate(v, { isDateOnly, timeZone: tzid }))
      event.exdates = (event.exdates || []).concat(dates)
      break
    }
    case 'RDATE': {
      const isDateOnly = 'VALUE' in params && params['VALUE'].toUpperCase() === 'DATE'
      const tzid = params['TZID']
      const values = value.split(',')
      const dates = values.map((v) => parseICalDate(v, { isDateOnly, timeZone: tzid }))
      event.rdates = (event.rdates || []).concat(dates)
      break
    }
  }
}
// Post-process raw events: expand masters and apply overrides (RECURRENCE-ID)
function processWorkingEvents(items: WorkingEvent[]): CalendarEvent[] {
  // Group by UID
  const groups = new Map<string, WorkingEvent[]>()
  for (const it of items) {
    if (!it.id) continue
    const arr = groups.get(it.id) || []
    arr.push(it)
    groups.set(it.id, arr)
  }

  const result: CalendarEvent[] = []
  for (const [, arr] of groups) {
    const masters = arr.filter((e) => !!e.rrule || (!e.recurrenceId && !!e.start && !!e.end))
    // Choose a master (the one with RRULE if present, otherwise the earliest start)
    let master = masters.find((e) => !!e.rrule) || null
    if (!master) {
      if (masters.length > 0) {
        master = masters.sort((a, b) => a.start!.getTime() - b.start!.getTime())[0]!
      } else {
        master = null
      }
    }
    if (!master) {
      // No usable master; push standalone events
      for (const e of arr) {
        if (e.start && e.end) {
          result.push({
            id: `${e.id}-${e.start.toISOString().replace(/[:.-]/g, '')}`,
            title: e.title || '',
            start: e.start,
            end: e.end,
            description: e.description,
            location: e.location,
          })
        }
      }
      continue
    }

    // Expand master occurrences in window
    let occs = expandEventIfRecurring(master)

    // Apply overrides: entries with RECURRENCE-ID override a specific occurrence
    const overrides = arr.filter((e) => e.recurrenceId instanceof Date)
    for (const ov of overrides) {
      const rid: Date = ov.recurrenceId as Date
      // Remove occurrence matching RECURRENCE-ID (exact time or same local date)
      occs = occs.filter((ev) => !(sameDateTime(ev.start, rid) || sameLocalDate(ev.start, rid)))
      // Add override instance if it has start/end
      if (ov.status?.toUpperCase() === 'CANCELLED') {
        // Do not add a new instance for cancelled overrides
        continue
      }
      if (ov.start && ov.end) {
        const durationMs = ov.end.getTime() - ov.start.getTime()
        const inst: CalendarEvent = {
          id: `${master.id}-${ov.start.toISOString().replace(/[:.-]/g, '')}`,
          title: ov.title || master.title || '',
          start: ov.start,
          end: new Date(ov.start.getTime() + durationMs),
          description: ov.description ?? master.description,
          location: ov.location ?? master.location,
        }
        occs.push(inst)
      }
    }

    // Sort and add to result
    occs.sort((a, b) => a.start.getTime() - b.start.getTime())
    result.push(...occs)
  }

  return result
}

/**
 * Parse iCal date formats:
 * - All-day: YYYYMMDD (treated as local date)
 * - Date-time: YYYYMMDDTHHMMSS[Z|+HHMM|-HHMM] (UTC or with offset)
 * - Floating/local date-time (no suffix, may have TZID param): treated as local time
 */
function parseICalDate(
  dateString: string,
  options?: { isDateOnly?: boolean; timeZone?: string | undefined },
): Date {
  const isDateOnly = options?.isDateOnly === true || /^[0-9]{8}$/.test(dateString)

  // All-day events: keep as local midnight to avoid day shift
  if (isDateOnly) {
    const y = parseInt(dateString.substring(0, 4), 10)
    const m = parseInt(dateString.substring(4, 6), 10) - 1
    const d = parseInt(dateString.substring(6, 8), 10)
    return new Date(y, m, d)
  }

  // Date-time components
  const y = parseInt(dateString.substring(0, 4), 10)
  const m = parseInt(dateString.substring(4, 6), 10) - 1
  const d = parseInt(dateString.substring(6, 8), 10)
  const hh = parseInt(dateString.substring(9, 11), 10) || 0
  const mm = parseInt(dateString.substring(11, 13), 10) || 0
  const ss = parseInt(dateString.substring(13, 15), 10) || 0

  // Timezone handling
  const tzSuffix = dateString.substring(15)
  if (tzSuffix.startsWith('Z')) {
    // Explicit UTC
    return new Date(Date.UTC(y, m, d, hh, mm, ss))
  }

  const offsetMatch = tzSuffix.match(/^([+-])(\d{2})(\d{2})$/)
  if (offsetMatch) {
    const [, signRaw, hhStr, mmStr] = offsetMatch
    const sign = signRaw === '+' ? 1 : -1
    const offH = parseInt(hhStr ?? '00', 10)
    const offM = parseInt(mmStr ?? '00', 10)
    const offsetMs = sign * (offH * 60 + offM) * 60 * 1000
    const utcMs = Date.UTC(y, m, d, hh, mm, ss) - offsetMs
    return new Date(utcMs)
  }

  // If a TZID is specified in params, we treat the value as local time in that zone.
  // Without a timezone conversion library, best-effort is to treat as local time.
  // This avoids incorrect day/hour shifts from assuming UTC.
  if (options?.timeZone) {
    return new Date(y, m, d, hh, mm, ss)
  }

  // Floating time (no Z or offset): treat as local
  return new Date(y, m, d, hh, mm, ss)
}

/**
 * Unescape iCal text (handle escaped commas, semicolons, newlines)
 */
function unescapeICalText(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
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

// ---- Recurrence handling ----

type RRule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byday?: string[]
  bymonthday?: number[]
  bymonth?: number[]
  count?: number
  until?: Date
}

function parseRRule(rruleStr: string): RRule | null {
  const parts = rruleStr.split(';')
  const map = new Map<string, string>()
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k && v) map.set(k.toUpperCase(), v)
  }
  const freq = map.get('FREQ') as RRule['freq'] | undefined
  if (!freq) return null
  const interval = parseInt(map.get('INTERVAL') || '1', 10)
  const byday = map.get('BYDAY')?.split(',')
  const bymonthday = map
    .get('BYMONTHDAY')
    ?.split(',')
    .map((n) => parseInt(n, 10))
  const bymonth = map
    .get('BYMONTH')
    ?.split(',')
    .map((n) => parseInt(n, 10))
  const count = map.get('COUNT') ? parseInt(map.get('COUNT')!, 10) : undefined
  const untilStr = map.get('UNTIL')
  const until = untilStr ? parseICalDate(untilStr) : undefined
  return { freq, interval, byday, bymonthday, bymonth, count, until }
}

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function sameDateTime(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes() &&
    a.getSeconds() === b.getSeconds()
  )
}

function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function expandEventIfRecurring(ev: WorkingEvent): CalendarEvent[] {
  const base: CalendarEvent = {
    id: ev.id!,
    title: ev.title!,
    start: ev.start!,
    end: ev.end!,
    description: ev.description,
    location: ev.location,
  }

  const durationMs = base.end.getTime() - base.start.getTime()
  const rrule = ev.rrule ? parseRRule(ev.rrule) : null
  const exdates = ev.exdates || []
  const rdates = ev.rdates || []

  // Window: past 14 days to next 365 days
  const now = new Date()
  const windowStart = addDays(now, -14)
  const windowEnd = addDays(now, 365)

  // Helper to create event instance
  const makeInstance = (start: Date): CalendarEvent => ({
    ...base,
    id: `${base.id}-${start.toISOString().replace(/[:.-]/g, '')}`,
    start,
    end: new Date(start.getTime() + durationMs),
  })

  // Collect occurrences
  const out: CalendarEvent[] = []

  // Include base event if within window
  if (
    base.start >= windowStart &&
    base.start <= windowEnd &&
    !exdates.some((ex) => sameDateTime(ex, base.start))
  ) {
    out.push(makeInstance(base.start))
  }

  // Include RDATE additional dates
  for (const rd of rdates) {
    if (rd >= windowStart && rd <= windowEnd && !exdates.some((ex) => sameDateTime(ex, rd))) {
      out.push(makeInstance(rd))
    }
  }

  if (!rrule) {
    return out
  }

  // Determine upper bound
  const hardEnd = rrule.until && rrule.until < windowEnd ? rrule.until : windowEnd
  let generated = 0

  switch (rrule.freq) {
    case 'DAILY': {
      let cur = addDays(base.start, rrule.interval)
      while (cur <= hardEnd && (!rrule.count || generated < rrule.count - 1)) {
        if (cur >= windowStart && !exdates.some((ex) => sameDateTime(ex, cur))) {
          out.push(makeInstance(cur))
        }
        cur = addDays(cur, rrule.interval)
        generated++
      }
      break
    }
    case 'WEEKLY': {
      const bydays =
        rrule.byday && rrule.byday.length > 0
          ? rrule.byday
          : [Object.entries(WEEKDAY_MAP).find(([, n]) => n === base.start.getDay())![0]]

      // Start from beginning of the week of base.start
      const startWeek = addDays(base.start, -((base.start.getDay() + 7 - 1) % 7)) // shift to Monday
      let curWeekStart = addDays(startWeek, rrule.interval * 7)

      while (curWeekStart <= hardEnd && (!rrule.count || generated < rrule.count - 1)) {
        for (const dayStr of bydays) {
          const weekday = WEEKDAY_MAP[dayStr]
          if (weekday === undefined) continue
          // Map Sunday=0..Saturday=6 to Monday-based index 0..6
          const mondayBasedOffset = (weekday + 6) % 7
          const occStart = addDays(curWeekStart, mondayBasedOffset)
          // Align time to base start time
          occStart.setHours(
            base.start.getHours(),
            base.start.getMinutes(),
            base.start.getSeconds(),
            0,
          )
          if (
            occStart >= windowStart &&
            occStart <= hardEnd &&
            !exdates.some((ex) => sameDateTime(ex, occStart))
          ) {
            out.push(makeInstance(occStart))
            generated++
            if (rrule.count && generated >= rrule.count - 1) break
          }
        }
        curWeekStart = addDays(curWeekStart, rrule.interval * 7)
      }
      break
    }
    case 'MONTHLY': {
      const bymonthdays =
        rrule.bymonthday && rrule.bymonthday.length > 0 ? rrule.bymonthday : [base.start.getDate()]
      let cur = new Date(base.start.getTime())
      cur = new Date(
        cur.getFullYear(),
        cur.getMonth() + rrule.interval,
        cur.getDate(),
        base.start.getHours(),
        base.start.getMinutes(),
        base.start.getSeconds(),
        0,
      )
      while (cur <= hardEnd && (!rrule.count || generated < rrule.count - 1)) {
        for (const monthDay of bymonthdays) {
          const occStart = new Date(
            cur.getFullYear(),
            cur.getMonth(),
            monthDay,
            base.start.getHours(),
            base.start.getMinutes(),
            base.start.getSeconds(),
            0,
          )
          if (
            occStart >= windowStart &&
            occStart <= hardEnd &&
            !exdates.some((ex) => sameDateTime(ex, occStart))
          ) {
            out.push(makeInstance(occStart))
            generated++
            if (rrule.count && generated >= rrule.count - 1) break
          }
        }
        cur = new Date(
          cur.getFullYear(),
          cur.getMonth() + rrule.interval,
          cur.getDate(),
          base.start.getHours(),
          base.start.getMinutes(),
          base.start.getSeconds(),
          0,
        )
      }
      break
    }
    case 'YEARLY': {
      let cur = new Date(base.start.getTime())
      cur = new Date(
        cur.getFullYear() + rrule.interval,
        cur.getMonth(),
        cur.getDate(),
        base.start.getHours(),
        base.start.getMinutes(),
        base.start.getSeconds(),
        0,
      )
      while (cur <= hardEnd && (!rrule.count || generated < rrule.count - 1)) {
        const occStart = new Date(
          cur.getFullYear(),
          cur.getMonth(),
          cur.getDate(),
          base.start.getHours(),
          base.start.getMinutes(),
          base.start.getSeconds(),
          0,
        )
        if (
          occStart >= windowStart &&
          occStart <= hardEnd &&
          !exdates.some((ex) => sameDateTime(ex, occStart))
        ) {
          out.push(makeInstance(occStart))
          generated++
        }
        cur = new Date(
          cur.getFullYear() + rrule.interval,
          cur.getMonth(),
          cur.getDate(),
          base.start.getHours(),
          base.start.getMinutes(),
          base.start.getSeconds(),
          0,
        )
      }
      break
    }
  }

  // Sort occurrences by start
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}
