/* ═══════════════════════════════════════════════════
   src/components/ReportPanel/reportGenerator.ts
   Pure functions: report data → markdown / HTML string
   ═══════════════════════════════════════════════════ */

import { parseTs } from '@/components/Sidebar/utils'

// ── Types ─────────────────────────────────────────────

export interface ReportTask {
  id:            number
  display_id:    number
  command_name:  string
  display_params: string
  params:        string
  status:        string
  completed:     boolean
  timestamp:     string
  operator:      { username: string }
  callback:      { id: number; display_id: number; host: string; ip: string; user: string; os: string }
  response_count: number
  tags:          Array<{ tagtype: { name: string; color: string } }>
}

export interface ReportOptions {
  title:             string
  groupBy:           'chronological' | 'callback' | 'operator'
  includeTTPs:       boolean
  includeOperators:  boolean
  statusFilter:      'all' | 'completed' | 'errors'
  selectedCallbacks: Set<number>
  dateFrom:          string   // ISO or ''
  dateTo:            string   // ISO or ''
}

// ── Helpers ───────────────────────────────────────────

export function isMitreTtp(name: string): boolean {
  return /^T\d{4}(\.\d{3})?$/.test(name)
}

function fmtTs(iso: string): string {
  return parseTs(iso).toLocaleString([], {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function fmtDate(iso: string): string {
  return parseTs(iso).toLocaleDateString([], {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function statusSymbol(task: ReportTask): string {
  if (task.status.toLowerCase().includes('error')) return '✗'
  if (task.completed) return '✓'
  return '◌'
}

function displayArgs(task: ReportTask): string {
  return (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''
}

export function filterTasks(tasks: ReportTask[], opts: ReportOptions): ReportTask[] {
  return tasks.filter(t => {
    // Callback filter
    if (opts.selectedCallbacks.size > 0 && !opts.selectedCallbacks.has(t.callback.id)) return false

    // Status filter
    if (opts.statusFilter === 'completed' && !t.completed) return false
    if (opts.statusFilter === 'errors' && !t.status.toLowerCase().includes('error')) return false

    // Date range
    const ts = parseTs(t.timestamp).getTime()
    if (opts.dateFrom) {
      const from = new Date(opts.dateFrom).getTime()
      if (ts < from) return false
    }
    if (opts.dateTo) {
      const to = new Date(opts.dateTo).getTime()
      if (ts > to) return false
    }

    return true
  })
}

export function collectTtps(tasks: ReportTask[]): Array<{ name: string; color: string; count: number }> {
  const map = new Map<string, { color: string; count: number }>()
  tasks.forEach(t =>
    t.tags.forEach(tag => {
      if (isMitreTtp(tag.tagtype.name)) {
        const existing = map.get(tag.tagtype.name)
        if (existing) existing.count++
        else map.set(tag.tagtype.name, { color: tag.tagtype.color, count: 1 })
      }
    })
  )
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Markdown generator ────────────────────────────────

export function generateMarkdown(
  tasks: ReportTask[],
  opts:  ReportOptions,
  opName: string,
): string {
  const filtered = filterTasks(tasks, opts)
  const ttps     = opts.includeTTPs ? collectTtps(filtered) : []
  const lines: string[] = []

  const now    = new Date().toLocaleString([], { hour12: false })
  const oldest = filtered.length ? fmtDate(filtered[0].timestamp) : '—'
  const newest = filtered.length ? fmtDate(filtered[filtered.length - 1].timestamp) : '—'

  // ── Header ──
  lines.push(`# ${opts.title || 'Operation Report'}`)
  lines.push('')
  lines.push(`| | |`)
  lines.push(`|---|---|`)
  lines.push(`| **Operation** | ${opName} |`)
  lines.push(`| **Period** | ${oldest} → ${newest} |`)
  lines.push(`| **Generated** | ${now} |`)
  lines.push(`| **Tasks included** | ${filtered.length} |`)
  const uniqueCbs = new Set(filtered.map(t => t.callback.host)).size
  const uniqueOps = new Set(filtered.map(t => t.operator.username)).size
  lines.push(`| **Callbacks** | ${uniqueCbs} |`)
  lines.push(`| **Operators** | ${uniqueOps} |`)
  lines.push('')

  // ── MITRE summary ──
  if (opts.includeTTPs && ttps.length > 0) {
    lines.push(`## MITRE ATT&CK Coverage`)
    lines.push('')
    lines.push(`| Technique | Uses |`)
    lines.push(`|---|---|`)
    ttps.forEach(t => lines.push(`| \`${t.name}\` | ${t.count} |`))
    lines.push('')
  }

  // ── Task log ──
  lines.push(`## Task Log`)
  lines.push('')

  if (opts.groupBy === 'callback') {
    const byHost = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const k = `${t.callback.host} (${t.callback.ip})`
      const arr = byHost.get(k) ?? []
      arr.push(t)
      byHost.set(k, arr)
    })
    byHost.forEach((cbTasks, host) => {
      lines.push(`### ${host}`)
      lines.push('')
      appendTaskTable(lines, cbTasks, opts)
    })
  } else if (opts.groupBy === 'operator') {
    const byOp = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const k = t.operator.username
      const arr = byOp.get(k) ?? []
      arr.push(t)
      byOp.set(k, arr)
    })
    byOp.forEach((opTasks, op) => {
      lines.push(`### Operator: ${op}`)
      lines.push('')
      appendTaskTable(lines, opTasks, opts)
    })
  } else {
    appendTaskTable(lines, filtered, opts)
  }

  return lines.join('\n')
}

function appendTaskTable(lines: string[], tasks: ReportTask[], opts: ReportOptions) {
  const cols = ['Status', 'Time', 'Host', 'Command']
  if (opts.includeOperators) cols.push('Operator')
  if (opts.includeTTPs) cols.push('TTPs')
  lines.push(`| ${cols.join(' | ')} |`)
  lines.push(`| ${cols.map(() => '---').join(' | ')} |`)

  tasks.forEach(t => {
    const args  = displayArgs(t)
    const cmd   = args ? `\`${t.command_name} ${args}\`` : `\`${t.command_name}\``
    const ttpStr = opts.includeTTPs
      ? t.tags.filter(tag => isMitreTtp(tag.tagtype.name)).map(tag => `\`${tag.tagtype.name}\``).join(' ') || '—'
      : ''

    const row: string[] = [
      statusSymbol(t),
      fmtTs(t.timestamp),
      t.callback.host,
      cmd,
    ]
    if (opts.includeOperators) row.push(t.operator.username)
    if (opts.includeTTPs) row.push(ttpStr)

    lines.push(`| ${row.join(' | ')} |`)
  })
  lines.push('')
}

// ── HTML generator ────────────────────────────────────

export function generateHtml(
  tasks: ReportTask[],
  opts:  ReportOptions,
  opName: string,
): string {
  const filtered = filterTasks(tasks, opts)
  const ttps     = opts.includeTTPs ? collectTtps(filtered) : []
  const now      = new Date().toLocaleString([], { hour12: false })
  const oldest   = filtered.length ? fmtDate(filtered[0].timestamp) : '—'
  const newest   = filtered.length ? fmtDate(filtered[filtered.length - 1].timestamp) : '—'
  const uniqueCbs = new Set(filtered.map(t => t.callback.host)).size
  const uniqueOps = new Set(filtered.map(t => t.operator.username)).size

  function esc(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function taskRows(taskList: ReportTask[]): string {
    return taskList.map(t => {
      const args  = displayArgs(t)
      const cmd   = args ? `${esc(t.command_name)} <span class="args">${esc(args)}</span>` : esc(t.command_name)
      const ttpStr = opts.includeTTPs
        ? t.tags.filter(tag => isMitreTtp(tag.tagtype.name))
            .map(tag => `<span class="ttp">${esc(tag.tagtype.name)}</span>`).join(' ') || '—'
        : ''
      const sym   = statusSymbol(t)
      const cls   = t.status.toLowerCase().includes('error') ? 'err' : t.completed ? 'ok' : 'run'

      let row = `<tr>
        <td class="sym ${cls}">${sym}</td>
        <td class="ts">${fmtTs(t.timestamp)}</td>
        <td class="host">${esc(t.callback.host)}</td>
        <td class="cmd"><code>${cmd}</code></td>`
      if (opts.includeOperators) row += `<td class="op">${esc(t.operator.username)}</td>`
      if (opts.includeTTPs)      row += `<td class="ttps">${ttpStr}</td>`
      row += `</tr>`
      return row
    }).join('\n')
  }

  function taskSection(taskList: ReportTask[]): string {
    const cols = ['', 'Time', 'Host', 'Command']
    if (opts.includeOperators) cols.push('Operator')
    if (opts.includeTTPs) cols.push('TTPs')
    return `<table>
      <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${taskRows(taskList)}</tbody>
    </table>`
  }

  let taskLogHtml = ''
  if (opts.groupBy === 'callback') {
    const byHost = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const k = `${t.callback.host} (${t.callback.ip})`
      const arr = byHost.get(k) ?? []; arr.push(t); byHost.set(k, arr)
    })
    byHost.forEach((cbTasks, host) => {
      taskLogHtml += `<h3>${esc(host)}</h3>${taskSection(cbTasks)}`
    })
  } else if (opts.groupBy === 'operator') {
    const byOp = new Map<string, ReportTask[]>()
    filtered.forEach(t => {
      const arr = byOp.get(t.operator.username) ?? []; arr.push(t); byOp.set(t.operator.username, arr)
    })
    byOp.forEach((opTasks, op) => {
      taskLogHtml += `<h3>Operator: ${esc(op)}</h3>${taskSection(opTasks)}`
    })
  } else {
    taskLogHtml = taskSection(filtered)
  }

  const ttpSection = (opts.includeTTPs && ttps.length > 0) ? `
    <h2>MITRE ATT&amp;CK Coverage</h2>
    <table>
      <thead><tr><th>Technique</th><th>Uses</th></tr></thead>
      <tbody>
        ${ttps.map(t => `<tr><td><span class="ttp">${esc(t.name)}</span></td><td>${t.count}</td></tr>`).join('\n')}
      </tbody>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title || 'Operation Report')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Cinzel:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080604; color: #d8c8a4; font-family: 'Space Mono', monospace; font-size: 12px; line-height: 1.7; padding: 40px; }
  h1 { font-family: 'Cinzel', Georgia, serif; font-size: 22px; color: #f5ecd8; letter-spacing: .06em; border-bottom: 1px solid rgba(239,239,218,.30); padding-bottom: 12px; margin-bottom: 24px; }
  h2 { font-family: 'Cinzel', Georgia, serif; font-size: 14px; color: #ede0c4; letter-spacing: .08em; margin: 32px 0 14px; border-left: 3px solid #b52828; padding-left: 10px; }
  h3 { font-size: 11px; color: #EFEFDA; text-transform: uppercase; letter-spacing: .1em; margin: 22px 0 10px; }
  .meta-table { border-collapse: collapse; margin-bottom: 8px; }
  .meta-table td { padding: 3px 16px 3px 0; color: #b8a880; font-size: 10px; }
  .meta-table td:first-child { color: #887860; text-transform: uppercase; letter-spacing: .07em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .09em; color: #887860; padding: 5px 10px; border-bottom: 1px solid rgba(239,239,218,.18); }
  td { padding: 5px 10px; border-bottom: 1px solid rgba(239,239,218,.06); vertical-align: top; }
  tr:hover td { background: rgba(239,239,218,.04); }
  .sym { width: 20px; font-size: 12px; }
  .sym.ok  { color: #90d880; }
  .sym.err { color: #f07070; }
  .sym.run { color: #d03838; }
  .ts { color: #887860; font-size: 9px; white-space: nowrap; }
  .host { color: #EFEFDA; font-size: 10px; }
  .cmd code { font-family: 'Space Mono', monospace; font-size: 10px; color: #d8c8a4; }
  .args { color: #b8a880; }
  .op { color: #b8a880; font-size: 10px; }
  .ttps { }
  .ttp { display: inline-block; background: rgba(181,40,40,.18); border: 1px solid rgba(181,40,40,.35); color: #f07070; border-radius: 2px; padding: 0 4px; font-size: 9px; margin: 1px; }
  footer { margin-top: 48px; padding-top: 12px; border-top: 1px solid rgba(239,239,218,.12); font-size: 9px; color: #584838; }
</style>
</head>
<body>
  <h1>${esc(opts.title || 'Operation Report')}</h1>
  <table class="meta-table">
    <tr><td>Operation</td><td>${esc(opName)}</td></tr>
    <tr><td>Period</td><td>${esc(oldest)} → ${esc(newest)}</td></tr>
    <tr><td>Generated</td><td>${esc(now)}</td></tr>
    <tr><td>Tasks</td><td>${filtered.length}</td></tr>
    <tr><td>Callbacks</td><td>${uniqueCbs}</td></tr>
    <tr><td>Operators</td><td>${uniqueOps}</td></tr>
  </table>

  ${ttpSection}

  <h2>Task Log</h2>
  ${taskLogHtml}

  <footer>Generated by Hecate · ${esc(now)}</footer>
</body>
</html>`
}
