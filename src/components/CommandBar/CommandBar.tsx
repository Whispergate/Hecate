/* ═══════════════════════════════════════════════════
   src/components/CommandBar/CommandBar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery }                    from '@apollo/client'
import { CREATE_TASK, GET_COMMANDS }                from '@/apollo/operations'
import { useStore }                                 from '@/store'
import { FileTaskModal, type CommandParam }         from './FileTaskModal'
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
  const [input,   setInput]   = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const [history, setHistory] = useState<string[]>([])
  const [error,   setError]   = useState<string | null>(null)
  const [comp,    setComp]    = useState<CompletionState>(EMPTY_COMP)
  const [modal,   setModal]   = useState<ModalState | null>(null)

  const inputRef  = useRef<HTMLInputElement>(null)
  const menuRef   = useRef<HTMLDivElement>(null)

  const { selectedCallbackId, callbacks } = useStore()

  const cb        = callbacks.find(c => c.id === selectedCallbackId)
  const displayId = cb?.display_id ?? null
  const prompt    = cb ? `${cb.host}` : 'hecate'
  const agentName = cb?.payload.payloadtype.name ?? ''

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
  // Map command name → parameter list (for file-param detection)
  const cmdParamsMap: Record<string, CommandParam[]> = Object.fromEntries(
    (cmdData?.command ?? []).map((c: RawCmd) => [c.cmd, c.commandparameters ?? []])
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

  // ── Submit ────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const raw = input.trim()
    if (!raw || !displayId) return

    setError(null)
    setComp(EMPTY_COMP)

    const spaceIdx = raw.indexOf(' ')
    const command  = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)
    const params   = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1)

    // Only intercept when no args typed — user-supplied args mean they know what they're doing
    if (!params) {
      const cmdParams         = cmdParamsMap[command] ?? []
      const hasRequiredFile   = cmdParams.some(
        p => (p.type === 'File' || p.type === 'FileMultiple') && p.required
      )
      const hasRequiredCred   = cmdParams.some(
        p => p.type === 'CredentialJson' && p.required
      )

      if (hasRequiredFile || hasRequiredCred) {
        // Open modal — it handles upload + task creation
        setHistory(h => [raw, ...h.slice(0, 99)])
        setHistIdx(-1)
        setInput('')
        setModal({ command, params: cmdParams, displayId, defaultCwd: extractCwd(cb?.extra_info ?? '', cb?.description ?? '') })
        return
      }
    }

    setHistory(h => [raw, ...h.slice(0, 99)])
    setHistIdx(-1)
    setInput('')

    const result = await createTask({
      variables: {
        callback_id:      displayId,
        command,
        params,
        tasking_location: 'command_line',
        original_params:  params,
      },
    }).catch(() => null)

    if (result?.data?.createTask?.status === 'error') {
      setError(result.data.createTask.error ?? 'Task creation failed')
    }
  }, [input, displayId, createTask, cmdParamsMap])

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
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setInput(history[next] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = histIdx - 1
      if (next < 0) { setHistIdx(-1); setInput(''); return }
      setHistIdx(next)
      setInput(history[next] ?? '')
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
    <div className={styles.wrap}>
      {/* ── Error banner ── */}
      {error && (
        <div className={styles.errorBar}>
          <span className={styles.errorText}>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
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
          placeholder={selectedCallbackId ? 'command [args]…' : 'select a callback first…'}
          disabled={!selectedCallbackId || loading}
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
