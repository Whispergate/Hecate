/* ═══════════════════════════════════════════════════
   src/components/ServicesPanel/ServicesPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react'
import { useSubscription, useMutation, useLazyQuery } from '@apollo/client'
import {
  SUB_PAYLOAD_TYPES,
  SUB_C2_PROFILES,
  SUB_TRANSLATION_CONTAINERS,
  SUB_CONSUMING_SERVICES,
  START_STOP_C2,
  CONTAINER_LIST_FILES,
  CONTAINER_DOWNLOAD_FILE,
  CONTAINER_WRITE_FILE,
  GET_AGENT_COMMANDS,
} from '@/apollo/operations'
import styles from './ServicesPanel.module.css'

// ── Types ──────────────────────────────────────────────

interface PayloadType {
  id: number; name: string; author: string; note: string
  container_running: boolean; wrapper: boolean
  agent_type: string; semver: string; supported_os: string[]
  translationcontainer: { id: number; name: string; container_running: boolean } | null
  wrap_these_payload_types: { wrapped: { name: string } }[]
}

interface C2Profile {
  id: number; name: string; author: string; description: string
  is_p2p: boolean; running: boolean; container_running: boolean; semver: string
  payloadtypec2profiles: { payloadtype: { id: number; name: string; deleted: boolean } }[]
}

interface TranslationContainer {
  id: number; name: string; author: string; description: string
  container_running: boolean; semver: string
  payloadtypes: { id: number; name: string; deleted: boolean }[]
}

interface ConsumingService {
  id: number; name: string; description: string
  type: string; container_running: boolean; semver: string
}

interface AgentCommand {
  id: number; cmd: string; description: string; help_cmd: string; version: number
}

// ── Helpers ────────────────────────────────────────────

function StatusDot({ running }: { running: boolean }) {
  return <span className={`${styles.dot} ${running ? styles.dotOn : styles.dotOff}`} />
}

function Chip({ label }: { label: string }) {
  return <span className={styles.chip}>{label}</span>
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaKey}>{label}</span>
      <span className={styles.metaVal}>{children}</span>
    </div>
  )
}

// ── Config editor modal ────────────────────────────────

function ConfigModal({ containerName, onClose }: { containerName: string; onClose: () => void }) {
  const filename = 'config.json'
  const [content, setContent] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const [fetchFile] = useLazyQuery(CONTAINER_DOWNLOAD_FILE, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerDownloadFile
      if (r?.status === 'success') {
        try { setContent(atob(r.data)) } catch { setContent(r.data) }
      } else setStatus(r?.error ?? 'fetch failed')
    },
    onError(e) { setStatus(e.message) },
  })

  const [writeFile] = useMutation(CONTAINER_WRITE_FILE, {
    onCompleted(data) {
      setSaving(false)
      const r = data?.containerWriteFile
      setStatus(r?.status === 'success' ? 'saved' : (r?.error ?? 'save failed'))
    },
    onError(e) { setSaving(false); setStatus(e.message) },
  })

  useEffect(() => { fetchFile({ variables: { container_name: containerName, filename } }) }, [])

  function save() {
    if (content == null) return
    setSaving(true); setStatus('')
    writeFile({ variables: { container_name: containerName, file_path: filename, data: btoa(content) } })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{containerName} — config.json</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        {content == null && !status && <div className={styles.modalMsg}>loading…</div>}
        {content != null && (
          <textarea
            className={styles.configEditor}
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
          />
        )}
        {status && <div className={styles.modalStatus}>{status}</div>}
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>close</button>
          {content != null && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
              {saving ? 'saving…' : 'save'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Files modal ────────────────────────────────────────

function FilesModal({ containerName, onClose }: { containerName: string; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [status, setStatus] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)

  const [listFiles] = useLazyQuery(CONTAINER_LIST_FILES, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerListFiles
      if (r?.status === 'success') setFiles(r.files ?? [])
      else setStatus(r?.error ?? 'list failed')
    },
    onError(e) { setStatus(e.message) },
  })

  const [fetchFile] = useLazyQuery(CONTAINER_DOWNLOAD_FILE, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerDownloadFile
      if (r?.status === 'success') {
        try { setFileContent(atob(r.data)) } catch { setFileContent(r.data) }
      } else setStatus(r?.error ?? 'fetch failed')
    },
    onError(e) { setStatus(e.message) },
  })

  useEffect(() => { listFiles({ variables: { container_name: containerName } }) }, [])

  function openFile(f: string) {
    setViewing(f); setFileContent(null)
    fetchFile({ variables: { container_name: containerName, filename: f } })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            {containerName} — {viewing ?? 'files'}
          </span>
          {viewing && (
            <button className={styles.btn} onClick={() => { setViewing(null); setFileContent(null) }}>
              ← back
            </button>
          )}
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        {!viewing && (
          <>
            {files == null && !status && <div className={styles.modalMsg}>loading…</div>}
            {status && <div className={styles.modalStatus}>{status}</div>}
            {files != null && files.length === 0 && <div className={styles.modalMsg}>no files</div>}
            {files != null && files.length > 0 && (
              <div className={styles.fileList}>
                {files.map(f => (
                  <button key={f} className={styles.fileItem} onClick={() => openFile(f)}>{f}</button>
                ))}
              </div>
            )}
          </>
        )}

        {viewing && (
          <>
            {fileContent == null && <div className={styles.modalMsg}>loading…</div>}
            {fileContent != null && <pre className={styles.fileViewPre}>{fileContent}</pre>}
          </>
        )}

        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>close</button>
        </div>
      </div>
    </div>
  )
}

// ── Commands panel (inline, not modal) ─────────────────

function CommandsPanel({ agentName }: { agentName: string }) {
  const [commands, setCommands] = useState<AgentCommand[] | null>(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const [fetchCmds] = useLazyQuery(GET_AGENT_COMMANDS, {
    fetchPolicy: 'network-only',
    onCompleted(data) { setCommands(data?.command ?? []) },
    onError(e) { setStatus(e.message) },
  })

  useEffect(() => { fetchCmds({ variables: { payload_name: agentName } }) }, [])

  const filtered = useMemo(() => {
    if (!commands) return []
    const q = search.toLowerCase()
    return q ? commands.filter(c =>
      c.cmd.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    ) : commands
  }, [commands, search])

  if (status) return <div className={styles.inlineMsg}>{status}</div>
  if (!commands) return <div className={styles.inlineMsg}>loading commands…</div>

  return (
    <div className={styles.cmdPanel}>
      <div className={styles.cmdSearch}>
        <input
          className={styles.searchInput}
          placeholder={`search ${commands.length} commands…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.cmdList}>
        {filtered.length === 0 && <div className={styles.inlineMsg}>no results</div>}
        {filtered.map(c => (
          <div key={c.id} className={styles.cmdItem}>
            <div
              className={styles.cmdHeader}
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            >
              <span className={styles.cmdName}>{c.cmd}</span>
              {c.version > 0 && <span className={styles.semver}>v{c.version}</span>}
              <span className={styles.chevron}>{expanded === c.id ? '▾' : '▸'}</span>
            </div>
            {expanded === c.id && (
              <div className={styles.cmdBody}>
                {c.description && <div className={styles.cmdDesc}>{c.description}</div>}
                {c.help_cmd    && <pre className={styles.cmdHelp}>{c.help_cmd}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────

type DetailView = 'info' | 'commands' | 'files'

function DetailPanel({
  name, author, description, semver, container_running,
  docsPath, showCommands, showConfig, showStart, c2Id, c2Running,
  extra,
}: {
  name: string
  author?: string
  description?: string
  semver?: string
  container_running: boolean
  docsPath?: string
  showCommands?: boolean
  showConfig?: boolean
  showStart?: boolean
  c2Id?: number
  c2Running?: boolean
  extra?: React.ReactNode
}) {
  const [view, setView] = useState<DetailView>('info')
  const [modal, setModal] = useState<'config' | 'files' | null>(null)
  const [c2Status, setC2Status] = useState('')

  const [startStop, { loading: toggling }] = useMutation(START_STOP_C2, {
    onCompleted(data) {
      const r = data?.startStopProfile
      setC2Status(r?.status === 'success' ? '' : (r?.error ?? 'failed'))
    },
    onError(e) { setC2Status(e.message) },
  })

  function toggleC2() {
    if (c2Id == null) return
    setC2Status('')
    startStop({ variables: { id: c2Id, action: c2Running ? 'stop' : 'start' } })
  }

  return (
    <div className={styles.detail}>
      {/* header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <StatusDot running={container_running} />
          <span className={styles.detailName}>{name}</span>
          {semver && <span className={styles.semver}>{semver}</span>}
        </div>
        <div className={styles.detailActions}>
          {showStart && c2Id != null && (
            <button
              className={`${styles.btn} ${c2Running ? styles.btnStop : styles.btnStart}`}
              onClick={toggleC2}
              disabled={toggling}
            >
              {toggling ? '…' : c2Running ? 'stop' : 'start'}
            </button>
          )}
          {showConfig && (
            <button className={styles.btn} onClick={() => setModal('config')}>config</button>
          )}
          <button className={styles.btn} onClick={() => setModal('files')}>files</button>
          {docsPath && (
            <a className={styles.btn} href={docsPath} target="_blank" rel="noreferrer">docs</a>
          )}
          {c2Status && <span className={styles.errMsg}>{c2Status}</span>}
        </div>
      </div>

      {/* sub-tabs */}
      <div className={styles.detailTabs}>
        <button
          className={`${styles.subTab} ${view === 'info' ? styles.subTabActive : ''}`}
          onClick={() => setView('info')}
        >
          info
        </button>
        {showCommands && (
          <button
            className={`${styles.subTab} ${view === 'commands' ? styles.subTabActive : ''}`}
            onClick={() => setView('commands')}
          >
            commands
          </button>
        )}
      </div>

      {/* body */}
      <div className={styles.detailBody}>
        {view === 'info' && (
          <div className={styles.infoSection}>
            {description && <p className={styles.descText}>{description}</p>}
            {author  && <MetaRow label="author">{author}</MetaRow>}
            {extra}
          </div>
        )}
        {view === 'commands' && showCommands && (
          <CommandsPanel agentName={name} />
        )}
      </div>

      {modal === 'config' && showConfig && (
        <ConfigModal containerName={name} onClose={() => setModal(null)} />
      )}
      {modal === 'files' && (
        <FilesModal containerName={name} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

// ── List row ───────────────────────────────────────────

function ListRow({
  name, running, selected, badges, onClick,
}: {
  name: string; running: boolean; selected: boolean
  badges?: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      className={`${styles.listRow} ${selected ? styles.listRowActive : ''}`}
      onClick={onClick}
    >
      <StatusDot running={running} />
      <span className={styles.listName}>{name}</span>
      {badges}
    </button>
  )
}

// ── Tab panels ─────────────────────────────────────────

function AgentsPane() {
  const { data } = useSubscription(SUB_PAYLOAD_TYPES)
  const types: PayloadType[] = data?.payloadtype ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = types.find(t => t.id === sel) ?? types[0] ?? null

  if (!types.length) return <div className={styles.empty}>No agent containers registered.</div>

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {types.map(pt => (
          <ListRow
            key={pt.id}
            name={pt.name}
            running={pt.container_running}
            selected={(sel ?? types[0]?.id) === pt.id}
            onClick={() => setSel(pt.id)}
            badges={<>
              {pt.wrapper && <span className={styles.badge}>WRAP</span>}
              {pt.agent_type && pt.agent_type !== 'agent' && (
                <span className={styles.badge}>{pt.agent_type.toUpperCase()}</span>
              )}
            </>}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.note}
          semver={selected.semver}
          container_running={selected.container_running}
          docsPath={`/docs/${selected.wrapper ? 'wrappers' : 'agents'}/${selected.name.toLowerCase()}`}
          showCommands={!selected.wrapper}
          extra={<>
            {selected.supported_os?.length > 0 && (
              <MetaRow label="os">
                <div className={styles.chips}>
                  {selected.supported_os.map(o => <Chip key={o} label={o} />)}
                </div>
              </MetaRow>
            )}
            {selected.translationcontainer && (
              <MetaRow label="translation">
                <StatusDot running={selected.translationcontainer.container_running} />
                {' '}{selected.translationcontainer.name}
              </MetaRow>
            )}
            {selected.wrap_these_payload_types.length > 0 && (
              <MetaRow label="wraps">
                {selected.wrap_these_payload_types.map(w => w.wrapped.name).join(', ')}
              </MetaRow>
            )}
          </>}
        />
      )}
    </div>
  )
}

function C2Pane() {
  const { data } = useSubscription(SUB_C2_PROFILES)
  const profiles: C2Profile[] = data?.c2profile ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = profiles.find(p => p.id === sel) ?? profiles[0] ?? null

  if (!profiles.length) return <div className={styles.empty}>No C2 profiles registered.</div>

  const agents = selected?.payloadtypec2profiles.filter(x => !x.payloadtype.deleted).map(x => x.payloadtype.name) ?? []

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {profiles.map(p => (
          <ListRow
            key={p.id}
            name={p.name}
            running={p.container_running}
            selected={(sel ?? profiles[0]?.id) === p.id}
            onClick={() => setSel(p.id)}
            badges={<>
              {p.is_p2p && <span className={styles.badge}>P2P</span>}
              <span className={`${styles.badge} ${p.running ? styles.badgeOn : styles.badgeOff}`}>
                {p.running ? 'on' : 'off'}
              </span>
            </>}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.description}
          semver={selected.semver}
          container_running={selected.container_running}
          docsPath={`/docs/c2-profiles/${selected.name.toLowerCase()}`}
          showConfig
          showStart
          c2Id={selected.id}
          c2Running={selected.running}
          extra={agents.length > 0 && (
            <MetaRow label="agents">
              <div className={styles.chips}>
                {agents.map(a => <Chip key={a} label={a} />)}
              </div>
            </MetaRow>
          )}
        />
      )}
    </div>
  )
}

