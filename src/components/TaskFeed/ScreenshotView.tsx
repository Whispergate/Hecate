/* src/components/TaskFeed/ScreenshotView.tsx
   Renders Apollo `screenshot` output as inline images. Each response chunk is
   {"file_id": "<agent_file_id>"}; images are fetched via /direct/download/<id>
   (Hecate nginx proxies /direct/ → mythic_nginx). Mirrors screenshot.js
   browser script ({media:[{agent_file_id, filename}]}).
*/

import { useState } from 'react'
import styles from './ScreenshotView.module.css'

// ── Parser ────────────────────────────────────────────

export function parseScreenshotIds(raw: string): string[] | null {
  const s = raw.trim()
  if (!s.includes('file_id')) return null
  const ids: string[] = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(s.slice(start, i + 1))
          const id = obj.file_id ?? obj.agent_file_id
          if (typeof id === 'string' && id) ids.push(id)
        } catch { /* skip */ }
        start = -1
      }
    }
  }
  return ids.length ? ids : null
}

// ── Component ─────────────────────────────────────────

interface Props { fileIds: string[] }

export function ScreenshotView({ fileIds }: Props) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  return (
    <div className={styles.wrap}>
      {fileIds.map(id => {
        const url = `/direct/download/${id}`
        if (failed[id]) {
          return <div key={id} className={styles.err}>screenshot unavailable ({id.slice(0, 8)}…)</div>
        }
        return (
          <a key={id} href={url} target="_blank" rel="noreferrer" className={styles.imgLink}>
            <img
              className={styles.img}
              src={url}
              alt="screenshot"
              loading="lazy"
              onError={() => setFailed(f => ({ ...f, [id]: true }))}
            />
          </a>
        )
      })}
    </div>
  )
}
