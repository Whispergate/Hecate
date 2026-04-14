/* ═══════════════════════════════════════════════════
   src/components/FilesPanel/FilesPanel.tsx
   Full-panel file browser.  Queries all filemeta for
   the active operation and shows Downloads / Uploads /
   Screenshots in a split list+detail layout.

   Screenshots: inline preview below file info, clickable
   to open in a new tab.  Thumbnails in list rows.
   Text files: "Inspect" opens a fixed modal with word-wrap.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery }                                   from '@apollo/client'
import { GET_FILES }                                  from '@/apollo/operations'
import { useStore }                                   from '@/store'
import { parseTs }                                    from '@/components/Sidebar/utils'
import styles                                         from './FilesPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface FileMeta {
  id:                     number
  agent_file_id:          string
  filename_text:          string | null
  full_remote_path_text:  string | null
  host:                   string
  size:                   number | null
  complete:               boolean
  total_chunks:           number
  chunks_received:        number
  is_download_from_agent: boolean
  is_screenshot:          boolean
  md5:                    string
  sha1:                   string
  comment:                string
  timestamp:              string
  operator:               { username: string }
  task:                   { display_id: number } | null
}

type Tab = 'downloads' | 'uploads' | 'screenshots'

// ── Helpers ───────────────────────────────────────────

function decodeB64(b64: string | null | undefined): string {
  if (!b64) return ''
  const trimmed = b64.trim()
  if (!trimmed) return ''
  try { return decodeURIComponent(escape(atob(trimmed))) } catch { return trimmed }
}

function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '—'
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

function fmtDate(iso: string): string {
  return parseTs(iso).toLocaleString([], {
    month: 'short', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fileBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function getDisplayName(f: FileMeta): string {
  const decoded = decodeB64(f.filename_text)
  return decoded ? fileBasename(decoded) : f.agent_file_id.slice(0, 8) + '…'
}

function getRemotePath(f: FileMeta): string {
  return decodeB64(f.full_remote_path_text)
}

const TEXT_EXTS = new Set([
  'txt','log','json','xml','csv','tsv','ini','conf','cfg','yaml','yml',
  'toml','md','rst','py','ps1','psm1','psd1','bat','cmd','sh','bash',
  'zsh','js','ts','jsx','tsx','html','htm','css','rb','go','rs','c',
  'cpp','h','hpp','java','php','sql','reg','vbs','hta','inf','lst',
])

function isTextFile(name: string): boolean {
  return TEXT_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '')
}

function downloadUrl(agentFileId: string): string {
  return `/direct/download/${agentFileId}`
}

// ── Inspect modal ─────────────────────────────────────

interface InspectModalProps {
  name:    string
  content: string
  onClose: () => void
}

function InspectModal({ name, content, onClose }: InspectModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalDialog}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Title bar */}
        <div className={styles.modalBar}>
          <span className={styles.modalBarName}>{name}</span>
          <span className={styles.modalBarBytes}>{content.length.toLocaleString()} chars</span>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* Content */}
        <pre className={styles.modalPre}>{content}</pre>
      </div>
    </div>
  )
}

// ── FileRow ────────────────────────────────────────────

interface FileRowProps {
  file:     FileMeta
  selected: boolean
  onClick:  () => void
}

function FileRow({ file, selected, onClick }: FileRowProps) {
  const name       = getDisplayName(file)
  const isComplete = file.complete

  return (
    <button
      className={`${styles.fileRow} ${selected ? styles.fileRowSelected : ''}`}
      onClick={onClick}
    >
      {file.is_screenshot && isComplete ? (
        <img
          src={downloadUrl(file.agent_file_id)}
          className={styles.rowThumb}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className={styles.fileRowIcon}>{isComplete ? '📄' : '⏳'}</span>
      )}
      <span className={styles.fileRowName} title={name}>{name}</span>
      <span className={styles.fileRowHost} title={file.host}>{file.host || '—'}</span>
      {!isComplete && (
        <span className={styles.fileRowProgress}>{file.chunks_received}/{file.total_chunks}</span>
      )}
    </button>
  )
}

// ── FileDetail ────────────────────────────────────────
// key={file.id} at call site resets all state when selection changes.

interface FileDetailProps {
  file: FileMeta
}

