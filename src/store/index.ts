import { create } from 'zustand'

export interface HecateSettings {
  fontSize:             'small' | 'normal' | 'large'
  toastsEnabled:        boolean
  toastDuration:        number   // ms
  callbackAliveMs:      number
  callbackIdleMs:       number
  showCallbackDisplayId: boolean
}

const SETTINGS_KEY = 'hecate_settings'
export const DEFAULT_SETTINGS: HecateSettings = {
  fontSize:             'normal',
  toastsEnabled:        true,
  toastDuration:        4500,
  callbackAliveMs:      60_000,
  callbackIdleMs:       600_000,
  showCallbackDisplayId: false,
}
function loadSettings(): HecateSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

export interface Callback {
  id: number; display_id: number; host: string; user: string; pid: number
  ip: string; os: string; architecture: string; domain: string
  integrity_level: number; sleep_info: string; description: string
  extra_info: string; cwd: string; impersonation_context: string
  active: boolean; locked: boolean; last_checkin: string; init_callback: string
  payload: {
    payloadtype: { name: string }
    description: string
    c2profileparametersinstances: Array<{ value: string; c2profileparameter: { name: string } }>
  }
  callbackc2profiles: Array<{ c2profile: { name: string } }>
  operation: { name: string }
  tasks: Array<{ params: string; timestamp: string }>
}

export interface Task {
  id: number; display_id: number
  command_name: string; display_params: string; params: string
  agent_task_id: string
  status: string; completed: boolean; timestamp: string
  operator: { username: string }
  callback: { id: number; display_id: number; host: string; ip: string }
  response_count: number
  tags: Array<{ tagtype: { name: string; color: string } }>
}

export interface Operation { id: number; name: string }

export interface CallbackPort {
  id: number
  callback_id: number
  local_port: number
  remote_port: number
  remote_ip: string
  port_type: string
  bytes_sent: number
  bytes_received: number
  updated_at: string
  callback: { host: string; display_id: number; payload: { payloadtype: { name: string } } }
  task: { display_id: number }
}

export interface CallbackEdge {
  id:             number
  source_id:      number
  destination_id: number
  c2profile:      { id: number; name: string; is_p2p: boolean }
}

export interface CallbackToast {
  id: number
  callbackId: number
  display_id: number
  host: string
  user: string
  agent: string
}

export interface ProxyToast {
  id: number
  portId: number
  portType: string
  localPort: number
  remoteIp: string
  remotePort: number
  callbackHost: string
  callbackDisplayId: number
  agent: string
}

export interface HecateStore {
  token: string | null
  setToken: (t: string | null) => void
  userId: number | null
  setUserId: (id: number | null) => void
  activeOperation: Operation | null
  setActiveOperation: (op: Operation | null) => void
  selectedCallbackId: number | null
  setSelectedCallbackId: (id: number | null) => void
  multiSelectedIds: number[]
  setMultiSelectedIds: (ids: number[]) => void
  callbackAnnotations: Record<number, string>
  setCallbackAnnotation: (displayId: number, color: string) => void
  activeCallbackPorts: CallbackPort[]
  setActiveCallbackPorts: (ports: CallbackPort[]) => void

  activeCallbackEdges: CallbackEdge[]
  setActiveCallbackEdges: (edges: CallbackEdge[]) => void
  callbacks: Callback[]
  setCallbacks: (cbs: Callback[]) => void
  currentTasks: Task[]
  setCurrentTasks: (tasks: Task[]) => void
  activeRailView: 'overview' | 'callbacks' | 'payloads' | 'services' | 'proxies' | 'credentials' | 'files' | 'attack' | 'logs' | 'report' | 'operations' | 'timeline' | 'eventing'
  setActiveRailView: (v: HecateStore['activeRailView']) => void
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  settings: HecateSettings
  updateSettings: (patch: Partial<HecateSettings>) => void
  isSettingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  toasts: CallbackToast[]
  addToast: (t: Omit<CallbackToast, 'id'>) => void
  removeToast: (id: number) => void
  proxyToasts: ProxyToast[]
  addProxyToast: (t: Omit<ProxyToast, 'id'>) => void
  removeProxyToast: (id: number) => void
  unresolvedWarnings: number
  setUnresolvedWarnings: (n: number) => void
}

