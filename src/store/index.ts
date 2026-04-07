import { create } from 'zustand'

export interface Callback {
  id: number; display_id: number; host: string; user: string; pid: number
  ip: string; os: string; architecture: string; domain: string
  integrity_level: number; sleep_info: string; description: string
  active: boolean; locked: boolean; last_checkin: string; init_callback: string
  payload: { payloadtype: { name: string }; description: string }
  callbackc2profiles: Array<{ c2profile: { name: string } }>
  operation: { name: string }
}

export interface Task {
  id: number; display_id: number
  command_name: string; display_params: string; params: string
  status: string; completed: boolean; timestamp: string
  operator: { username: string }
  callback: { id: number; display_id: number; host: string; ip: string }
  response_count: number
  tags: Array<{ tagtype: { name: string; color: string } }>
}

export interface Operation { id: number; name: string }

export interface HecateStore {
  token: string | null
  setToken: (t: string | null) => void
  activeOperation: Operation | null
  setActiveOperation: (op: Operation | null) => void
  selectedCallbackId: number | null
  setSelectedCallbackId: (id: number | null) => void
  callbacks: Callback[]
  setCallbacks: (cbs: Callback[]) => void
  currentTasks: Task[]
  setCurrentTasks: (tasks: Task[]) => void
  activeRailView: 'callbacks' | 'payloads' | 'services' | 'credentials' | 'files' | 'attack' | 'logs' | 'report'
  setActiveRailView: (v: HecateStore['activeRailView']) => void
}

export const useStore = create<HecateStore>((set) => ({
  token: sessionStorage.getItem('hecate_token'),
  setToken: (token) => {
    if (token) sessionStorage.setItem('hecate_token', token)
    else sessionStorage.removeItem('hecate_token')
    set({ token })
  },
  activeOperation: null,
  setActiveOperation: (op) => set({ activeOperation: op, selectedCallbackId: null, currentTasks: [] }),
  selectedCallbackId: null,
  setSelectedCallbackId: (id) => set({ selectedCallbackId: id, currentTasks: [] }),
  callbacks: [],
  setCallbacks: (callbacks) => set({ callbacks }),
  currentTasks: [],
  setCurrentTasks: (tasks) => set({ currentTasks: tasks }),
  activeRailView: 'callbacks',
  setActiveRailView: (v) => set({ activeRailView: v }),
}))

export const useSelectedCallback = () =>
  useStore((s) => s.callbacks.find((c) => c.id === s.selectedCallbackId) ?? null)

export const useAliveCallbacks = () =>
  useStore((s) => s.callbacks.filter((c) => c.active))
