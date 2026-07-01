/* src/components/TaskFeed/browserScript.ts
   Mythic browser-script engine. Every Mythic command ships a JavaScript
   browserscript (stored in the DB) that conforms to a single spec:

     function(task, responses){ ... return { plaintext?, table?, ... } }

   `responses` is the array of decoded response-text chunks for the task.
   The returned object may carry any of: plaintext, table[], screenshot[],
   media[], download[], search[], graph, tabs[]. Because the spec is uniform,
   one runner + one set of renderers works for every agent — no per-command
   hardcoding. Mirrors Mythic's ResponseDisplay.js compile/run path.
*/

// ── Result shape (Mythic spec) ────────────────────────

export interface BSHeader {
  plaintext:         string
  type?:             'string' | 'number' | 'size' | 'button'
  width?:            number
  fillWidth?:        boolean
  disableSort?:      boolean
  cellStyle?:        Record<string, string>
}

export type BSButtonType = 'task' | 'menu' | 'dictionary' | 'string' | 'table'
export type BSViewType   = 'dictionary' | 'string' | 'table'

export interface BSButtonOption {
  name?:             string
  type:              BSButtonType
  hoverText?:        string
  disabled?:         boolean
  startIcon?:        string
  startIconColor?:   string
  // task
  ui_feature?:       string
  cmd?:              string
  parameters?:       string | Record<string, unknown>
  getConfirmation?:  boolean
  acceptText?:       string
  openDialog?:       boolean
  // view (dictionary/string/table)
  title?:            string
  leftColumnTitle?:  string
  rightColumnTitle?: string
  value?:            unknown
}

// A cell button is the same shape as a menu option; menu buttons carry an
// option list in `value`, view buttons carry the payload to display.
export type BSButton = BSButtonOption

export interface BSCell {
  plaintext?:          string | number
  cellStyle?:          Record<string, string>
  copyIcon?:           boolean
  startIcon?:          string
  startIconColor?:     string
  startIconHoverText?: string
  endIcon?:            string
  endIconColor?:       string
  endIconHoverText?:   string
  plaintextHoverText?: string
  button?:             BSButton
}

export type BSRow = Record<string, BSCell> & { rowStyle?: Record<string, string> }

export interface BSTable {
  title?:   string
  headers:  BSHeader[]
  rows:     BSRow[]
}

export interface BSMedia   { agent_file_id: string; filename?: string; name?: string; plaintext?: string; hoverText?: string }
export interface BSDownload { agent_file_id: string; plaintext?: string; name?: string; hoverText?: string; variant?: string }
export interface BSSearch  { plaintext?: string; name?: string; hoverText?: string; search: string }
export interface BSGraphNode { id: string; name?: string; [k: string]: unknown }
export interface BSGraphEdge { source: string; target: string; [k: string]: unknown }
export interface BSGraph   { nodes?: BSGraphNode[]; edges?: BSGraphEdge[]; [k: string]: unknown }

export interface BSResult {
  plaintext?:  string
  table?:      BSTable[]
  screenshot?: BSMedia[]
  media?:      BSMedia[]
  download?:   BSDownload[]
  search?:     BSSearch[]
  graph?:      BSGraph
  tabs?:       BSTab[]
}

export interface BSTab extends BSResult { label?: string; name?: string }

// Minimal task shape the scripts read (they mostly touch task.status).
export interface BSTaskInput {
  id:          number
  display_id:  number
  status:      string
  command_name: string
  callback_id?: number
}

type ScriptFn = (task: BSTaskInput, responses: string[]) => BSResult

// ── Compile + cache ───────────────────────────────────
// Scripts are keyed by command_id and rarely change during a session, so cache
// the compiled function. ponytail: no TTL/invalidation — a browserscript edit
// needs a page reload to pick up, same as Mythic's no-cache-per-task behaviour
// is bounded anyway. Compilation is via Function() exactly like Mythic.

const cache = new Map<number, ScriptFn | null>()

export function compileScript(commandId: number, source: string): ScriptFn | null {
  if (cache.has(commandId)) return cache.get(commandId)!
  let fn: ScriptFn | null = null
  try {
    // eslint-disable-next-line no-new-func
    fn = Function(`"use strict";return(${source})`)() as ScriptFn
    if (typeof fn !== 'function') fn = null
  } catch (err) {
    console.warn('browserscript compile failed', commandId, err)
    fn = null
  }
  cache.set(commandId, fn)
  return fn
}

export function runScript(fn: ScriptFn, task: BSTaskInput, responses: string[]): BSResult | null {
  try {
    const res = fn(task, responses)
    if (!res || typeof res !== 'object' || Object.keys(res).length === 0) return null
    return res
  } catch (err) {
    console.warn('browserscript run failed', task.command_name, err)
    return null
  }
}

// ── Icon glyphs ───────────────────────────────────────
// Mythic maps icon names → FontAwesome. Hecate has no icon lib, so map the
// common set → unicode glyphs; unknown names render as-is (many are single
// chars already). Keeps cell start/end icons meaningful without a dependency.

const ICONS: Record<string, string> = {
  add: '＋', x: '✕', check: '✓', refresh: '↻',
  openfolder: '📂', folder: '📁', closedfolder: '📁',
  archive: '🗜', zip: '🗜', diskimage: '💿', executable: '⚙', cog: '⚙',
  word: '📄', excel: '📊', powerpoint: '📈', pdf: '📕', adobe: '📕',
  database: '🗄', key: '🔑', code: '📜', source: '📜',
  download: '⬇', upload: '⬆', image: '🖼', png: '🖼', jpg: '🖼',
  list: '☰', delete: '🗑', inject: '💉', kill: '☠', camera: '📷',
}

export function iconGlyph(name?: string): string {
  if (!name) return ''
  return ICONS[name.toLowerCase()] ?? name
}