function TranslationPane() {
  const { data } = useSubscription(SUB_TRANSLATION_CONTAINERS)
  const containers: TranslationContainer[] = data?.translationcontainer ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = containers.find(c => c.id === sel) ?? containers[0] ?? null

  if (!containers.length) return <div className={styles.empty}>No translation containers registered.</div>

  const activeTypes = selected?.payloadtypes.filter(p => !p.deleted) ?? []

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {containers.map(tc => (
          <ListRow
            key={tc.id}
            name={tc.name}
            running={tc.container_running}
            selected={(sel ?? containers[0]?.id) === tc.id}
            onClick={() => setSel(tc.id)}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.description}
          semver={selected.semver}
          container_running={selected.container_running}
          extra={activeTypes.length > 0 && (
            <MetaRow label="agents">
              <div className={styles.chips}>
                {activeTypes.map(p => <Chip key={p.id} label={p.name} />)}
              </div>
            </MetaRow>
          )}
        />
      )}
    </div>
  )
}

function ConsumingPane() {
  const { data } = useSubscription(SUB_CONSUMING_SERVICES)
  const services: ConsumingService[] = data?.consuming_container ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = services.find(s => s.id === sel) ?? services[0] ?? null

  if (!services.length) return <div className={styles.empty}>No consuming services registered.</div>

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {services.map(s => (
          <ListRow
            key={s.id}
            name={s.name}
            running={s.container_running}
            selected={(sel ?? services[0]?.id) === s.id}
            onClick={() => setSel(s.id)}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          description={selected.description}
          semver={selected.semver}
          container_running={selected.container_running}
          extra={selected.type && (
            <MetaRow label="type">{selected.type}</MetaRow>
          )}
        />
      )}
    </div>
  )
}

// ── Panel root ─────────────────────────────────────────

type Tab = 'agents' | 'c2' | 'translation' | 'consuming'

export function ServicesPanel() {
  const [tab, setTab] = useState<Tab>('agents')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'agents',      label: 'Agents' },
    { id: 'c2',          label: 'C2 Profiles' },
    { id: 'translation', label: 'Translation' },
    { id: 'consuming',   label: 'Consuming' },
  ]

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Installed Services</span>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {tab === 'agents'      && <AgentsPane />}
        {tab === 'c2'          && <C2Pane />}
        {tab === 'translation' && <TranslationPane />}
        {tab === 'consuming'   && <ConsumingPane />}
      </div>
    </div>
  )
}
