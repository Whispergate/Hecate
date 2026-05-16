/* ═══════════════════════════════════════════════════
   src/components/AttackPanel/AttackPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useLazyQuery }         from '@apollo/client'
import { GET_ATTACK, GET_ATTACK_COMMANDS, GET_ATTACK_TASKS } from '@/apollo/operations'
import { agentColor } from '@/agentColor'
import styles from './AttackPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface AttackRow {
  id:     number
  t_num:  string
  name:   string
  os:     string   // raw JSON string from DB
  tactic: string   // raw JSON string from DB
}

interface AttackTechnique {
  id:      number
  t_num:   string
  name:    string
  os:      string[]
  tactics: string[]
}

interface OverlayCommand {
  cmd:         string
  payloadtype: { name: string }
}

interface OverlayTask {
  id:             number
  display_id:     number
  command_name:   string
  display_params: string
  callback:       { display_id: number; host: string }
}

interface TechniqueOverlay {
  commands: OverlayCommand[]
  tasks:    OverlayTask[]
}

// ── Constants ──────────────────────────────────────────

const TACTIC_ORDER = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution',
  'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access',
  'Discovery', 'Lateral Movement', 'Collection', 'Command And Control',
  'Exfiltration', 'Impact',
] as const

type Tactic = typeof TACTIC_ORDER[number]

const TACTIC_SHORT: Record<string, string> = {
  'Reconnaissance':       'Reconnaissance',
  'Resource Development': 'Resource Dev',
  'Initial Access':       'Initial Access',
  'Execution':            'Execution',
  'Persistence':          'Persistence',
  'Privilege Escalation': 'Privilege Esc',
  'Defense Evasion':      'Defense Evasion',
  'Credential Access':    'Credential Access',
  'Discovery':            'Discovery',
  'Lateral Movement':     'Lateral Movement',
  'Collection':           'Collection',
  'Command And Control':  'C2',
  'Exfiltration':         'Exfiltration',
  'Impact':               'Impact',
}

type ViewMode = 'none' | 'commands' | 'tasks'

// ── ATT&CK Navigator export ───────────────────────────

function exportNavigator(
  tacticMap: Map<string, AttackTechnique[]>,
  overlay:   Map<number, TechniqueOverlay>,
  mode:      ViewMode,
) {
  const layer = {
    name: 'Hecate Export',
    versions: { attack: '14', navigator: '4.9.1', layer: '4.5' },
    domain: 'enterprise-attack',
    description: 'Exported from Hecate',
    filters: { platforms: ['Windows', 'Linux', 'macOS'] },
    sorting: 0,
    layout: { layout: 'side', showID: true, showName: true },
    hideDisabled: false,
    techniques: [] as object[],
    gradient: { colors: ['#ff6666ff', '#ffe766ff', '#8ec843ff'], minValue: 0, maxValue: 100 },
    legendItems: [],
    metadata: [],
    links: [],
  }

  for (const [tactic, techs] of tacticMap) {
    for (const tech of techs) {
      const ov = overlay.get(tech.id)
      const hasData = mode === 'commands'
        ? (ov?.commands.length ?? 0) > 0
        : mode === 'tasks'
        ? (ov?.tasks.length ?? 0) > 0
        : false
      if (!hasData) continue
      layer.techniques.push({
        techniqueID:     tech.t_num,
        tactic:          tactic.replace(/ /g, '-').toLowerCase(),
        color:           '#bc3b24',
        enabled:         true,
        comment:         '',
        metadata:        [],
        links:           [],
        showSubtechniques: true,
      })
    }
  }

  const blob = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/octet-stream' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = 'attack_navigator.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── Detail panel ──────────────────────────────────────

function DetailPanel({
  tech,
  overlay,
  mode,
  onClose,
}: {
  tech:    AttackTechnique
  overlay: Map<number, TechniqueOverlay>
  mode:    ViewMode
  onClose: () => void
}) {
  const ov = overlay.get(tech.id)
  const cmds  = ov?.commands ?? []
  const tasks = ov?.tasks    ?? []

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTNum}>{tech.t_num}</span>
        <span className={styles.detailName}>{tech.name}</span>
        {tech.os.length > 0 && (
          <span className={styles.detailOs}>{tech.os.join(' · ')}</span>
        )}
        <button className={styles.detailClose} onClick={onClose}>✕</button>
      </div>
      <div className={styles.detailBody}>
        {(mode === 'commands' || mode === 'none') && cmds.length > 0 && (
          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>commands ({cmds.length})</span>
            <div className={styles.detailList}>
              {cmds.map((c, i) => (
                <span key={i} className={styles.detailCmd}>
                  <span className={styles.detailCmdName}>{c.cmd}</span>
                  <span className={styles.detailAgent} style={{ color: agentColor(c.payloadtype.name) }}>{c.payloadtype.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {(mode === 'tasks' || mode === 'none') && tasks.length > 0 && (
          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>executed tasks ({tasks.length})</span>
            <div className={styles.detailList}>
              {tasks.map((t) => (
                <span key={t.id} className={styles.detailTask}>
                  <span className={styles.detailTaskId}>#{t.display_id}</span>
                  <span className={styles.detailTaskCmd}>{t.command_name}{t.display_params ? ` ${t.display_params}` : ''}</span>
                  <span className={styles.detailTaskHost}>{t.callback.host}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {cmds.length === 0 && tasks.length === 0 && (
          <span className={styles.detailEmpty}>no mapping data loaded — use toolbar buttons to load commands or tasks</span>
        )}
      </div>
    </div>
  )
}

// ── Technique cell ────────────────────────────────────

function TechCell({
  tech,
  overlay,
  mode,
  selected,
  onClick,
}: {
  tech:     AttackTechnique
  overlay:  Map<number, TechniqueOverlay>
  mode:     ViewMode
  selected: boolean
  onClick:  () => void
}) {
  const ov       = overlay.get(tech.id)
  const cmdCount  = ov?.commands.length ?? 0
  const taskCount = ov?.tasks.length    ?? 0
  const hasCmds   = cmdCount  > 0
  const hasTasks  = taskCount > 0
  const hasBoth   = hasCmds && hasTasks

  let cellClass = styles.cell
  if (selected)         cellClass += ' ' + styles.cellSelected
  else if (hasBoth)     cellClass += ' ' + styles.cellBoth
  else if (hasTasks)    cellClass += ' ' + styles.cellTasks
  else if (hasCmds)     cellClass += ' ' + styles.cellCmds

  const count = mode === 'commands' ? cmdCount : mode === 'tasks' ? taskCount : 0

  return (
    <button className={cellClass} onClick={onClick} title={`${tech.t_num} · ${tech.name}`}>
      <span className={styles.cellTNum}>{tech.t_num}</span>
      <span className={styles.cellName}>{tech.name}</span>
      {count > 0 && <span className={styles.cellBadge}>{count}</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────

export function AttackPanel() {
  const [mode,     setMode]     = useState<ViewMode>('none')
  const [selected, setSelected] = useState<AttackTechnique | null>(null)
  const [loading,  setLoading]  = useState(false)

  // overlay: attack.id → { commands, tasks }
  const [overlay, setOverlay] = useState<Map<number, TechniqueOverlay>>(new Map())

  // ── Load techniques ──────────────────────────────────
  const { data: attackData, loading: attackLoading } = useQuery(GET_ATTACK, {
    fetchPolicy: 'cache-first',
  })

  const techniques: AttackTechnique[] = useMemo(() => {
    if (!attackData?.attack) return []
    return (attackData.attack as AttackRow[]).map(r => ({
      id:      r.id,
      t_num:   r.t_num,
      name:    r.name,
      os:      safeParseJson<string[]>(r.os, []),
      tactics: safeParseJson<string[]>(r.tactic, []),
    }))
  }, [attackData])

  // tacticMap: tactic name → sorted techniques
  const tacticMap = useMemo<Map<string, AttackTechnique[]>>(() => {
    const m = new Map<string, AttackTechnique[]>(TACTIC_ORDER.map(t => [t, []]))
    for (const tech of techniques) {
      for (const tactic of tech.tactics) {
        if (m.has(tactic)) m.get(tactic)!.push(tech)
      }
    }
    return m
  }, [techniques])

  const techById = useMemo<Map<number, AttackTechnique>>(() => {
    return new Map(techniques.map(t => [t.id, t]))
  }, [techniques])

  // ── Lazy queries ──────────────────────────────────────
  const [fetchCommands] = useLazyQuery(GET_ATTACK_COMMANDS, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const next = new Map<number, TechniqueOverlay>()
      for (const row of (data.attackcommand ?? [])) {
        if (!next.has(row.attack_id)) next.set(row.attack_id, { commands: [], tasks: [] })
        next.get(row.attack_id)!.commands.push(row.command)
      }
      // preserve tasks from previous load
      for (const [id, prev] of overlay) {
        if (!next.has(id)) next.set(id, { commands: [], tasks: prev.tasks })
        else next.get(id)!.tasks = prev.tasks
      }
      setOverlay(next)
      setMode('commands')
      setLoading(false)
    },
  })

  const [fetchTasks] = useLazyQuery(GET_ATTACK_TASKS, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const next = new Map<number, TechniqueOverlay>()
      for (const row of (data.attacktask ?? [])) {
        if (!next.has(row.attack_id)) next.set(row.attack_id, { commands: [], tasks: [] })
        next.get(row.attack_id)!.tasks.push(row.task)
      }
      // preserve commands from previous load
      for (const [id, prev] of overlay) {
        if (!next.has(id)) next.set(id, { commands: prev.commands, tasks: [] })
        else next.get(id)!.commands = prev.commands
      }
      setOverlay(next)
      setMode('tasks')
      setLoading(false)
    },
  })

  const onLoadCommands = useCallback(() => {
    setLoading(true)
    fetchCommands()
  }, [fetchCommands])

  const onLoadTasks = useCallback(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  const onExport = useCallback(() => {
    exportNavigator(tacticMap, overlay, mode)
  }, [tacticMap, overlay, mode])

  const totalTechs  = techniques.length
  const coveredCmds = useMemo(() => [...overlay.values()].filter(v => v.commands.length > 0).length, [overlay])
  const coveredTasks = useMemo(() => [...overlay.values()].filter(v => v.tasks.length > 0).length, [overlay])

  return (
    <div className={styles.panel}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>MITRE ATT&CK</span>
          {!attackLoading && (
            <span className={styles.meta}>
              {totalTechs} techniques
              {mode === 'commands' && ` · ${coveredCmds} covered by commands`}
              {mode === 'tasks'    && ` · ${coveredTasks} executed this operation`}
            </span>
          )}
          {(attackLoading || loading) && <span className={styles.meta}>loading…</span>}
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.modeBtns}>
            <button
              className={`${styles.modeBtn} ${mode === 'none' ? styles.modeBtnActive : ''}`}
              onClick={() => { setMode('none'); setSelected(null) }}
            >techniques</button>
            <button
              className={`${styles.modeBtn} ${mode === 'commands' ? styles.modeBtnActive : ''}`}
              onClick={onLoadCommands}
              disabled={loading}
            >commands</button>
            <button
              className={`${styles.modeBtn} ${mode === 'tasks' ? styles.modeBtnActive : ''}`}
              onClick={onLoadTasks}
              disabled={loading}
            >tasks</button>
          </div>
          <button
            className={styles.exportBtn}
            onClick={onExport}
            disabled={mode === 'none'}
            title="Export highlighted techniques to ATT&CK Navigator JSON"
          >↓ navigator</button>
        </div>
      </div>

      {/* ── Legend ── */}
      {mode !== 'none' && (
        <div className={styles.legend}>
          <span className={`${styles.legendDot} ${styles.cellCmds}`} />
          <span className={styles.legendLabel}>has commands</span>
          <span className={`${styles.legendDot} ${styles.cellTasks}`} />
          <span className={styles.legendLabel}>executed</span>
          <span className={`${styles.legendDot} ${styles.cellBoth}`} />
          <span className={styles.legendLabel}>both</span>
        </div>
      )}

      {/* ── ATT&CK grid ── */}
      <div className={styles.grid}>
        {TACTIC_ORDER.map(tactic => {
          const techs = tacticMap.get(tactic) ?? []
          const covered = techs.filter(t => {
            const ov = overlay.get(t.id)
            return mode === 'commands' ? (ov?.commands.length ?? 0) > 0
              : mode === 'tasks'    ? (ov?.tasks.length    ?? 0) > 0
              : false
          }).length
          return (
            <div key={tactic} className={styles.column}>
              <div className={styles.colHeader}>
                <span className={styles.colTitle}>{TACTIC_SHORT[tactic]}</span>
                <span className={styles.colCount}>
                  {mode === 'none' ? `${techs.length}` : `${covered}/${techs.length}`}
                </span>
              </div>
              <div className={styles.colBody}>
                {techs.map(tech => (
                  <TechCell
                    key={tech.id}
                    tech={tech}
                    overlay={overlay}
                    mode={mode}
                    selected={selected?.id === tech.id}
                    onClick={() => setSelected(s => s?.id === tech.id ? null : tech)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <DetailPanel
          tech={selected}
          overlay={overlay}
          mode={mode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── Util ──────────────────────────────────────────────

function safeParseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T } catch { return fallback }
}
