/* hecate/src/components/Sidebar/utils.ts */

// Mythic stores timestamps as UTC but Hasura returns them without a 'Z' suffix.
// new Date("2024-01-15T14:23:01") is parsed as LOCAL time by JS engines,
// making every timestamp appear offset by your UTC offset.
// Force UTC by appending 'Z' only when no timezone designator is present.
export function parseTs(iso: string): Date {
  if (!iso) return new Date(0)
  return new Date(/[Z+]/.test(iso) ? iso : iso + 'Z')
}

// Mythic uses last_checkin = "1970-01-01T00:00:00" as a sentinel for
// streaming/interactive callbacks (its own UI shows "Streaming Now").
export function timeSince(iso: string): string {
  if (!iso || iso.startsWith('1970-01-01')) return 'streaming'
  const diff = Date.now() - parseTs(iso).getTime()
  if (diff < 0)          return 'just now'
  if (diff < 60_000)     return `${Math.floor(diff / 1_000)}s ago`
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// Priority: sleep_info > last completed sleep task params > payload C2 config

export type C2ParamInstance  = { value: string; c2profileparameter: { name: string } }
export type SleepTaskRecord  = { params: string; timestamp: string }

function parseSleepParts(
  raw: string,
  lastSleepTask?: SleepTaskRecord,
  fallbackParams?: C2ParamInstance[],
): { interval: string; jitter: string } {
  const empty = { interval: '—', jitter: '—' }

  // 1. sleep_info set by agent (Apollo JSON or plain text)
  if (raw && raw.trim() !== '') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, { interval?: number; jitter?: number }>
        const first = Object.values(obj)[0]
        if (first && first.interval !== undefined) {
          return {
            interval: `${first.interval}s`,
            jitter:   first.jitter !== undefined && first.jitter >= 0 ? `${first.jitter}%` : '—',
          }
        }
      } catch { /* fall through */ }
    } else {
      const parts = trimmed.split(/\s+/)
      const interval = /^\d+$/.test(parts[0]) ? `${parts[0]}s` : parts[0]
      const jitterNum = parts[1] !== undefined ? parseFloat(parts[1]) : NaN
      return { interval, jitter: isNaN(jitterNum) ? '—' : `${jitterNum}%` }
    }
  }

  // 2. Most recent completed sleep task (e.g. Apollo: {"interval":30,"jitter":10})
  if (lastSleepTask) {
    try {
      const p = JSON.parse(lastSleepTask.params) as { interval?: number; jitter?: number }
      if (p.interval !== undefined) {
        return {
          interval: `${p.interval}s`,
          jitter:   p.jitter !== undefined && p.jitter >= 0 ? `${p.jitter}%` : '—',
        }
      }
    } catch { /* fall through */ }
  }

  // 3. Payload build-time C2 profile defaults
  if (fallbackParams && fallbackParams.length > 0) {
    const find = (name: string) =>
      fallbackParams.find(p => p.c2profileparameter.name === name)?.value
    const iv = find('callback_interval')
    const jt = find('callback_jitter')
    return {
      interval: iv !== undefined ? `${iv}s` : '—',
      jitter:   jt !== undefined ? `${jt}%` : '—',
    }
  }

  return empty
}

export function formatSleepInterval(
  raw: string,
  lastSleepTask?: SleepTaskRecord,
  fallback?: C2ParamInstance[],
): string { return parseSleepParts(raw, lastSleepTask, fallback).interval }

export function formatSleepJitter(
  raw: string,
  lastSleepTask?: SleepTaskRecord,
  fallback?: C2ParamInstance[],
): string { return parseSleepParts(raw, lastSleepTask, fallback).jitter }

// Numeric counterpart of parseSleepParts — resolves the sleep interval to
// seconds (converting h/m/s suffixes) and jitter to a percentage. Same source
// priority: sleep_info > last completed sleep task > payload C2 config.
// 0 means unknown / continuous check-in.
export function parseSleepNumbers(
  raw: string,
  lastSleepTask?: SleepTaskRecord,
  fallback?: C2ParamInstance[],
): { intervalSec: number; jitterPct: number } {
  // 1. sleep_info set by agent (Apollo JSON or plain text)
  if (raw && raw.trim() !== '') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const obj   = JSON.parse(trimmed) as Record<string, { interval?: number; jitter?: number }>
        const first = Object.values(obj)[0]
        if (first && first.interval !== undefined) {
          return {
            intervalSec: first.interval,
            jitterPct:   first.jitter !== undefined && first.jitter >= 0 ? first.jitter : 0,
          }
        }
      } catch { /* fall through */ }
    } else {
      const parts = trimmed.toLowerCase().split(/\s+/)
      const token = parts[0]
      let iv = NaN
      if      (token.endsWith('h')) iv = parseFloat(token) * 3600
      else if (token.endsWith('m')) iv = parseFloat(token) * 60
      else if (token.endsWith('s')) iv = parseFloat(token)
      else                          iv = parseFloat(token)
      if (!isNaN(iv)) {
        const jt = parts[1] !== undefined ? parseFloat(parts[1]) : NaN
        return { intervalSec: iv, jitterPct: isNaN(jt) ? 0 : jt }
      }
    }
  }

  // 2. Most recent completed sleep task
  if (lastSleepTask) {
    try {
      const p = JSON.parse(lastSleepTask.params) as { interval?: number; jitter?: number }
      if (p.interval !== undefined) {
        return {
          intervalSec: p.interval,
          jitterPct:   p.jitter !== undefined && p.jitter >= 0 ? p.jitter : 0,
        }
      }
    } catch { /* fall through */ }
  }

  // 3. Payload build-time C2 profile defaults
  if (fallback && fallback.length > 0) {
    const find = (name: string) =>
      fallback.find(p => p.c2profileparameter.name === name)?.value
    const iv = find('callback_interval')
    const jt = find('callback_jitter')
    return {
      intervalSec: iv !== undefined ? (parseFloat(iv) || 0) : 0,
      jitterPct:   jt !== undefined ? (parseFloat(jt) || 0) : 0,
    }
  }

  return { intervalSec: 0, jitterPct: 0 }
}

export function integrityLabel(level: number): string {
  switch (level) {
    case 0: return 'Untrusted'
    case 1: return 'Low'
    case 2: return 'Medium'
    case 3: return 'High'
    case 4: return 'System'
    default: return String(level)
  }
}
