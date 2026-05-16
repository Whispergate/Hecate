/* ═══════════════════════════════════════════════════
   src/components/CommandBar/SnippetPopup.tsx
   Snippet library — search, pick, edit, delete.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  loadSnippets, addSnippet, updateSnippet, removeSnippet,
  type Snippet,
} from './snippetStore'
import styles from './SnippetPopup.module.css'

interface Props {
  onPick:  (command: string) => void
  onClose: () => void
}

export function SnippetPopup({ onPick, onClose }: Props) {
  const [snippets, setSnippets] = useState<Snippet[]>(() => loadSnippets())
  const [filter,   setFilter]   = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  // Editor state — when set, footer shows edit form
  const [editing, setEditing] = useState<{ id: string | null; name: string; command: string } | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const editNameRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const lc = filter.toLowerCase().trim()
    if (!lc) return snippets
    return snippets.filter(s =>
      s.name.toLowerCase().includes(lc) || s.command.toLowerCase().includes(lc)
    )
  }, [snippets, filter])

  useEffect(() => { setActiveIdx(0) }, [filter])

  useEffect(() => {
    if (editing && editNameRef.current) editNameRef.current.focus()
  }, [editing])

  // Keep activeIdx in range when list shrinks
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1))
  }, [filtered.length, activeIdx])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function startNew() {
    setEditing({ id: null, name: '', command: filter.trim() })
  }

  function startEdit(s: Snippet) {
    setEditing({ id: s.id, name: s.name, command: s.command })
  }

  function saveEdit() {
    if (!editing) return
    const name = editing.name.trim()
    const command = editing.command.trim()
    if (!name || !command) return
    if (editing.id) updateSnippet(editing.id, name, command)
    else            addSnippet(name, command)
    setSnippets(loadSnippets())
    setEditing(null)
  }

  function handleDelete(id: string) {
    removeSnippet(id)
    setSnippets(loadSnippets())
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editing) { setEditing(null); searchRef.current?.focus(); return }
      onClose()
      return
    }
    if (editing) return  // edit form handles its own keys

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const s = filtered[activeIdx]
      if (s) onPick(s.command)
      return
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={handleKey}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>snippets</span>
          <span className={styles.hint}>↑↓ Enter to insert · Esc to close</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <input
          ref={searchRef}
          className={styles.search}
          type="text"
          placeholder="search snippets…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />

        <div className={styles.list} ref={listRef}>
          {filtered.length === 0 && (
            <div className={styles.empty}>
              {snippets.length === 0 ? 'No snippets yet — add one below.' : 'No matches.'}
            </div>
          )}
          {filtered.map((s, i) => (
            <div
              key={s.id}
              className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onPick(s.command)}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemName}>{s.name}</span>
                <span className={styles.itemCmd}>{s.command}</span>
              </div>
              <div className={styles.itemBtns} onClick={e => e.stopPropagation()}>
                <button className={styles.iconBtn} onClick={() => startEdit(s)}>edit</button>
                <button
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => handleDelete(s.id)}
                >
                  del
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          {!editing && (
            <button className={styles.cancelBtn} onClick={startNew}>+ new snippet</button>
          )}
          {editing && (
            <>
              <div className={styles.editRow}>
                <input
                  ref={editNameRef}
                  className={`${styles.input} ${styles.inputName}`}
                  type="text"
                  placeholder="name"
                  value={editing.name}
                  onChange={e => setEditing(s => s && { ...s, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                  autoComplete="off"
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="command"
                  value={editing.command}
                  onChange={e => setEditing(s => s && { ...s, command: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className={styles.editRow}>
                <button className={styles.cancelBtn} onClick={() => setEditing(null)}>cancel</button>
                <button
                  className={styles.saveBtn}
                  onClick={saveEdit}
                  disabled={!editing.name.trim() || !editing.command.trim()}
                >
                  {editing.id ? 'save' : 'add'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
