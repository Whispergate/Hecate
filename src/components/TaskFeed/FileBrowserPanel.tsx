/* src/components/TaskFeed/FileBrowserPanel.tsx
   File browser backed by mythictree — Mythic's Go server writes structured
   entries there whenever an agent runs ls, regardless of tasking_location.
   No response-text parsing; all path handling lives in Postgres/Hasura.
*/

import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react'
import { useQuery, useSubscription, useMutation } from '@apollo/client'
import { GET_MYTHIC_TREE, SUB_MYTHIC_TREE, CREATE_TASK } from '@/apollo/operations'
import { isTextFile } from './FileBrowser'
import styles from './FileBrowserPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface TreeNode {
  id:               number
  full_path_text:   string
  parent_path_text: string
  name_text:        string
  can_have_children: boolean
  has_children:     boolean
  success:          boolean | null
  deleted:          boolean
  host:             string
  metadata:         { access_time?: number; modify_time?: number; size?: number } | null
  filemeta:         { agent_file_id: string }[]
}

// ── Formatters ────────────────────────────────────────

function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024)       return `${bytes}B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)}k`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}M`
  return `${(bytes / 1073741824).toFixed(2)}G`
}

// ── DirRow ────────────────────────────────────────────

function DirRow({
  node, depth, nodesRef, byParentRef, expanded, onToggle, onLs, onIssue,
}: {
  node:        TreeNode
  depth:       number
  nodesRef:    React.MutableRefObject<Map<string, TreeNode>>
  byParentRef: React.MutableRefObject<Map<string, string[]>>
  expanded:    Set<string>
  onToggle:    (p: string) => void
  onLs:        (p: string) => void
  onIssue:     (cmd: string, params: string) => void
}) {
  const path      = node.full_path_text
  const isOpen    = expanded.has(path)
  const childKeys = byParentRef.current.get(path) ?? []
  const hasLoaded = byParentRef.current.has(path)

  const subdirs = childKeys
    .map(p => nodesRef.current.get(p))
    .filter((n): n is TreeNode => !!n && n.can_have_children && !n.deleted)
    .sort((a, b) => a.name_text.localeCompare(b.name_text))

  const files = childKeys
    .map(p => nodesRef.current.get(p))
    .filter((n): n is TreeNode => !!n && !n.can_have_children && !n.deleted)
    .sort((a, b) => a.name_text.localeCompare(b.name_text))

  const handleClick = () => {
    if (!hasLoaded) onLs(path)
    else            onToggle(path)
  }

  return (
    <div className={styles.treeNode}>
      <div
        className={styles.dirRow}
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={handleClick}
      >
        <span className={`${styles.arrow} ${hasLoaded ? styles.arrowLoaded : styles.arrowUnloaded}`}>
          {hasLoaded ? (isOpen ? '▾' : '▸') : '▹'}
        </span>
        <span className={styles.dirIcon}>{hasLoaded ? '📂' : '📁'}</span>
        <span className={hasLoaded ? styles.dirName : styles.dirNameUnloaded}>{node.name_text}</span>
        {!hasLoaded && (
          <button
            className={styles.lsBtn}
            onClick={e => { e.stopPropagation(); onLs(path) }}
            title={`ls ${path}`}
          >ls</button>
        )}
        {hasLoaded && (
          <span className={styles.dirMeta}>{subdirs.length}d · {files.length}f</span>
        )}
      </div>

      {isOpen && hasLoaded && (
        <div className={styles.treeChildren}>
          {subdirs.map(sub => (
            <DirRow
              key={sub.full_path_text}
              node={sub}
              depth={depth + 1}
              nodesRef={nodesRef}
              byParentRef={byParentRef}
              expanded={expanded}
              onToggle={onToggle}
              onLs={onLs}
              onIssue={onIssue}
            />
          ))}
          {files.map(f => (
            <FileRow key={f.full_path_text} node={f} depth={depth + 1} onIssue={onIssue} />
          ))}
          {subdirs.length === 0 && files.length === 0 && (
            <div className={styles.emptyDir} style={{ paddingLeft: (depth + 1) * 14 + 6 }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── FileRow ───────────────────────────────────────────

function FileRow({
  node, depth, onIssue,
}: {
  node:    TreeNode
  depth:   number
  onIssue: (cmd: string, params: string) => void
}) {
  const size = node.metadata?.size
  return (
    <div className={styles.fileRow} style={{ paddingLeft: depth * 14 + 6 }}>
      <span className={styles.fileIcon}>📄</span>
      <span className={styles.fileName}>{node.name_text}</span>
      {!!size && <span className={styles.fileSize}>{fmtSize(size)}</span>}
      <div className={styles.fileActions}>
        {isTextFile(node.name_text) && (
          <button
            className={`${styles.actBtn} ${styles.actCat}`}
            onClick={e => { e.stopPropagation(); onIssue('cat', node.full_path_text) }}
            title={`cat ${node.full_path_text}`}
          >cat</button>
        )}
        <button
          className={styles.actBtn}
          onClick={e => { e.stopPropagation(); onIssue('download', node.full_path_text) }}
          title={`download ${node.full_path_text}`}
        >↓ dl</button>
      </div>
    </div>
  )
}

// ── FileBrowserPanel ──────────────────────────────────

interface Props {
  callbackId:        number   // internal id — used for mythictree query/subscription
  callbackDisplayId: number   // display_id  — used for createTask mutation
}

export function FileBrowserPanel({ callbackId, callbackDisplayId }: Props) {
  // Timestamp captured at mount — subscription cursor starts here so we only
  // receive new/updated nodes; the initial query covers everything before.
  const fromNow     = useRef(new Date().toISOString())

  // Keyed by full_path_text. Mutated in place; forceUpdate triggers re-render.
  const nodesRef    = useRef<Map<string, TreeNode>>(new Map())
  const byParentRef = useRef<Map<string, string[]>>(new Map())

  const [, forceUpdate] = useReducer(x => x + 1, 0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery]       = useState('')

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

  // Merge incoming nodes into refs, auto-expand parents that just got children.
  const mergeNodes = useCallback((incoming: TreeNode[]) => {
    const newParents = new Set<string>()

    for (const node of incoming) {
      if (node.deleted) {
        nodesRef.current.delete(node.full_path_text)
        const siblings = byParentRef.current.get(node.parent_path_text)
        if (siblings) {
          const idx = siblings.indexOf(node.full_path_text)
          if (idx >= 0) siblings.splice(idx, 1)
        }
      } else {
        nodesRef.current.set(node.full_path_text, node)
        const parent = node.parent_path_text
        if (!byParentRef.current.has(parent)) {
          byParentRef.current.set(parent, [])
        }
        const siblings = byParentRef.current.get(parent)!
        if (!siblings.includes(node.full_path_text)) {
          siblings.push(node.full_path_text)
          newParents.add(parent)
        }
      }
    }

    if (newParents.size > 0) {
      setExpanded(prev => new Set([...prev, ...newParents]))
    } else {
      forceUpdate()
    }
  }, [])

  // Initial load
  const { data: initialData } = useQuery(GET_MYTHIC_TREE, {
    variables:   { callback_id: callbackId },
    skip:        !callbackId,
    fetchPolicy: 'network-only',
  })
  useEffect(() => {
    if (initialData?.mythictree?.length) mergeNodes(initialData.mythictree)
  }, [initialData])

  // Live stream for new/updated/deleted nodes
  useSubscription(SUB_MYTHIC_TREE, {
    variables: { callback_id: callbackId, now: fromNow.current },
    skip:      !callbackId,
    onData:    ({ data }) => {
      const nodes = data.data?.mythictree_stream
      if (nodes?.length) mergeNodes(nodes)
    },
  })

  const handleLs = useCallback((path: string) => issueCmd('ls', path), [issueCmd])

  const handleToggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const handleClear = () => {
    nodesRef.current.clear()
    byParentRef.current.clear()
    setExpanded(new Set())
    forceUpdate()
  }

  // Root nodes are those whose parent_path is ""
  const rootKeys = byParentRef.current.get('') ?? []
  const roots = rootKeys
    .map(p => nodesRef.current.get(p))
    .filter((n): n is TreeNode => !!n && !n.deleted)
    .sort((a, b) => a.full_path_text.localeCompare(b.full_path_text))

  const totalDirs  = [...nodesRef.current.values()].filter(n => n.can_have_children).length
  const totalFiles = [...nodesRef.current.values()].filter(n => !n.can_have_children).length

  // Flat search results — match name or full path
  const searchResults = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    return [...nodesRef.current.values()]
      .filter(n => !n.deleted && (
        n.name_text.toLowerCase().includes(q) ||
        n.full_path_text.toLowerCase().includes(q)
      ))
      .sort((a, b) => a.full_path_text.localeCompare(b.full_path_text))
  }, [query, totalDirs, totalFiles]) // re-derive when tree contents change

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>File Browser</span>
        <span className={styles.toolbarMeta}>{totalDirs}d · {totalFiles}f</span>
        <input
          className={styles.searchInput}
          placeholder="/ search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setQuery('')}
          spellCheck={false}
        />
        <button className={styles.clearBtn} onClick={handleClear} title="Clear tree">
          ✕ clear
        </button>
      </div>

      <div className={styles.tree}>
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className={styles.empty}>No matches for "{query}"</div>
          ) : (
            searchResults.map(n => (
              n.can_have_children ? (
                <div key={n.full_path_text} className={styles.flatRow}>
                  <span className={styles.flatIcon}>📂</span>
                  <span className={styles.flatName}>{n.name_text}</span>
                  <span className={styles.flatPath}>{n.parent_path_text}</span>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.actBtn}
                      onClick={() => { setQuery(''); handleLs(n.full_path_text) }}
                      title={`ls ${n.full_path_text}`}
                    >→ ls</button>
                  </div>
                </div>
              ) : (
                <div key={n.full_path_text} className={styles.flatRow}>
                  <span className={styles.flatIcon}>📄</span>
                  <span className={styles.flatName}>{n.name_text}</span>
                  <span className={styles.flatPath}>{n.parent_path_text}</span>
                  <div className={styles.fileActions}>
                    {isTextFile(n.name_text) && (
                      <button
                        className={`${styles.actBtn} ${styles.actCat}`}
                        onClick={() => issueCmd('cat', n.full_path_text)}
                      >cat</button>
                    )}
                    <button
                      className={styles.actBtn}
                      onClick={() => issueCmd('download', n.full_path_text)}
                    >↓ dl</button>
                  </div>
                </div>
              )
            ))
          )
        ) : roots.length === 0 ? (
          <div className={styles.empty}>
            No directories explored yet — run <code className={styles.code}>ls</code> to populate the tree.
          </div>
        ) : (
          roots.map(r => (
            <DirRow
              key={r.full_path_text}
              node={r}
              depth={0}
              nodesRef={nodesRef}
              byParentRef={byParentRef}
              expanded={expanded}
              onToggle={handleToggle}
              onLs={handleLs}
              onIssue={issueCmd}
            />
          ))
        )}
      </div>
    </div>
  )
}
