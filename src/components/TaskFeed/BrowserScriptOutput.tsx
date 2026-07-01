/* src/components/TaskFeed/BrowserScriptOutput.tsx
   Runs a task's Mythic browserscript and renders the structured result. This is
   the generic, spec-conforming replacement for the old per-command table
   configs: fetch the command's active browserscript, run script(task, responses)
   and render whatever it returns (plaintext / table / media / download / search
   / graph / tabs). If the command has no script — or it errors / returns empty —
   we render the caller's plaintext fallback, matching Mythic's behaviour.
*/

import { useState, type ReactNode } from 'react'
import { useQuery } from '@apollo/client'
import { GET_BROWSER_SCRIPT } from '@/apollo/operations'
import type { Task } from '@/store'
import {
  compileScript, runScript,
  type BSResult, type BSMedia, type BSDownload, type BSSearch,
  type BSGraph, type BSTab,
} from './browserScript'
import { BrowserScriptTable } from './BrowserScriptTable'
import styles from './BrowserScript.module.css'

interface Props {
  task:      Task
  responses: string[]   // decoded response-text chunks
  fallback:  ReactNode  // plaintext view when no/empty browserscript
}

export function BrowserScriptOutput({ task, responses, fallback }: Props) {
  const commandId = task.command?.id
  const { data, loading } = useQuery(GET_BROWSER_SCRIPT, {
    variables: { command_id: commandId },
    skip: !commandId,
  })

  if (!commandId || loading) return <>{fallback}</>

  const source = data?.browserscript?.[0]?.script as string | undefined
  if (!source) return <>{fallback}</>

  const fn = compileScript(commandId, source)
  if (!fn) return <>{fallback}</>

  const result = runScript(fn, {
    id: task.id, display_id: task.display_id, status: task.status,
    command_name: task.command_name, callback_id: task.callback.id,
  }, responses)
  if (!result) return <>{fallback}</>

  return <ResultView result={result} task={task} />
}

// ── Result → renderers ────────────────────────────────

function ResultView({ result, task }: { result: BSResult; task: Task }) {
  const ctx = { callbackId: task.callback.id, callbackDisplayId: task.callback.display_id }
  return (
    <div className={styles.result}>
      {result.plaintext !== undefined && <pre className={styles.plain}>{result.plaintext}</pre>}

      {result.table?.map((t, i) => <BrowserScriptTable key={`t${i}`} table={t} ctx={ctx} />)}

      {[...(result.screenshot ?? []), ...(result.media ?? [])].map((m, i) => (
        <MediaView key={`m${i}`} media={m} />
      ))}

      {result.download?.map((d, i) => <DownloadView key={`d${i}`} dl={d} />)}
      {result.search?.map((s, i) => <SearchView key={`s${i}`} search={s} />)}
      {result.graph && <GraphView graph={result.graph} />}
      {result.tabs && result.tabs.length > 0 && <TabsView tabs={result.tabs} task={task} />}
    </div>
  )
}

// Media / screenshot → inline image (Mythic streams via file id). Non-image
// files just get a download link. ponytail: no ace/hex/sql viewers — download
// covers the rest; add a viewer when a real need shows up.
function MediaView({ media }: { media: BSMedia }) {
  const [failed, setFailed] = useState(false)
  const url = `/direct/download/${media.agent_file_id}`
  const name = media.filename || media.name || media.agent_file_id.slice(0, 8)
  if (failed) return <a className={styles.dlLink} href={url} target="_blank" rel="noreferrer">⬇ {name}</a>
  return (
    <div className={styles.mediaWrap}>
      {media.plaintext && <pre className={styles.plain}>{media.plaintext}</pre>}
      <a href={url} target="_blank" rel="noreferrer">
        <img className={styles.mediaImg} src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />
      </a>
    </div>
  )
}

function DownloadView({ dl }: { dl: BSDownload }) {
  return (
    <div className={styles.dlRow}>
      {dl.plaintext && <span className={styles.plain}>{dl.plaintext}</span>}
      <a className={styles.dlLink} href={`/direct/download/${dl.agent_file_id}`} target="_blank" rel="noreferrer" download
         title={dl.hoverText || 'Download file'}>⬇ {dl.name || 'download'}</a>
    </div>
  )
}

function SearchView({ search }: { search: BSSearch }) {
  return (
    <div className={styles.dlRow}>
      {search.plaintext && <span className={styles.plain}>{search.plaintext}</span>}
      <a className={styles.dlLink} href={`/search?${search.search}`} target="_blank" rel="noreferrer"
         title={search.hoverText || 'View on search page'}>🔍 {search.name || 'search'}</a>
    </div>
  )
}

// ponytail: no graph layout lib in Hecate — list nodes + edges rather than pull
// in cytoscape/d3. Upgrade to a real viz if graph output becomes common.
function GraphView({ graph }: { graph: BSGraph }) {
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []
  return (
    <div className={styles.graphBox}>
      <div className={styles.title}>graph · {nodes.length} nodes · {edges.length} edges</div>
      <div className={styles.graphList}>
        {edges.map((e, i) => <div key={i}>{e.source} → {e.target}</div>)}
        {edges.length === 0 && nodes.map((n, i) => <div key={i}>{n.name || n.id}</div>)}
      </div>
    </div>
  )
}

function TabsView({ tabs, task }: { tabs: BSTab[]; task: Task }) {
  const [active, setActive] = useState(0)
  return (
    <div className={styles.tabs}>
      <div className={styles.tabBar}>
        {tabs.map((t, i) => (
          <button key={i} className={`${styles.tabBtn} ${i === active ? styles.tabActive : ''}`}
                  onClick={() => setActive(i)}>{t.label || t.name || `tab ${i + 1}`}</button>
        ))}
      </div>
      <ResultView result={tabs[active]} task={task} />
    </div>
  )
}
