/* hecate/src/components/Sidebar/utils.ts */

// Mythic stores timestamps as UTC but Hasura returns them without a 'Z' suffix.
// new Date("2024-01-15T14:23:01") is parsed as LOCAL time by JS engines,
// making every timestamp appear offset by your UTC offset.
// Force UTC by appending 'Z' only when no timezone designator is present.
export function parseTs(iso: string): Date {
  if (!iso) return new Date(0)
  return new Date(/[Z+]/.test(iso) ? iso : iso + 'Z')
}

export function timeSince(iso: string): string {
  const diff = Date.now() - parseTs(iso).getTime()
  if (diff < 0)         return 'just now'
  if (diff < 60_000)    return `${Math.floor(diff / 1_000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
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
