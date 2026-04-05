/* ═══════════════════════════════════════════════════
   src/components/CommandBar/CommandBar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useRef, useCallback } from 'react'
import { useMutation }  from '@apollo/client'
import { CREATE_TASK }  from '@/apollo/operations'
import { useStore }     from '@/store'
import styles           from './CommandBar.module.css'

export function CommandBar() {
  const [input,   setInput]   = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const [history, setHistory] = useState<string[]>([])
  const [error,   setError]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { selectedCallbackId, callbacks } = useStore()

  // Use display_id — Mythic's createTask takes display_id, not internal id
  const cb         = callbacks.find(c => c.id === selectedCallbackId)
  const displayId  = cb?.display_id ?? null
  const prompt     = cb ? `${cb.host}` : 'hecate'

  const [createTask, { loading }] = useMutation(CREATE_TASK, {
    onError: (err) => setError(err.message),
  })

  const handleSubmit = useCallback(async () => {
    const raw = input.trim()
    if (!raw || !displayId) return

    setError(null)

    // Split into command + raw params — Mythic handles further parsing
    const spaceIdx = raw.indexOf(' ')
    const command  = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)
    const params   = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1)

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
  }, [input, displayId, createTask])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (e.key === 'Escape') {
      setError(null)
      return
    }
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

  return (
    <div className={styles.wrap}>
      {error && (
        <div className={styles.errorBar}>
          <span className={styles.errorText}>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
        </div>
      )}
      <div className={styles.cmdBar}>
        <span className={styles.prefix}>{prompt} ›</span>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setError(null) }}
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
  )
}
