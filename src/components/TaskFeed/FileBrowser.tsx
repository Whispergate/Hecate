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

export interface LsFile {
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

export interface LsResult {
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

// ── Apollo text ls parser ─────────────────────────────
// Parses Apollo agent's human-readable ls output:
//   Directory listing for: C:\path
//   -rw-rw-rw-    2026-01-01 12:00:00    1024    filename.txt
//   drwxrwxrwx    2026-01-01 12:00:00    0       dirname

function parseApolloTextLs(raw: string): LsResult | null {
  const lines   = raw.split('\n')
  const header  = lines[0]?.trim()
  const PREFIX  = 'Directory listing for:'
  if (!header?.startsWith(PREFIX)) return null

  const dirPath = header.slice(PREFIX.length).trim()
  const sep     = dirPath.includes('\\') ? '\\' : '/'
  const lineRe  = /^([d-][rwx-]+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+)$/

  const files: LsFile[] = []
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].trim().match(lineRe)
    if (!m) continue
    const [, perms, dateStr, sizeStr, name] = m
    const isFile = !perms.startsWith('d')
    files.push({
      name,
      full_name: dirPath.replace(/[/\\]$/, '') + sep + name,
      is_file:   isFile,
      size:      isFile ? parseInt(sizeStr, 10) : undefined,
      modify_time: new Date(dateStr).getTime(),
    })
  }

  if (!files.length) return null

  const clean   = dirPath.replace(/[/\\]$/, '')
  const lastSep = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'))
  return {
    success:     true,
    name:        lastSep >= 0 ? clean.slice(lastSep + 1) : clean,
    parent_path: lastSep >= 0 ? clean.slice(0, lastSep + 1) : undefined,
    files,
  }
}

export function parseLsOutput(raw: string): LsResult | null {
  // Try Mythic JSON format first (Poseidon and other agents)
  if (raw.trim().startsWith('{')) {
    const chunks = parseJsonObjects(raw)
    if (chunks.length) {
      const base    = chunks[0]
      const fileMap = new Map<string, LsFile>()
      chunks.forEach(chunk => chunk.files.forEach(f => fileMap.set(f.full_name ?? f.name, f)))
      return { ...base, files: Array.from(fileMap.values()) }
    }
  }

  // Fall back to Apollo plain-text format
  return parseApolloTextLs(raw)
}

// ── Text file detection ───────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'txt','log','conf','config','cfg','ini','yaml','yml','json','xml','csv','tsv',
  'md','markdown','rst','toml','env','properties','sh','bash','zsh','fish',
  'ps1','psm1','psd1','bat','cmd','py','rb','php','pl','lua','go','rs',
  'c','cpp','h','hpp','cs','java','js','ts','jsx','tsx','html','htm','css',
  'scss','less','sql','dockerfile','makefile','gitignore','htaccess','reg',
])

export function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) {
    // no extension — treat common extensionless names as text
    const base = name.toLowerCase()
    return ['dockerfile','makefile','readme','license','changelog',
            'hosts','passwd','shadow','crontab'].includes(base)
  }
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
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
                  <div className={styles.actGroup}>
                    {isTextFile(f.name) && (
                      <button
                        className={`${styles.actBtn} ${styles.actCat}`}
                        title={`cat ${f.full_name}`}
                        onClick={() => issueCmd('cat', f.full_name ?? f.name)}
                      >
                        cat
                      </button>
                    )}
                    <button
                      className={styles.actBtn}
                      title={`download ${f.full_name}`}
                      onClick={() => issueCmd('download', f.full_name ?? f.name)}
                    >
                      ↓ dl
                    </button>
                  </div>
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
