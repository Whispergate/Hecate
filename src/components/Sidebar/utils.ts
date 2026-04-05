/* hecate/src/components/Sidebar/utils.ts */

export function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3600_000)}h ago`
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
