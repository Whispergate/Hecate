/* src/components/TaskFeed/ProcessBrowser.tsx
   Renders Mythic ps JSON output as a sortable, filterable process table.
   Detects Apollo/Poseidon ProcessInformation array format.
*/

import { useState, useMemo, useCallback, useEffect, Fragment } from 'react'
import { useMutation, useQuery }  from '@apollo/client'
import { CREATE_TASK, GET_INJECT_PAYLOADS } from '@/apollo/operations'
import styles from './ProcessBrowser.module.css'

// ── Types ─────────────────────────────────────────────

export interface ProcessEntry {
  process_id:         number
  parent_process_id?: number
  name:               string
  bin_path?:          string
  user?:              string
  architecture?:      string
  integrity_level?:   number
  session_id?:        number
  command_line?:      string
  description?:       string
  signer?:            string
  company_name?:      string
  start_time?:        string
  window_title?:      string
}

// ── Parser ────────────────────────────────────────────

export function parsePsOutput(raw: string): ProcessEntry[] | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    if (typeof parsed[0]?.process_id !== 'number') return null
    return parsed as ProcessEntry[]
  } catch { return null }
}

// ── Integrity helpers ─────────────────────────────────

const IL_LABEL = ['Untrusted', 'Low', 'Medium', 'High', 'System'] as const
function ilLabel(n?: number) { return n !== undefined ? (IL_LABEL[n] ?? `IL${n}`) : '—' }
function ilClass(n?: number) {
  if (n === undefined) return ''
  if (n >= 4) return styles.ilSystem
  if (n === 3) return styles.ilHigh
  if (n <= 1)  return styles.ilLow
  return ''
}

// ── Sorting ───────────────────────────────────────────

type SortKey = 'process_id' | 'parent_process_id' | 'name' | 'user' | 'architecture' | 'integrity_level' | 'session_id'
type SortDir  = 'asc' | 'desc'

function cmpProc(a: ProcessEntry, b: ProcessEntry, key: SortKey, dir: SortDir): number {
  const av = a[key]
  const bv = b[key]
  if (av === undefined || av === null) return 1
  if (bv === undefined || bv === null) return -1
  const cmp = typeof av === 'number' && typeof bv === 'number'
    ? av - bv
    : String(av).localeCompare(String(bv))
  return dir === 'asc' ? cmp : -cmp
}

// ── Component ─────────────────────────────────────────

interface Props {
  processes:         ProcessEntry[]
  callbackDisplayId: number
}

interface ShellcodePayload { filename: string; description: string; template: string }

