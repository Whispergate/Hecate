/* ═══════════════════════════════════════════════════
   src/components/CommandBar/CommandBar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useLazyQuery } from '@apollo/client'
import { CREATE_TASK, GET_COMMANDS, GET_CALLBACK_TASK_HISTORY } from '@/apollo/operations'
import { useStore }                                 from '@/store'
import { FileTaskModal, type CommandParam }         from './FileTaskModal'
import { SocksModal }                               from './SocksModal'
import { RpfwdModal }                               from './RpfwdModal'
import { LinkModal }                                from './LinkModal'
import { UnlinkModal }                              from './UnlinkModal'
import styles                                       from './CommandBar.module.css'

// ── Tab completion ────────────────────────────────────

interface CompletionState {
  options: string[]   // matching command names
  idx:     number     // currently highlighted option (-1 = none)
  prefix:  string     // the prefix being completed
}

const EMPTY_COMP: CompletionState = { options: [], idx: -1, prefix: '' }

function matchCommands(allCmds: string[], prefix: string): string[] {
  const lc = prefix.toLowerCase()
  return allCmds.filter(c => c.toLowerCase().startsWith(lc))
}

// ── Component ─────────────────────────────────────────

// ── Types returned by GET_COMMANDS (now includes commandparameters) ──
interface RawCmd {
  cmd:               string
  description:       string
  script_only:       boolean
  commandparameters: CommandParam[]
}

// Modal state — null when closed
interface ModalState {
  command:    string
  params:     CommandParam[]
  displayId:  number
  defaultCwd: string
}

function extractCwd(extraInfo: string, description: string): string {
  const raw = (extraInfo ?? '').trim()
  if (raw) {
    // Try JSON — agents may store {"cwd":"..."} or similar
    try {
      const info = JSON.parse(raw) as Record<string, unknown>
      const keys = ['cwd', 'CWD', 'pwd', 'PWD', 'current_directory', 'CurrentDirectory',
                    'working_directory', 'WorkingDirectory', 'currentDirectory']
      for (const k of keys) {
        if (typeof info[k] === 'string' && info[k]) return info[k] as string
      }
    } catch { /* not JSON */ }
    // If extra_info itself looks like a filesystem path, use it directly
    if (/^[A-Za-z]:[\\\/]/.test(raw) || raw.startsWith('/')) return raw
  }
  // Fall back to description if it looks like a path
  const desc = (description ?? '').trim()
  if (/^[A-Za-z]:[\\\/]/.test(desc) || (desc.startsWith('/') && !desc.includes(' '))) {
    return desc
  }
  return ''
}