export const useStore = create<HecateStore>((set) => ({
  token: sessionStorage.getItem('hecate_token'),
  setToken: (token) => {
    if (token) sessionStorage.setItem('hecate_token', token)
    else sessionStorage.removeItem('hecate_token')
    set({ token })
  },
  userId: sessionStorage.getItem('hecate_user_id') ? Number(sessionStorage.getItem('hecate_user_id')) : null,
  setUserId: (userId) => {
    if (userId) sessionStorage.setItem('hecate_user_id', String(userId))
    else sessionStorage.removeItem('hecate_user_id')
    set({ userId })
  },
  activeOperation: null,
  setActiveOperation: (op) => {
    let callbackAnnotations: Record<number, string> = {}
    if (op) {
      try {
        const raw = localStorage.getItem(`hecate_annot_${op.id}`)
        if (raw) callbackAnnotations = JSON.parse(raw) as Record<number, string>
      } catch { /* ignore */ }
    }
    set({ activeOperation: op, selectedCallbackId: null, multiSelectedIds: [], currentTasks: [], callbacks: [], callbackAnnotations, activeCallbackPorts: [], activeCallbackEdges: [], proxyToasts: [] })
  },
  selectedCallbackId: null,
  setSelectedCallbackId: (id) => set({ selectedCallbackId: id, currentTasks: [] }),
  multiSelectedIds: [],
  setMultiSelectedIds: (multiSelectedIds) => set({ multiSelectedIds }),
  activeCallbackPorts: [],
  setActiveCallbackPorts: (activeCallbackPorts) => set({ activeCallbackPorts }),
  activeCallbackEdges: [],
  setActiveCallbackEdges: (activeCallbackEdges) => set({ activeCallbackEdges }),
  callbackAnnotations: {},
  setCallbackAnnotation: (displayId, color) => set((s) => {
    const next = { ...s.callbackAnnotations }
    if (color) next[displayId] = color
    else delete next[displayId]
    if (s.activeOperation) {
      localStorage.setItem(`hecate_annot_${s.activeOperation.id}`, JSON.stringify(next))
    }
    return { callbackAnnotations: next }
  }),
  callbacks: [],
  setCallbacks: (callbacks) => set({ callbacks }),
  currentTasks: [],
  setCurrentTasks: (tasks) => set({ currentTasks: tasks }),
  activeRailView: 'callbacks',
  setActiveRailView: (v) => set({ activeRailView: v }),
  theme: (localStorage.getItem('hecate_theme') as 'dark' | 'light') ?? 'dark',
  setTheme: (theme) => {
    localStorage.setItem('hecate_theme', theme)
    set({ theme })
  },
  settings: loadSettings(),
  updateSettings: (patch) => set((s) => {
    const updated = { ...s.settings, ...patch }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated))
    return { settings: updated }
  }),
  isSettingsOpen: false,
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  toasts: [],
  addToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: Date.now() + Math.random() }] })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  proxyToasts: [],
  addProxyToast: (t) => set((s) => ({ proxyToasts: [...s.proxyToasts, { ...t, id: Date.now() + Math.random() }] })),
  removeProxyToast: (id) => set((s) => ({ proxyToasts: s.proxyToasts.filter((t) => t.id !== id) })),
  unresolvedWarnings: 0,
  setUnresolvedWarnings: (unresolvedWarnings) => set({ unresolvedWarnings }),
}))

export const useSelectedCallback = () =>
  useStore((s) => s.callbacks.find((c) => c.id === s.selectedCallbackId) ?? null)

export const useAliveCallbacks = () =>
  useStore((s) => s.callbacks.filter((c) => c.active))
