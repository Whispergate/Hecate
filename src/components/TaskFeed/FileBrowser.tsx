/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/FileBrowser.tsx
   Renders Mythic `ls` JSON output as a file explorer.
   Parses concatenated JSON chunks, deduplicates by full_name.
   ═══════════════════════════════════════════════════ */

import { useCallback } from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_TASK } from '@/apollo/operations'
import styles from './FileBrowser.module.css'

// ── Types ─────────────────────────────────────────────

interface LsFile {
  name:       string
  full_name:  string
  is_file:    boolean
  size?:      number
  hidden?:    boolean
  owner?:     string
  modify_time?: number   // epoch ms
  extended_attributes?: string
  directory?: string
}

interface LsResult {
  success:     boolean
  host?:       string
  name?:       string
  parent_path?: string
  is_file?:    boolean
  files:       LsFile[]
}

// ── Parsing ───────────────────────────────────────────

function parseJsonObjects(text: string): LsResult[] {
  const results: LsResult[] = []

  // Try single parse first
  try {
    const obj = JSON.parse(text)
    if (obj && Array.isArray(obj.files)) return [obj as LsResult]
  } catch { /* fall through to multi-object parse */ }

  // Multiple concatenated JSON objects — scan for object boundaries
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1))
          if (obj && Array.isArray(obj.files)) results.push(obj as LsResult)
        } catch { /* skip malformed */ }
        start = -1
      }
    }
  }
  return results
}

export function parseLsOutput(raw: string): LsResult | null {
  if (!raw.trim().startsWith('{')) return null
  const chunks = parseJsonObjects(raw)
  if (!chunks.length) return null

  // Merge: use first chunk's metadata, combine all files, deduplicate
  const base = chunks[0]
  const fileMap = new Map<string, LsFile>()
  chunks.forEach(chunk => chunk.files.forEach(f => fileMap.set(f.full_name ?? f.name, f)))
  return { ...base, files: Array.from(fileMap.values()) }
}

// ── Formatters ────────────────────────────────────────

function fmtSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes === 0) return '—'
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

function fmtDate(epochMs?: number): string {
  if (!epochMs) return '—'
  return new Date(epochMs).toLocaleString([], {
    month: '2-digit', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Component ─────────────────────────────────────────

interface Props {
  result:      LsResult
  callbackDisplayId: number
}

export function FileBrowser({ result, callbackDisplayId }: Props) {
  const [createTask] = useMutation(CREATE_TASK)

  const issueCmd = useCallback((command: string, params: string) => {
    createTask({
      variables: {
        callback_id:      callbackDisplayId,
        command,
        params,
        tasking_location: 'command_line',
        original_params:  params,
      },
    })
  }, [callbackDisplayId, createTask])

  // Sort: directories first, then files, each alphabetically
  const sorted = [...result.files].sort((a, b) => {
    if (a.is_file !== b.is_file) return a.is_file ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  const dirPath = result.parent_path
    ? `${result.parent_path}${result.name ?? ''}`.replace(/\\$/, '')
    : result.name ?? ''

  return (
    <div className={styles.browser}>

      {/* ── Path bar ── */}
      <div className={styles.pathBar}>
        <span className={styles.pathIcon}>📂</span>
        <span className={styles.pathText}>{dirPath}</span>
        {result.host && <span className={styles.pathHost}>{result.host}</span>}
      </div>

      {/* ── Table ── */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thIcon} />
            <th className={styles.thName}>Name</th>
            <th className={styles.thSize}>Size</th>
            <th className={styles.thOwner}>Owner</th>
            <th className={styles.thDate}>Modified</th>
            <th className={styles.thAct} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => (
            <tr
              key={f.full_name ?? f.name}
              className={`${styles.row} ${f.hidden ? styles.hidden : ''}`}
            >
              <td className={styles.tdIcon}>
                {f.is_file ? '📄' : '📁'}
              </td>
              <td className={styles.tdName}>
                <span className={f.is_file ? styles.fileName : styles.dirName}>
                  {f.name}
                </span>
                {f.hidden && <span className={styles.hiddenBadge}>hidden</span>}
              </td>
              <td className={styles.tdSize}>{f.is_file ? fmtSize(f.size) : '—'}</td>
              <td className={styles.tdOwner} title={f.owner}>{f.owner?.split('\\').pop() ?? '—'}</td>
              <td className={styles.tdDate}>{fmtDate(f.modify_time)}</td>
              <td className={styles.tdAct}>
                {f.is_file ? (
                  <button
                    className={styles.actBtn}
                    title={`download ${f.full_name}`}
                    onClick={() => issueCmd('download', f.full_name ?? f.name)}
                  >
                    ↓ dl
                  </button>
                ) : (
                  <button
                    className={`${styles.actBtn} ${styles.actNav}`}
                    title={`ls ${f.full_name}`}
                    onClick={() => issueCmd('ls', f.full_name ?? f.name)}
                  >
                    → ls
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className={styles.empty}>(empty directory)</div>
      )}

      <div className={styles.footer}>
        {sorted.filter(f => !f.is_file).length} dirs · {sorted.filter(f => f.is_file).length} files
      </div>
    </div>
  )
}