function FileDetail({ file }: FileDetailProps) {
  const name       = getDisplayName(file)
  const remotePath = getRemotePath(file)
  const isComplete = file.complete
  const progress   = file.total_chunks > 0
    ? Math.round((file.chunks_received / file.total_chunks) * 100)
    : 0

  const canInspect = isComplete && !file.is_screenshot && isTextFile(name)

  const [inspectContent, setInspectContent] = useState<string | null>(null)
  const [inspectOpen,    setInspectOpen]    = useState(false)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [inspectError,   setInspectError]   = useState<string | null>(null)
  const [imgError,       setImgError]       = useState(false)

  const handleInspect = useCallback(async () => {
    if (inspectOpen) { setInspectOpen(false); return }
    if (inspectContent !== null) { setInspectOpen(true); return }

    setInspectLoading(true)
    setInspectError(null)
    try {
      const res = await fetch(downloadUrl(file.agent_file_id))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setInspectContent(await res.text())
      setInspectOpen(true)
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setInspectLoading(false)
    }
  }, [file.agent_file_id, inspectOpen, inspectContent])

  return (
    <div className={styles.detail}>

      {/* ── Header ── */}
      <div className={styles.detailHeader}>
        <span className={styles.detailIcon}>{file.is_screenshot ? '🖼' : '📄'}</span>
        <div className={styles.detailTitleBlock}>
          <div className={styles.detailName}>{name}</div>
          <div className={styles.detailMeta}>
            {file.is_download_from_agent ? 'downloaded from target' : 'uploaded to target'}
            {file.is_screenshot ? ' · screenshot' : ''}
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className={styles.detailActions}>
        <a
          className={`${styles.dlBtn} ${!isComplete ? styles.dlBtnDisabled : ''}`}
          href={isComplete ? downloadUrl(file.agent_file_id) : undefined}
          download={name}
          onClick={!isComplete ? (e) => e.preventDefault() : undefined}
        >
          ↓ Download
        </a>

        {canInspect && (
          <button
            className={`${styles.inspectBtn} ${inspectOpen ? styles.inspectBtnActive : ''}`}
            onClick={handleInspect}
            disabled={inspectLoading}
          >
            {inspectLoading ? '…' : inspectOpen ? '✕ Close' : '⊙ Inspect'}
          </button>
        )}

        {!isComplete && (
          <span className={styles.incomplete}>
            incomplete — {file.chunks_received}/{file.total_chunks} chunks
          </span>
        )}
      </div>

      {/* ── Progress bar ── */}
      {!isComplete && file.total_chunks > 0 && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          <span className={styles.progressLabel}>{progress}%</span>
        </div>
      )}

      {/* ── Metadata grid ── */}
      <div className={styles.grid}>
        <span className={styles.gridLabel}>Host</span>
        <span className={styles.gridVal}>{file.host || '—'}</span>

        {remotePath && (
          <>
            <span className={styles.gridLabel}>Remote path</span>
            <span className={`${styles.gridVal} ${styles.gridPath}`} title={remotePath}>{remotePath}</span>
          </>
        )}

        <span className={styles.gridLabel}>Size</span>
        <span className={styles.gridVal}>{fmtSize(file.size)}</span>

        <span className={styles.gridLabel}>Status</span>
        <span className={`${styles.gridVal} ${isComplete ? styles.statusOk : styles.statusWarn}`}>
          {isComplete ? 'complete' : `in progress (${progress}%)`}
        </span>

        {file.md5 && (
          <>
            <span className={styles.gridLabel}>MD5</span>
            <span className={`${styles.gridVal} ${styles.hash}`}>{file.md5}</span>
          </>
        )}

        {file.sha1 && (
          <>
            <span className={styles.gridLabel}>SHA1</span>
            <span className={`${styles.gridVal} ${styles.hash}`}>{file.sha1}</span>
          </>
        )}

        <span className={styles.gridLabel}>Operator</span>
        <span className={styles.gridVal}>{file.operator.username}</span>

        {file.task && (
          <>
            <span className={styles.gridLabel}>Task</span>
            <span className={styles.gridVal}>#{file.task.display_id}</span>
          </>
        )}

        <span className={styles.gridLabel}>Time</span>
        <span className={styles.gridVal}>{fmtDate(file.timestamp)}</span>

        <span className={styles.gridLabel}>UUID</span>
        <span className={`${styles.gridVal} ${styles.uuid}`}>{file.agent_file_id}</span>
      </div>

      {/* ── Comment ── */}
      {file.comment && (
        <div className={styles.comment}>
          <div className={styles.commentLabel}>Comment</div>
          <div className={styles.commentText}>{file.comment}</div>
        </div>
      )}

      {/* ── Screenshot preview — below file info, click to open full ── */}
      {file.is_screenshot && isComplete && !imgError && (
        <a
          href={downloadUrl(file.agent_file_id)}
          target="_blank"
          rel="noreferrer"
          className={styles.screenshotLink}
          title="Open full image in new tab"
        >
          <img
            src={downloadUrl(file.agent_file_id)}
            className={styles.screenshot}
            alt={name}
            onError={() => setImgError(true)}
          />
          <span className={styles.screenshotHint}>↗ open full image</span>
        </a>
      )}
      {file.is_screenshot && isComplete && imgError && (
        <div className={styles.screenshotErr}>image failed to load</div>
      )}

      {/* ── Inspect error ── */}
      {inspectError && (
        <div className={styles.inspectErr}>inspect failed: {inspectError}</div>
      )}

      {/* ── Inspect modal (fixed overlay, escapes overflow clipping) ── */}
      {inspectOpen && inspectContent !== null && (
        <InspectModal
          name={name}
          content={inspectContent}
          onClose={() => setInspectOpen(false)}
        />
      )}
    </div>
  )
}