export function ProcessBrowser({ processes, callbackDisplayId }: Props) {
  const [createTask] = useMutation(CREATE_TASK)

  const [search,    setSearch]    = useState('')
  const [archPill,  setArchPill]  = useState('all')
  const [ilPill,    setIlPill]    = useState('all')
  const [sortKey,   setSortKey]   = useState<SortKey>('process_id')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [expanded,  setExpanded]  = useState<number | null>(null)

  // Inject modal
  const [injectTarget,   setInjectTarget]   = useState<ProcessEntry | null>(null)
  const [selectedTpl,    setSelectedTpl]    = useState('')

  const { data: payloadData } = useQuery(GET_INJECT_PAYLOADS)

  const shellcodePayloads = useMemo<ShellcodePayload[]>(() => {
    if (!payloadData?.payload) return []
    return payloadData.payload
      .filter((p: any) => {
        const isShellcode = p.buildparameterinstances.some(
          (bpi: any) => bpi.buildparameter.name === 'output_type' && bpi.value === 'Shellcode',
        )
        return isShellcode && p.filemetum
      })
      .map((p: any) => {
        const filename = p.filemetum?.filename_text ? atob(p.filemetum.filename_text) : p.uuid
        return { filename, description: p.description ?? '', template: `${filename} - ${p.description ?? ''}` }
      })
  }, [payloadData])

  // Pre-select first payload when list loads
  useEffect(() => {
    if (shellcodePayloads.length > 0 && !selectedTpl) setSelectedTpl(shellcodePayloads[0].template)
  }, [shellcodePayloads, selectedTpl])

  const issueCmd = useCallback((cmd: string, params: string) => {
    createTask({
      variables: {
        callback_id:      callbackDisplayId,
        command:          cmd,
        params,
        tasking_location: 'command_line',
        original_params:  params,
      },
    })
  }, [callbackDisplayId, createTask])

  const doInject = useCallback(() => {
    if (!injectTarget || !selectedTpl) return
    issueCmd('inject', JSON.stringify({ pid: injectTarget.process_id, template: selectedTpl }))
    setInjectTarget(null)
  }, [injectTarget, selectedTpl, issueCmd])

  const archs = useMemo(() =>
    Array.from(new Set(processes.map(p => p.architecture).filter(Boolean) as string[])).sort(),
    [processes],
  )

  const filtered = useMemo(() => {
    let list = processes
    if (archPill !== 'all') list = list.filter(p => p.architecture === archPill)
    if (ilPill === 'system')    list = list.filter(p => (p.integrity_level ?? 2) >= 4)
    else if (ilPill === 'high') list = list.filter(p => (p.integrity_level ?? 2) >= 3)
    else if (ilPill === 'unsigned') list = list.filter(p => !p.signer || p.signer.trim() === '')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.user ?? '').toLowerCase().includes(q) ||
        (p.bin_path ?? '').toLowerCase().includes(q) ||
        (p.command_line ?? '').toLowerCase().includes(q) ||
        String(p.process_id).includes(q),
      )
    }
    return list
  }, [processes, archPill, ilPill, search])

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => cmpProc(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  function arrow(key: SortKey) {
    if (sortKey !== key) return null
    return <span className={styles.arrow}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function toggleExpand(pid: number) {
    setExpanded(e => e === pid ? null : pid)
  }

  return (
    <div className={styles.browser}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <span className={styles.title}>processes</span>
        <span className={styles.count}>{sorted.length} / {processes.length}</span>

        <input
          className={styles.search}
          placeholder="/ filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setSearch('')}
          spellCheck={false}
        />

        {/* Arch pills */}
        {archs.length > 1 && (
          <div className={styles.pills}>
            {['all', ...archs].map(a => (
              <button
                key={a}
                className={`${styles.pill} ${archPill === a ? styles.pillActive : ''}`}
                onClick={() => setArchPill(a)}
              >{a}</button>
            ))}
          </div>
        )}

        {/* Integrity / context pills */}
        <div className={styles.pills}>
          {(['all', 'system', 'high', 'unsigned'] as const).map(v => (
            <button
              key={v}
              className={`${styles.pill} ${v === 'system' ? styles.pillSystem : v === 'high' ? styles.pillHigh : ''} ${ilPill === v ? styles.pillActive : ''}`}
              onClick={() => setIlPill(v)}
            >{v}</button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thPid}     onClick={() => toggleSort('process_id')}>PID {arrow('process_id')}</th>
              <th className={styles.thPpid}    onClick={() => toggleSort('parent_process_id')}>PPID {arrow('parent_process_id')}</th>
              <th className={styles.thName}    onClick={() => toggleSort('name')}>Name {arrow('name')}</th>
              <th className={styles.thUser}    onClick={() => toggleSort('user')}>User {arrow('user')}</th>
              <th className={styles.thArch}    onClick={() => toggleSort('architecture')}>Arch {arrow('architecture')}</th>
              <th className={styles.thIl}      onClick={() => toggleSort('integrity_level')}>Integrity {arrow('integrity_level')}</th>
              <th className={styles.thSession} onClick={() => toggleSort('session_id')}>Sess {arrow('session_id')}</th>
              <th className={styles.thAct} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(proc => {
              const il       = proc.integrity_level
              const isExp    = expanded === proc.process_id
              const unsigned = !proc.signer || proc.signer.trim() === ''
              const hasDetail = proc.bin_path || proc.command_line || proc.signer || proc.company_name || proc.start_time

              return (
                <Fragment key={proc.process_id}>
                  <tr
                    className={`${styles.row} ${il !== undefined && il >= 4 ? styles.rowSystem : il === 3 ? styles.rowHigh : ''} ${isExp ? styles.rowExpanded : ''}`}
                    onClick={() => hasDetail && toggleExpand(proc.process_id)}
                    style={{ cursor: hasDetail ? 'pointer' : 'default' }}
                  >
                    <td className={styles.tdPid}>{proc.process_id}</td>
                    <td className={styles.tdPpid}>{proc.parent_process_id ?? '—'}</td>
                    <td className={styles.tdName}>
                      <span className={styles.procName}>{proc.name}</span>
                      {unsigned && <span className={styles.unsignedBadge} title="unsigned">!</span>}
                      {hasDetail && <span className={styles.expandHint}>{isExp ? '▼' : '▶'}</span>}
                    </td>
                    <td className={styles.tdUser} title={proc.user}>
                      {proc.user?.split('\\').pop() ?? '—'}
                    </td>
                    <td className={`${styles.tdArch} ${proc.architecture === 'x86' ? styles.archX86 : ''}`}>
                      {proc.architecture ?? '—'}
                    </td>
                    <td className={`${styles.tdIl} ${ilClass(il)}`}>{ilLabel(il)}</td>
                    <td className={styles.tdSession}>{proc.session_id ?? '—'}</td>
                    <td className={styles.tdAct} onClick={e => e.stopPropagation()}>
                      <div className={styles.actGroup}>
                        <button
                          className={`${styles.actBtn} ${styles.actInject}`}
                          title={`inject into PID ${proc.process_id}`}
                          onClick={() => { setInjectTarget(proc); if (shellcodePayloads.length > 0) setSelectedTpl(shellcodePayloads[0].template) }}
                        >inject</button>
                        <button
                          className={`${styles.actBtn} ${styles.actKill}`}
                          title={`kill PID ${proc.process_id}`}
                          onClick={() => issueCmd('kill', String(proc.process_id))}
                        >kill</button>
                      </div>
                    </td>
                  </tr>

                  {isExp && hasDetail && (
                    <tr className={styles.detailRow}>
                      <td colSpan={8} className={styles.detailCell}>
                        {proc.bin_path     && <div className={styles.detailLine}><span className={styles.detailKey}>path</span><span className={styles.detailVal}>{proc.bin_path}</span></div>}
                        {proc.command_line && <div className={styles.detailLine}><span className={styles.detailKey}>cmd</span><span className={styles.detailVal}>{proc.command_line}</span></div>}
                        {proc.signer       && <div className={styles.detailLine}><span className={styles.detailKey}>signer</span><span className={styles.detailVal}>{proc.signer}</span></div>}
                        {proc.company_name && <div className={styles.detailLine}><span className={styles.detailKey}>company</span><span className={styles.detailVal}>{proc.company_name}</span></div>}
                        {proc.start_time   && <div className={styles.detailLine}><span className={styles.detailKey}>started</span><span className={styles.detailVal}>{proc.start_time}</span></div>}
                        {proc.description  && <div className={styles.detailLine}><span className={styles.detailKey}>desc</span><span className={styles.detailVal}>{proc.description}</span></div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className={styles.empty}>(no processes match filter)</div>
        )}
      </div>

      <div className={styles.footer}>
        {sorted.length} processes · {sorted.filter(p => (p.integrity_level ?? 2) >= 4).length} SYSTEM · {sorted.filter(p => !p.signer || !p.signer.trim()).length} unsigned
      </div>

      {/* ── Inject modal ── */}
      {injectTarget && (
        <div className={styles.modalBackdrop} onClick={() => setInjectTarget(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              inject into PID {injectTarget.process_id}
              <span className={styles.modalSub}>{injectTarget.name} · {injectTarget.architecture ?? 'unknown arch'}</span>
            </div>

            {shellcodePayloads.length === 0 ? (
              <div className={styles.modalEmpty}>
                No built Apollo shellcode payloads found.<br />
                Build one first (Payloads → output_type: Shellcode).
              </div>
            ) : (
              <div className={styles.modalBody}>
                <label className={styles.modalLabel}>Shellcode payload</label>
                <select
                  className={styles.modalSelect}
                  value={selectedTpl}
                  onChange={e => setSelectedTpl(e.target.value)}
                >
                  {shellcodePayloads.map(p => (
                    <option key={p.template} value={p.template}>
                      {p.filename}{p.description ? ` — ${p.description}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setInjectTarget(null)}>cancel</button>
              <button
                className={styles.modalConfirm}
                onClick={doInject}
                disabled={!selectedTpl || shellcodePayloads.length === 0}
              >inject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
