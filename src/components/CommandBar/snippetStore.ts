// Per-operator snippet library — localStorage backed.
// Snippets are plain command strings, no templating.

export interface Snippet {
  id:      string
  name:    string
  command: string
}

const KEY = 'hecate_snippets'

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is Snippet =>
        typeof s?.id === 'string' &&
        typeof s?.name === 'string' &&
        typeof s?.command === 'string',
    )
  } catch {
    return []
  }
}

export function saveSnippets(list: Snippet[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function addSnippet(name: string, command: string): Snippet {
  const list = loadSnippets()
  const snip: Snippet = { id: genId(), name: name.trim(), command: command.trim() }
  saveSnippets([snip, ...list])
  return snip
}

export function updateSnippet(id: string, name: string, command: string): void {
  const list = loadSnippets().map(s =>
    s.id === id ? { ...s, name: name.trim(), command: command.trim() } : s
  )
  saveSnippets(list)
}

export function removeSnippet(id: string): void {
  saveSnippets(loadSnippets().filter(s => s.id !== id))
}