export function CommandBar() {
  const [input,      setInput]      = useState('')
  const [histIdx,    setHistIdx]    = useState(-1)
  const [error,      setError]      = useState<string | null>(null)
  const [comp,       setComp]       = useState<CompletionState>(EMPTY_COMP)
  const [modal,      setModal]      = useState<ModalState | null>(null)
  const [socksModal, setSocksModal] = useState(false)
  const [rpfwdModal,   setRpfwdModal]   = useState(false)
  const [linkModal,    setLinkModal]    = useState(false)
  const [unlinkModal,  setUnlinkModal]  = useState(false)

  const inputRef   = useRef<HTMLInputElement>(null)
  const menuRef    = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Record<number, string[]>>({})

  const { selectedCallbackId, multiSelectedIds, callbacks } = useStore()
  const activeCallbackPorts = useStore(s => s.activeCallbackPorts)

  const cb        = callbacks.find(c => c.id === selectedCallbackId)
  const displayId = cb?.display_id ?? null
  const agentName = cb?.payload.payloadtype.name ?? ''

  const cwdPath          = cb?.cwd?.trim() ?? ''
  const impersonatedUser = cb?.impersonation_context?.trim() ?? ''
  const currentUser      = cb?.user?.trim() ?? ''

  const [fetchHistory] = useLazyQuery(GET_CALLBACK_TASK_HISTORY, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      if (!displayId) return
      if (historyRef.current[displayId] !== undefined) return  // already seeded this session
      const entries: string[] = (data?.task ?? []).map((t: { command_name: string; display_params: string }) => {
        const p = (t.display_params ?? '').trim()
        return p ? `${t.command_name} ${p}` : t.command_name
      })
      historyRef.current[displayId] = entries
    },
  })

  const targetIds: number[] = multiSelectedIds.length > 1 ? multiSelectedIds : (selectedCallbackId ? [selectedCallbackId] : [])
  const targetDisplayIds = targetIds
    .map(id => callbacks.find(c => c.id === id)?.display_id)
    .filter((d): d is number => d != null)
  const isMultiTarget = targetDisplayIds.length > 1
  const prompt = isMultiTarget ? `[${targetDisplayIds.length} callbacks]` : (cb ? cb.host : 'hecate')

  // Reset history cursor when active callback changes; seed from server on first visit
  useEffect(() => {
    setHistIdx(-1)
    if (selectedCallbackId != null && displayId != null && historyRef.current[displayId] === undefined) {
      fetchHistory({ variables: { callback_id: selectedCallbackId } })
    }
  }, [displayId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch commands for the current agent type (includes commandparameters)
  const { data: cmdData } = useQuery(GET_COMMANDS, {
    variables: { payloadtype_name: agentName },
    skip: !agentName,
    fetchPolicy: 'cache-and-network',
  })
  const allCmds: string[] = (cmdData?.command ?? []).map((c: RawCmd) => c.cmd)
  const cmdDescMap: Record<string, string> = Object.fromEntries(
    (cmdData?.command ?? []).map((c: RawCmd) => [c.cmd, c.description])
  )
  const cmdParamsMap: Record<string, CommandParam[]> = Object.fromEntries(
    (cmdData?.command ?? []).map((c: RawCmd) => [c.cmd, c.commandparameters ?? []])
  )
  const cmdScriptOnlyMap: Record<string, boolean> = Object.fromEntries(
    (cmdData?.command ?? []).map((c: RawCmd) => [c.cmd, c.script_only ?? false])
  )

  const [createTask, { loading }] = useMutation(CREATE_TASK, {
    onError: (err) => setError(err.message),
  })

  // ── Dismiss completion on outside click ───────────────
  useEffect(() => {
    if (!comp.options.length) return
    function onDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setComp(EMPTY_COMP)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [comp.options.length])

  // ── Per-callback history helpers ──────────────────────
  function pushHistory(cbDisplayId: number | undefined, cmd: string) {
    if (cbDisplayId == null) return
    const prev = historyRef.current[cbDisplayId] ?? []
    if (prev[0] !== cmd) {
      historyRef.current[cbDisplayId] = [cmd, ...prev].slice(0, 50)
    }
    setHistIdx(-1)
  }

  // ── Submit ────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const raw = input.trim()
    if (!raw || !targetDisplayIds.length) return

    setError(null)
    setComp(EMPTY_COMP)

    const spaceIdx = raw.indexOf(' ')
    const command  = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)
    const params   = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1)

    // Socks modal — intercept bare "socks" for primary callback
    if (command === 'socks' && !params && displayId) {
      pushHistory(displayId, raw)
      setInput('')
      setSocksModal(true)
      return
    }

    // rpfwd modal — dedicated modal for reverse port forward
    if (command === 'rpfwd' && !params && displayId) {
      pushHistory(displayId, raw)
      setInput('')
      setRpfwdModal(true)
      return
    }

    // link modal — requires P2P payload/callback selection
    if (command === 'link' && !params && displayId) {
      pushHistory(displayId, raw)
      setInput('')
      setLinkModal(true)
      return
    }

    // unlink modal — requires existing graph edge selection
    if (command === 'unlink' && !params && displayId) {
      pushHistory(displayId, raw)
      setInput('')
      setUnlinkModal(true)
      return
    }

    // Param modal — primary callback only (not multi-tasked)
    if (!params && displayId) {
      const cmdParams = cmdParamsMap[command] ?? []
      // Any File param (even non-required) — always needs picker (e.g. upload)
      const hasAnyFileParam   = cmdParams.some(p => p.type === 'File' || p.type === 'FileMultiple')
      const hasRequiredCred   = cmdParams.some(p => p.type === 'CredentialJson' && p.required)
      const isScriptOnly      = cmdScriptOnlyMap[command] ?? false
      // Any required param not provided on CLI
      const hasRequiredParam  = cmdParams.some(p => p.required && p.type !== 'None')
      // Multiple groups → ambiguous, always modal
      const hasMultipleGroups = new Set(cmdParams.map(p => p.parameter_group_name)).size > 1

      if (hasAnyFileParam || hasRequiredCred || isScriptOnly || hasRequiredParam || hasMultipleGroups) {
        pushHistory(displayId, raw)
        setInput('')
        setModal({ command, params: cmdParams, displayId, defaultCwd: extractCwd(cb?.extra_info ?? '', cb?.description ?? '') })
        return
      }
    }

    pushHistory(displayId ?? targetDisplayIds[0], raw)
    setInput('')

    const results = await Promise.all(
      targetDisplayIds.map(did =>
        createTask({
          variables: {
            callback_id:      did,
            command,
            params,
            tasking_location: 'command_line',
            original_params:  params,
          },
        }).catch(() => null)
      )
    )

    const firstError = results.find(r => r?.data?.createTask?.status === 'error')
    if (firstError) setError(firstError.data.createTask.error ?? 'Task creation failed')
  }, [input, displayId, targetDisplayIds, createTask, cmdParamsMap, cmdScriptOnlyMap, cb, activeCallbackPorts])

  // ── Apply a completion choice ─────────────────────────
  const applyCompletion = useCallback((cmd: string) => {
    setInput(cmd + ' ')
    setComp(EMPTY_COMP)
    inputRef.current?.focus()
  }, [])

  // ── Keyboard handler ──────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab — only complete when no space yet (command name only)
    if (e.key === 'Tab') {
      e.preventDefault()
      const hasSpace = input.includes(' ')
      if (hasSpace) return   // don't attempt arg completion

      const prefix  = input.trimStart()

      // If menu already open, cycle through options
      if (comp.options.length > 0 && prefix === comp.prefix) {
        const next = (comp.idx + 1) % comp.options.length
        setComp(c => ({ ...c, idx: next }))
        setInput(comp.options[next])
        return
      }

      const matches = matchCommands(allCmds, prefix)
      if (!matches.length) return

      if (matches.length === 1) {
        // Single match — fill immediately, no menu
        applyCompletion(matches[0])
        return
      }

      // Multiple matches — open menu, highlight first
      setComp({ options: matches, idx: 0, prefix })
      setInput(matches[0])
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      // If menu open and something highlighted, confirm that choice
      if (comp.options.length > 0 && comp.idx >= 0) {
        applyCompletion(comp.options[comp.idx])
        return
      }
      handleSubmit()
      return
    }

    if (e.key === 'Escape') {
      if (comp.options.length > 0) { setComp(EMPTY_COMP); return }
      setError(null)
      return
    }

    // Arrow keys navigate menu when open
    if (comp.options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (comp.idx + 1) % comp.options.length
        setComp(c => ({ ...c, idx: next }))
        setInput(comp.options[next])
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = (comp.idx - 1 + comp.options.length) % comp.options.length
        setComp(c => ({ ...c, idx: next }))
        setInput(comp.options[next])
        return
      }
    }

    // Regular arrow-up/down: history navigation (only when menu closed)
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const h    = historyRef.current[displayId ?? -1] ?? []
      const next = Math.min(histIdx + 1, h.length - 1)
      setHistIdx(next)
      setInput(h[next] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = histIdx - 1
      if (next < 0) { setHistIdx(-1); setInput(''); return }
      const h = historyRef.current[displayId ?? -1] ?? []
      setHistIdx(next)
      setInput(h[next] ?? '')
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInput(val)
    setError(null)
    // Close menu if user typed past the completion prefix
    if (comp.options.length > 0 && !val.startsWith(comp.prefix)) {
      setComp(EMPTY_COMP)
    }
  }

  return (
    <>
    {modal && (
      <FileTaskModal
        command={modal.command}
        params={modal.params}
        displayId={modal.displayId}
        defaultCwd={modal.defaultCwd}
        onClose={() => { setModal(null); inputRef.current?.focus() }}
      />
    )}
    {socksModal && displayId && (
      <SocksModal
        displayId={displayId}
        activePorts={
          activeCallbackPorts
            .filter(p => p.port_type === 'socks' && p.callback.display_id === displayId)
            .map(p => p.local_port)
        }
        onClose={() => { setSocksModal(false); inputRef.current?.focus() }}
      />
    )}
    {rpfwdModal && displayId && (
      <RpfwdModal
        displayId={displayId}
        activeRpfwds={
          activeCallbackPorts
            .filter(p => p.port_type === 'rpfwd' && p.callback.display_id === displayId)
            .map(p => ({ local_port: p.local_port, remote_ip: p.remote_ip, remote_port: p.remote_port }))
        }
        onClose={() => { setRpfwdModal(false); inputRef.current?.focus() }}
      />
    )}
    {linkModal && displayId && (
      <LinkModal
        displayId={displayId}
        onClose={() => { setLinkModal(false); inputRef.current?.focus() }}
      />
    )}
    {unlinkModal && selectedCallbackId && displayId && (
      <UnlinkModal
        callbackId={selectedCallbackId}
        displayId={displayId}
        onClose={() => { setUnlinkModal(false); inputRef.current?.focus() }}
      />
    )}
    <div className={styles.wrap}>
      {/* ── Error banner ── */}
      {error && (
        <div className={styles.errorBar}>
          <span className={styles.errorText}>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Context status bar (user / CWD / impersonation) ── */}
      {cb && (
        <div className={styles.statusBar}>
          {cwdPath && (
            <span className={styles.statusCwd} title={cwdPath}>
              {cwdPath}
            </span>
          )}
          <span className={styles.statusSpacer} />
          {currentUser && (
            <span
              className={styles.statusUser}
              title="Process user"
              style={impersonatedUser ? { opacity: 0.45 } : undefined}
            >
              {currentUser}
            </span>
          )}
          {impersonatedUser && (
            <>
              <span className={styles.statusArrow}>→</span>
              <span className={styles.statusToken} title={`Impersonating: ${impersonatedUser}`}>
                ⚡ {impersonatedUser}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Tab completion menu (above input) ── */}
      {comp.options.length > 1 && (
        <div ref={menuRef} className={styles.compMenu}>
          {comp.options.map((opt, i) => (
            <button
              key={opt}
              className={`${styles.compItem} ${i === comp.idx ? styles.compItemActive : ''}`}
              onMouseDown={e => { e.preventDefault(); applyCompletion(opt) }}
            >
              <span className={styles.compCmd}>{opt}</span>
              {cmdDescMap[opt] && (
                <span className={styles.compDesc}>{cmdDescMap[opt]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Command input row ── */}
      <div className={styles.cmdBar}>
        <span className={styles.prefix}>{prompt} ›</span>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={targetDisplayIds.length ? 'command [args]…' : 'select a callback first…'}
          disabled={!targetDisplayIds.length || loading}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className={styles.sending}>sending…</span>}
      </div>
    </div>
    </>
  )
}