// ── Empty detail placeholder ──────────────────────────

function EmptyDetail() {
  return (
    <div className={styles.emptyDetail}>
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" className={styles.emptySvg}>
        <path d="M12 8h16l8 8v24H12V8z" />
        <path d="M28 8v8h8" />
        <path d="M18 22h12M18 28h8" />
      </svg>
      <div className={styles.emptyText}>select a file</div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────

export function FilesPanel() {
  const op                  = useStore((s) => s.activeOperation)
  const [tab, setTab]       = useState<Tab>('downloads')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, loading, error, refetch } = useQuery(GET_FILES, {
    variables:   { operation_id: op?.id ?? 0 },
    skip:        !op,
    fetchPolicy: 'cache-and-network',
  })

  const allFiles: FileMeta[] = data?.filemeta ?? []

  const downloads   = useMemo(() => allFiles.filter(f => f.is_download_from_agent && !f.is_screenshot), [allFiles])
  const uploads     = useMemo(() => allFiles.filter(f => !f.is_download_from_agent && !f.is_screenshot), [allFiles])
  const screenshots = useMemo(() => allFiles.filter(f => f.is_screenshot), [allFiles])

  const tabFiles = tab === 'downloads' ? downloads : tab === 'uploads' ? uploads : screenshots

  const filtered = useMemo(() => {
    if (!search.trim()) return tabFiles
    const q = search.toLowerCase()
    return tabFiles.filter(f =>
      getDisplayName(f).toLowerCase().includes(q) ||
      f.host.toLowerCase().includes(q) ||
      getRemotePath(f).toLowerCase().includes(q)
    )
  }, [tabFiles, search])

  const selectedFile = filtered.find(f => f.id === selectedId) ?? null

  return (
    <div className={styles.panel}>

      {/* ── Left pane ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>File Browser</span>
          <button className={styles.refreshBtn} title="Refresh" onClick={() => refetch()}>↺</button>
        </div>

        <div className={styles.tabs}>
          {(['downloads', 'uploads', 'screenshots'] as Tab[]).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => { setTab(t); setSelectedId(null) }}
            >
              {t === 'downloads' ? '↓ DL' : t === 'uploads' ? '↑ UL' : '📷'}
              <span className={styles.tabCount}>
                {t === 'downloads' ? downloads.length : t === 'uploads' ? uploads.length : screenshots.length}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <input
            className={styles.search}
            placeholder="filter by name or host…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className={styles.list}>
          {loading && !allFiles.length && <div className={styles.listMsg}>loading…</div>}
          {error && <div className={styles.listErr}>error loading files</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className={styles.listMsg}>{search ? 'no matches' : `no ${tab}`}</div>
          )}
          {filtered.map(f => (
            <FileRow
              key={f.id}
              file={f}
              selected={f.id === selectedId}
              onClick={() => setSelectedId(f.id === selectedId ? null : f.id)}
            />
          ))}
        </div>

        <div className={styles.listFooter}>
          {filtered.length} of {tabFiles.length} {tab}
        </div>
      </div>

      {/* ── Right pane ── */}
      <div className={styles.detailPane}>
        {selectedFile
          ? <FileDetail key={selectedFile.id} file={selectedFile} />
          : <EmptyDetail />
        }
      </div>
    </div>
  )
}
