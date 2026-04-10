/* ═══════════════════════════════════════════════════
   src/components/ReportPanel/ReportPanel.tsx
   Full-panel report builder. Left: options. Right: live preview + export.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from 'react'
import { useQuery }                        from '@apollo/client'
import { GET_REPORT_TASKS }                from '@/apollo/operations'
import { useStore }                        from '@/store'
import { parseTs }                         from '@/components/Sidebar/utils'
import {
  filterTasks,
  collectTtps,
  isMitreTtp,
  generateMarkdown,
  generateHtml,
  type ReportTask,
  type ReportOptions,
} from './reportGenerator'
import styles from './ReportPanel.module.css'

// ── Default options ────────────────────────────────────

function makeDefaults(): ReportOptions {
  return {
    title:            '',
    groupBy:          'chronological',
    includeTTPs:      true,
    includeOperators: true,
    statusFilter:     'all',
    selectedCallbacks: new Set(),
    dateFrom:         '',
    dateTo:           '',
  }
}

// ── Helpers ───────────────────────────────────────────

function fmtTs(iso: string): string {
  return parseTs(iso).toLocaleString([], {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function statusCls(task: ReportTask): string {
  if (task.status.toLowerCase().includes('error')) return styles.symErr
  if (task.completed) return styles.symOk
  return styles.symRun
}

function displayArgs(task: ReportTask): string {
  return (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''
}

// ── Live preview sections ─────────────────────────────

function PreviewTaskRow({ task, opts }: { task: ReportTask; opts: ReportOptions }) {
  const args   = displayArgs(task)
  const sym    = task.status.toLowerCase().includes('error') ? '✗' : task.completed ? '✓' : '◌'
  const ttpTags = task.tags.filter(tag => isMitreTtp(tag.tagtype.name))

  return (
    <tr className={styles.taskRow}>
      <td className={`${styles.sym} ${statusCls(task)}`}>{sym}</td>
      <td className={styles.ts}>{fmtTs(task.timestamp)}</td>
      <td className={styles.host}>{task.callback.host}</td>
      <td className={styles.cmd}>
        <span className={styles.cmdName}>{task.command_name}</span>
        {args && <span className={styles.cmdArgs}> {args}</span>}
      </td>
      {opts.includeOperators && <td className={styles.opCell}>{task.operator.username}</td>}
      {opts.includeTTPs && (
        <td className={styles.ttpsCell}>
          {ttpTags.length > 0
            ? ttpTags.map(tag => (
                <span
                  key={tag.tagtype.name}
                  className={styles.ttpBadge}
                  style={{ '--ttp-color': tag.tagtype.color } as React.CSSProperties}
                >
                  {tag.tagtype.name}
                </span>
              ))
            : <span className={styles.dim}>—</span>
          }
        </td>
      )}
    </tr>
  )
}

function PreviewTaskTable({ tasks, opts }: { tasks: ReportTask[]; opts: ReportOptions }) {
  return (
    <table className={styles.taskTable}>
      <thead>
        <tr>
          <th className={styles.thSym}></th>
          <th className={styles.thTs}>Time</th>
          <th className={styles.thHost}>Host</th>
          <th className={styles.thCmd}>Command</th>
          {opts.includeOperators && <th className={styles.thOp}>Operator</th>}
          {opts.includeTTPs      && <th className={styles.thTtps}>TTPs</th>}
        </tr>
      </thead>
      <tbody>
        {tasks.map(t => <PreviewTaskRow key={t.id} task={t} opts={opts} />)}
      </tbody>
    </table>
  )
}

function LivePreview({ tasks, opts, opName }: { tasks: ReportTask[]; opts: ReportOptions; opName: string }) {
  const filtered = useMemo(() => filterTasks(tasks, opts), [tasks, opts])
  const ttps     = useMemo(() => opts.includeTTPs ? collectTtps(filtered) : [], [filtered, opts.includeTTPs])

  const oldest   = filtered.length ? parseTs(filtered[0].timestamp).toLocaleDateString() : '—'
  const newest   = filtered.length ? parseTs(filtered[filtered.length - 1].timestamp).toLocaleDateString() : '—'
  const uniqueCbs = new Set(filtered.map(t => t.callback.host)).size
  const uniqueOps = new Set(filtered.map(t => t.operator.username)).size

  // Group tasks for display
  let sections: Array<{ heading?: string; tasks: ReportTask[] }> = []

  if (opts.groupBy === 'callback') {
    const byHost = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const k = `${t.callback.host} (${t.callback.ip})`
      const arr = byHost.get(k) ?? []; arr.push(t); byHost.set(k, arr)
    })
    byHost.forEach((cbTasks, host) => sections.push({ heading: host, tasks: cbTasks }))
  } else if (opts.groupBy === 'operator') {
    const byOp = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const arr = byOp.get(t.operator.username) ?? []; arr.push(t); byOp.set(t.operator.username, arr)
    })
    byOp.forEach((opTasks, op) => sections.push({ heading: `Operator: ${op}`, tasks: opTasks }))
  } else {
    sections = [{ tasks: filtered }]
  }

  if (filtered.length === 0) {
    return (
      <div className={styles.previewEmpty}>
        <span className={styles.emptyIcon}>⬡</span>
        <span>No tasks match the current filters</span>
      </div>
    )
  }

  return (
    <div className={styles.preview}>

      {/* ── Report header ── */}
      <div className={styles.reportHeader}>
        <div className={styles.reportTitle}>{opts.title || 'Operation Report'}</div>
        <div className={styles.reportMeta}>
          <span className={styles.metaItem}><span className={styles.metaKey}>operation</span>{opName}</span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}><span className={styles.metaKey}>period</span>{oldest} → {newest}</span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}><span className={styles.metaKey}>tasks</span>{filtered.length}</span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}><span className={styles.metaKey}>hosts</span>{uniqueCbs}</span>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaItem}><span className={styles.metaKey}>operators</span>{uniqueOps}</span>
        </div>
      </div>

      {/* ── MITRE TTP summary ── */}
      {opts.includeTTPs && ttps.length > 0 && (
        <div className={styles.ttpSection}>
          <div className={styles.sectionHeading}>MITRE ATT&amp;CK Coverage</div>
          <div className={styles.ttpGrid}>
            {ttps.map(t => (
              <div key={t.name} className={styles.ttpCard} style={{ '--ttp-color': t.color } as React.CSSProperties}>
                <span className={styles.ttpCardName}>{t.name}</span>
                <span className={styles.ttpCardCount}>{t.count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Task log ── */}
      <div className={styles.taskLogSection}>
        <div className={styles.sectionHeading}>Task Log</div>
        {sections.map((s, i) => (
          <div key={i} className={styles.taskGroup}>
            {s.heading && <div className={styles.groupHeading}>{s.heading}</div>}
            <PreviewTaskTable tasks={s.tasks} opts={opts} />
          </div>
        ))}
      </div>

      <div className={styles.reportFooter}>
        Generated by Hecate · {new Date().toLocaleString([], { hour12: false })}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────

export function ReportPanel() {
  const activeOperation = useStore((s) => s.activeOperation)
  const [opts, setOpts] = useState<ReportOptions>(makeDefaults)
  const [copied, setCopied] = useState(false)

  const { data, loading } = useQuery(GET_REPORT_TASKS, {
    variables: { operation_id: activeOperation?.id ?? 0 },
    fetchPolicy: 'cache-and-network',
    skip: !activeOperation,
  })

  const tasks: ReportTask[] = data?.task ?? []

  // Unique callbacks from task data
  const callbackList = useMemo(() => {
    const map = new Map<number, { id: number; host: string; ip: string }>()
    tasks.forEach(t => {
      if (!map.has(t.callback.id)) map.set(t.callback.id, t.callback)
    })
    return Array.from(map.values()).sort((a, b) => a.host.localeCompare(b.host))
  }, [tasks])

  const toggleCallback = useCallback((id: number) => {
    setOpts(o => {
      const next = new Set(o.selectedCallbacks)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...o, selectedCallbacks: next }
    })
  }, [])

  const selectAllCbs = useCallback(() => setOpts(o => ({ ...o, selectedCallbacks: new Set() })), [])
  const selectNoneCbs = useCallback(() => {
    setOpts(o => ({ ...o, selectedCallbacks: new Set(callbackList.map(c => c.id)) }))
  }, [callbackList])

  function patch<K extends keyof ReportOptions>(key: K, val: ReportOptions[K]) {
    setOpts(o => ({ ...o, [key]: val }))
  }

  const opName = activeOperation?.name ?? ''

  function doExportMd() {
    const md = generateMarkdown(tasks, opts, opName)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${opName || 'report'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function doExportHtml() {
    const html = generateHtml(tasks, opts, opName)
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${opName || 'report'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  function doCopyMd() {
    const md = generateMarkdown(tasks, opts, opName)
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={styles.root}>

      {/* ══ LEFT: builder ══ */}
      <div className={styles.builder}>
        <div className={styles.builderHeader}>
          <span className={styles.builderTitle}>Report Builder</span>
          {loading && <span className={styles.loadingDot} />}
        </div>

        <div className={styles.builderBody}>

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label}>Report title</label>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Operation Report"
              value={opts.title}
              onChange={e => patch('title', e.target.value)}
            />
          </div>

          {/* Date range */}
          <div className={styles.field}>
            <label className={styles.label}>Date range</label>
            <input
              className={styles.textInput}
              type="datetime-local"
              value={opts.dateFrom}
              onChange={e => patch('dateFrom', e.target.value)}
            />
            <span className={styles.rangeSep}>to</span>
            <input
              className={styles.textInput}
              type="datetime-local"
              value={opts.dateTo}
              onChange={e => patch('dateTo', e.target.value)}
            />
          </div>

          {/* Status filter */}
          <div className={styles.field}>
            <label className={styles.label}>Tasks</label>
            <div className={styles.btnGroup}>
              {(['all', 'completed', 'errors'] as const).map(v => (
                <button
                  key={v}
                  className={`${styles.groupBtn} ${opts.statusFilter === v ? styles.groupBtnActive : ''}`}
                  onClick={() => patch('statusFilter', v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Group by */}
          <div className={styles.field}>
            <label className={styles.label}>Group by</label>
            <div className={styles.btnGroup}>
              {([['chronological','chrono'], ['callback','host'], ['operator','op']] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  className={`${styles.groupBtn} ${opts.groupBy === v ? styles.groupBtnActive : ''}`}
                  onClick={() => patch('groupBy', v)}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className={styles.field}>
            <label className={styles.label}>Include</label>
            <div className={styles.toggleList}>
              <label className={styles.toggle}>
                <input type="checkbox" checked={opts.includeTTPs} onChange={e => patch('includeTTPs', e.target.checked)} />
                <span className={styles.toggleLabel}>MITRE ATT&amp;CK TTPs</span>
              </label>
              <label className={styles.toggle}>
                <input type="checkbox" checked={opts.includeOperators} onChange={e => patch('includeOperators', e.target.checked)} />
                <span className={styles.toggleLabel}>Operator names</span>
              </label>
            </div>
          </div>

          {/* Callback filter */}
          {callbackList.length > 0 && (
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label}>Callbacks</label>
                <div className={styles.labelActions}>
                  <button className={styles.microBtn} onClick={selectAllCbs}>all</button>
                  <button className={styles.microBtn} onClick={selectNoneCbs}>none</button>
                </div>
              </div>
              <div className={styles.cbList}>
                {callbackList.map(cb => {
                  const included = opts.selectedCallbacks.size === 0 || !opts.selectedCallbacks.has(cb.id)
                  return (
                    <label key={cb.id} className={`${styles.cbItem} ${included ? '' : styles.cbItemOff}`}>
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleCallback(cb.id)}
                      />
                      <span className={styles.cbHost}>{cb.host}</span>
                      <span className={styles.cbIp}>{cb.ip}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Export toolbar */}
        <div className={styles.exportBar}>
          <button className={styles.exportBtn} onClick={doCopyMd}>
            {copied ? '✓ copied' : '⎘ copy md'}
          </button>
          <button className={styles.exportBtn} onClick={doExportMd}>
            ↓ .md
          </button>
          <button className={`${styles.exportBtn} ${styles.exportBtnPrimary}`} onClick={doExportHtml}>
            ↓ .html
          </button>
        </div>
      </div>

      {/* ══ RIGHT: live preview ══ */}
      <div className={styles.previewPane}>
        {!activeOperation ? (
          <div className={styles.previewEmpty}>
            <span className={styles.emptyIcon}>⬡</span>
            <span>No active operation</span>
          </div>
        ) : (
          <LivePreview tasks={tasks} opts={opts} opName={opName} />
        )}
      </div>
    </div>
  )
}
